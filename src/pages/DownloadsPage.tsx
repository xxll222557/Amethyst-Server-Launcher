import { useEffect, useMemo, useState } from "react";
import type { DownloadTaskView } from "../components/DownloadCenter";
import { useI18n } from "../i18n";

type DownloadsSection = "all" | "completed" | "pending" | "failed";

interface DownloadsPageProps {
  tasks: DownloadTaskView[];
  onRetryTask?: (task: DownloadTaskView) => void;
}

function DownloadsSectionIcon({ section }: { section: DownloadsSection }) {
  if (section === "all") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.6" y="5" width="14.8" height="3.8" rx="1.1" />
        <rect x="4.6" y="10.1" width="14.8" height="3.8" rx="1.1" />
        <rect x="4.6" y="15.2" width="14.8" height="3.8" rx="1.1" />
      </svg>
    );
  }

  if (section === "completed") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.2" />
        <path d="m8.7 12.1 2.2 2.2 4.4-4.4" />
      </svg>
    );
  }

  if (section === "pending") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.2" />
        <path d="M12 8.3v4.1" />
        <path d="M12 12.4h3.1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.2" />
      <path d="M9.4 9.4 14.6 14.6" />
      <path d="M14.6 9.4 9.4 14.6" />
    </svg>
  );
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

export function DownloadsPage({ tasks, onRetryTask }: DownloadsPageProps) {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<DownloadsSection>("all");
  const [dismissedCompletedIds, setDismissedCompletedIds] = useState<string[]>([]);

  useEffect(() => {
    const existingIds = new Set(tasks.map((task) => task.id));
    setDismissedCompletedIds((prev) => prev.filter((id) => existingIds.has(id)));
  }, [tasks]);

  const survivingTasks = useMemo(
    () => tasks.filter((task) => !dismissedCompletedIds.includes(task.id)),
    [dismissedCompletedIds, tasks],
  );

  const counts = useMemo(
    () => ({
      all: survivingTasks.length,
      completed: survivingTasks.filter((task) => task.status === "completed").length,
      pending: survivingTasks.filter((task) => task.status === "queued" || task.status === "downloading").length,
      failed: survivingTasks.filter((task) => task.status === "failed").length,
    }),
    [survivingTasks],
  );

  const visibleTasks = useMemo(
    () => {
      if (activeSection === "completed") {
        return survivingTasks.filter((task) => task.status === "completed");
      }

      if (activeSection === "pending") {
        return survivingTasks.filter((task) => task.status === "queued" || task.status === "downloading");
      }

      if (activeSection === "failed") {
        return survivingTasks.filter((task) => task.status === "failed");
      }

      return survivingTasks;
    },
    [activeSection, survivingTasks],
  );

  const activeCount = tasks.filter((task) => task.status === "downloading" || task.status === "queued").length;
  const failedCount = tasks.filter((task) => task.status === "failed").length;
  const completedCount = survivingTasks.filter((task) => task.status === "completed").length;

  const navItems: Array<{
    key: DownloadsSection;
    titleKey:
      | "downloads.nav.all"
      | "downloads.nav.completed"
      | "downloads.nav.pending"
      | "downloads.nav.failed";
    descKey:
      | "downloads.nav.all.desc"
      | "downloads.nav.completed.desc"
      | "downloads.nav.pending.desc"
      | "downloads.nav.failed.desc";
  }> = [
    { key: "all", titleKey: "downloads.nav.all", descKey: "downloads.nav.all.desc" },
    { key: "completed", titleKey: "downloads.nav.completed", descKey: "downloads.nav.completed.desc" },
    { key: "pending", titleKey: "downloads.nav.pending", descKey: "downloads.nav.pending.desc" },
    { key: "failed", titleKey: "downloads.nav.failed", descKey: "downloads.nav.failed.desc" },
  ];

  const emptyTextKey =
    activeSection === "completed"
      ? "downloads.page.empty.completed"
      : activeSection === "pending"
        ? "downloads.page.empty.pending"
        : activeSection === "failed"
          ? "downloads.page.empty.failed"
          : "downloads.page.empty";

  return (
    <section className="panel page-panel downloads-page" aria-label={t("downloadCenter.aria.panel")}>
      <div className="downloads-workspace">
        <aside className="downloads-side-nav" aria-label={t("downloads.nav.aria")}>
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`downloads-side-item ${activeSection === item.key ? "active" : ""}`}
              type="button"
              onClick={() => setActiveSection(item.key)}
            >
              <span className="downloads-nav-icon" aria-hidden="true">
                <DownloadsSectionIcon section={item.key} />
              </span>
              <span className="downloads-side-copy">
                <strong>{t(item.titleKey)}</strong>
                <span>{t(item.descKey)}</span>
              </span>
              <span className="status-pill muted">{counts[item.key]}</span>
            </button>
          ))}
        </aside>

        <section className="downloads-content">
          <div className="panel-header downloads-header">
            <div>
              <p className="panel-label">{t("downloadCenter.label")}</p>
              <h3>{t("downloads.page.title")}</h3>
            </div>
            <div className="downloads-summary">
              <span className="status-pill muted">{t("downloads.summary.active", { count: activeCount })}</span>
              <span className="status-pill warning">{t("downloads.summary.failed", { count: failedCount })}</span>
            </div>
          </div>

          <p className="instance-message">{t("downloads.page.desc")}</p>

          <div className="download-center-controls downloads-controls-inline">
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

          <div className="downloads-list">
            {visibleTasks.map((task) => (
              <article className="downloads-item" key={task.id}>
                <div className="downloads-item-main">
                  <div>
                    <h4>{task.instanceName}</h4>
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
                  {task.logs.slice(-8).map((logLine) => (
                    <p key={`${task.id}-${logLine}`}>{logLine}</p>
                  ))}
                </div>
              </article>
            ))}

            {visibleTasks.length === 0 && (
              <article className="downloads-item downloads-empty">
                <p>{t(emptyTextKey)}</p>
              </article>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
