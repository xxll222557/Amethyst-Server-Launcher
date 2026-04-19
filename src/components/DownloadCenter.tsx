import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "../i18n";

const DOWNLOAD_HIDE_COMPLETED_KEY = "asl-download-hide-completed-v1";
const DOWNLOAD_ONLY_FAILED_KEY = "asl-download-only-failed-v1";

export interface DownloadTaskView {
  id: string;
  instanceId: string;
  instanceName: string;
  item: string;
  progress: number;
  speedText: string;
  status: "queued" | "downloading" | "completed" | "failed";
  message: string;
  logs: string[];
  updatedAt: number;
  retryType?: "core" | "java-runtime";
  includeJava?: boolean;
  marketItemId?: string;
  marketCategory?: "server" | "plugin" | "modpack" | "java";
  fileName?: string;
}

interface DownloadCenterProps {
  open: boolean;
  tasks: DownloadTaskView[];
  onToggleOpen: () => void;
  onClose: () => void;
  onRetryTask?: (task: DownloadTaskView) => void;
}

function statusLabel(
  status: DownloadTaskView["status"],
  t: (
    key:
      | "downloadCenter.status.downloading"
      | "downloadCenter.status.completed"
      | "downloadCenter.status.failed"
      | "downloadCenter.status.queued",
  ) => string,
) {
  if (status === "downloading") {
    return t("downloadCenter.status.downloading");
  }
  if (status === "completed") {
    return t("downloadCenter.status.completed");
  }
  if (status === "failed") {
    return t("downloadCenter.status.failed");
  }
  return t("downloadCenter.status.queued");
}

export function DownloadCenter({ open, tasks, onToggleOpen, onClose, onRetryTask }: DownloadCenterProps) {
  const { t } = useI18n();
  const [hideCompleted, setHideCompleted] = useState(() => window.localStorage.getItem(DOWNLOAD_HIDE_COMPLETED_KEY) === "1");
  const [showOnlyFailed, setShowOnlyFailed] = useState(() => window.localStorage.getItem(DOWNLOAD_ONLY_FAILED_KEY) === "1");
  const activeCount = tasks.filter((task) => task.status === "downloading" || task.status === "queued").length;
  const hasActiveTask = activeCount > 0;
  const prevActiveCountRef = useRef(activeCount);
  const [startPop, setStartPop] = useState(false);
  const [dismissedCompletedIds, setDismissedCompletedIds] = useState<string[]>([]);

  useEffect(() => {
    const existingIds = new Set(tasks.map((task) => task.id));
    setDismissedCompletedIds((prev) => prev.filter((id) => existingIds.has(id)));
  }, [tasks]);

  useEffect(() => {
    window.localStorage.setItem(DOWNLOAD_HIDE_COMPLETED_KEY, hideCompleted ? "1" : "0");
  }, [hideCompleted]);

  useEffect(() => {
    window.localStorage.setItem(DOWNLOAD_ONLY_FAILED_KEY, showOnlyFailed ? "1" : "0");
  }, [showOnlyFailed]);

  useEffect(() => {
    const prevActiveCount = prevActiveCountRef.current;
    const startedNewTask = prevActiveCount === 0 && activeCount > 0;

    if (startedNewTask) {
      if (!open) {
        onToggleOpen();
      }

      setStartPop(true);
      const timer = window.setTimeout(() => {
        setStartPop(false);
      }, 460);

      prevActiveCountRef.current = activeCount;
      return () => {
        window.clearTimeout(timer);
      };
    }

    prevActiveCountRef.current = activeCount;
  }, [activeCount, onToggleOpen, open]);

  if (!hasActiveTask && !open) {
    return null;
  }

  const survivingTasks = tasks.filter((task) => !dismissedCompletedIds.includes(task.id));
  const visibleTasks = survivingTasks.filter((task) => {
    if (hideCompleted && task.status === "completed") {
      return false;
    }

    if (showOnlyFailed && task.status !== "failed") {
      return false;
    }

    return true;
  });
  const completedCount = survivingTasks.filter((task) => task.status === "completed").length;

  return (
    <div className="download-center-root">
      {open && (
        <section className={`download-center-panel ${startPop ? "task-started" : ""}`} aria-label={t("downloadCenter.aria.panel")}>
          <div className="download-center-header">
            <div>
              <p className="panel-label">{t("downloadCenter.label")}</p>
              <h4>{t("downloadCenter.title")}</h4>
            </div>
            <button className="ghost-action" type="button" onClick={onClose}>
              {t("downloadCenter.close")}
            </button>
          </div>

          <div className="download-center-controls">
            <button
              className={`download-toggle-chip ${hideCompleted ? "active" : ""}`}
              type="button"
              onClick={() => setHideCompleted((prev) => !prev)}
              aria-pressed={hideCompleted}
            >
              {t("downloadCenter.hideCompleted")}
            </button>
            <button
              className={`download-toggle-chip ${showOnlyFailed ? "active" : ""}`}
              type="button"
              onClick={() => setShowOnlyFailed((prev) => !prev)}
              aria-pressed={showOnlyFailed}
            >
              {t("downloadCenter.onlyFailed")}
            </button>
            <button
              className="chip-button"
              type="button"
              onClick={() => {
                const completedIds = survivingTasks
                  .filter((task) => task.status === "completed")
                  .map((task) => task.id);
                setDismissedCompletedIds((prev) => [...new Set([...prev, ...completedIds])]);
              }}
              disabled={completedCount === 0}
            >
              {t("downloadCenter.cleanup", { count: completedCount })}
            </button>
          </div>

          <div className="download-center-list">
            {visibleTasks.map((task, index) => (
              <article
                className="download-task-card"
                key={task.id}
                style={{ "--task-index": index } as CSSProperties}
              >
                <div className="download-task-main">
                  <div>
                    <h5>{task.instanceName}</h5>
                    <p>{task.item}</p>
                  </div>
                  <span className={`status-pill ${task.status === "failed" ? "warning" : "good"}`}>
                    {statusLabel(task.status, t)}
                  </span>
                </div>

                <div className="download-progress-track compact" aria-label={t("downloadCenter.progressAria")}>
                  <span className="download-progress-fill" style={{ width: `${task.progress}%` }} />
                </div>

                <div className="download-task-meta">
                  <span>{Math.floor(task.progress)}%</span>
                  <span>{task.speedText}</span>
                  <span>{task.message}</span>
                </div>

                {task.status === "failed" && onRetryTask && (
                  <div className="download-task-actions">
                    <button className="chip-button" type="button" onClick={() => onRetryTask(task)}>
                      {t("downloadCenter.retry")}
                    </button>
                  </div>
                )}

                <div className="download-task-logs" role="log" aria-live="polite">
                  {task.logs.slice(-6).map((logLine) => (
                    <p key={`${task.id}-${logLine}`}>{logLine}</p>
                  ))}
                </div>
              </article>
            ))}

            {visibleTasks.length === 0 && (
              <article className="download-task-card">
                <p className="instance-message">{t("downloadCenter.empty")}</p>
              </article>
            )}
          </div>
        </section>
      )}

      {hasActiveTask && (
        <button className="download-fab" type="button" onClick={onToggleOpen} aria-label={t("downloadCenter.openFab")}>
          <span>{activeCount}</span>
        </button>
      )}
    </div>
  );
}
