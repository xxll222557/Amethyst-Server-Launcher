import { useEffect, useMemo, useState } from "react";
import { SystemResourcePanel } from "../components/SystemResourcePanel";
import {
  getInstanceProcessStatus,
  getInstances,
  type InstanceConfig,
} from "../features/instanceService";
import { getErrorText } from "../features/errorHandling";
import { getInstanceGoalLabelKey, getInstanceModeLabelKey } from "../features/instanceLabels";
import type { SystemResourceSnapshot } from "../features/systemResource";
import { useI18n } from "../i18n";

interface HomePageProps {
  systemResources: SystemResourceSnapshot | null;
  resourceRefreshIntervalMs: number;
  onResourceRefreshIntervalChange: (intervalMs: number) => void;
  onOpenInstances: (intent: "none" | "create" | "downloads" | "open-console", instanceId?: string) => void;
  onNotify: (payload: {
    tone: "success" | "error" | "info" | "danger";
    title: string;
    detail?: string;
    actionLabel?: string;
    onAction?: () => void;
    durationMs?: number;
  }) => void;
}

type InstanceQuickFilter = "all" | "running" | "not-ready";

function relativeTimeFrom(timestamp: number, t: (key: "time.justNow" | "time.secondsAgo" | "time.minutesAgo", vars?: Record<string, string | number>) => string) {
  const diff = Math.max(0, Date.now() - timestamp);
  if (diff < 10_000) {
    return t("time.justNow");
  }
  if (diff < 60_000) {
    return t("time.secondsAgo", { count: Math.floor(diff / 1000) });
  }
  return t("time.minutesAgo", { count: Math.floor(diff / 60_000) });
}

export function HomePage({
  systemResources,
  resourceRefreshIntervalMs,
  onResourceRefreshIntervalChange,
  onOpenInstances,
  onNotify,
}: HomePageProps) {
  const { t } = useI18n();
  const [instances, setInstances] = useState<InstanceConfig[]>([]);
  const [runningMap, setRunningMap] = useState<Record<string, boolean>>({});
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [quickFilter, setQuickFilter] = useState<InstanceQuickFilter>("all");

  const refreshHomeData = async (silent = false) => {
    setLoading(true);
    try {
      const nextInstances = await getInstances();
      setInstances(nextInstances);

      const statuses = await Promise.all(
        nextInstances.map(async (item) => {
          try {
            const status = await getInstanceProcessStatus(item.id);
            return [item.id, status.running] as const;
          } catch {
            return [item.id, false] as const;
          }
        }),
      );

      setRunningMap(Object.fromEntries(statuses));
      setLastUpdatedAt(Date.now());
      setMessage("");
      if (!silent) {
        onNotify({ tone: "success", title: t("home.refresh.success.title"), detail: t("home.refresh.success.detail") });
      }

      if (nextInstances.length === 0) {
        setSelectedInstanceId(null);
      } else if (!selectedInstanceId || !nextInstances.some((item) => item.id === selectedInstanceId)) {
        setSelectedInstanceId(nextInstances[0].id);
      }
    } catch (error) {
      const text = t("home.refresh.error.detail", { error: getErrorText(error) });
      setMessage(text);
      if (!silent) {
        onNotify({ tone: "error", title: t("home.refresh.error.title"), detail: text });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshHomeData(true);
  }, []);

  const showSkeleton = loading && instances.length === 0;

  const runningCount = useMemo(() => instances.filter((item) => runningMap[item.id]).length, [instances, runningMap]);
  const coreReadyCount = useMemo(() => instances.filter((item) => item.coreDownloaded).length, [instances]);
  const notReadyCount = Math.max(0, instances.length - coreReadyCount);

  const filterCounts = {
    all: instances.length,
    running: runningCount,
    "not-ready": notReadyCount,
  } as const;

  const filteredInstances = useMemo(() => {
    if (quickFilter === "running") {
      return instances.filter((item) => Boolean(runningMap[item.id]));
    }

    if (quickFilter === "not-ready") {
      return instances.filter((item) => !item.coreDownloaded);
    }

    return instances;
  }, [instances, quickFilter, runningMap]);

  return (
    <div className="home-app-layout">
      <SystemResourcePanel
        snapshot={systemResources}
        refreshIntervalMs={resourceRefreshIntervalMs}
        onRefreshIntervalChange={onResourceRefreshIntervalChange}
      />

      {message && <p className="instance-message">{message}</p>}

      <section className="workspace-grid home-workspace-grid">
        <article className="panel panel-large home-instance-panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">{t("home.instances.label")}</p>
              <h3>{t("home.instances.title")}</h3>
            </div>
            <div className="home-toolbar-strip">
              <div className="home-instance-filters" role="tablist" aria-label={t("home.filters.aria")}>
                <button
                  className={`home-filter-chip ${quickFilter === "all" ? "active" : ""}`}
                  type="button"
                  onClick={() => setQuickFilter("all")}
                >
                  {t("home.filters.all")} {filterCounts.all}
                </button>
                <button
                  className={`home-filter-chip ${quickFilter === "running" ? "active" : ""}`}
                  type="button"
                  onClick={() => setQuickFilter("running")}
                >
                  {t("home.filters.running")} {filterCounts.running}
                </button>
                <button
                  className={`home-filter-chip ${quickFilter === "not-ready" ? "active" : ""}`}
                  type="button"
                  onClick={() => setQuickFilter("not-ready")}
                >
                  {t("home.filters.notReady")} {filterCounts["not-ready"]}
                </button>
              </div>

              <div className="hero-actions home-header-actions">
              <button className="chip-button" type="button" onClick={() => void refreshHomeData()} disabled={loading}>
                {loading ? t("home.actions.refreshing") : t("home.actions.refresh")}
              </button>
              <button className="ghost-action" type="button" onClick={() => onOpenInstances("none")}>
                {t("home.actions.viewAll")}
              </button>
              </div>
            </div>
          </div>

          <p className="instance-message home-instance-summary">
            {t("home.summary", {
              total: instances.length,
              running: runningCount,
              ready: coreReadyCount,
              updated: lastUpdatedAt ? relativeTimeFrom(lastUpdatedAt, t) : t("home.updated.none"),
            })}
          </p>

          <div className="server-list home-instance-list">
            {showSkeleton &&
              Array.from({ length: 3 }).map((_, index) => (
                <article className="server-card skeleton-card" key={`skeleton-instance-${index}`}>
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line short" />
                  <div className="skeleton-line long" />
                </article>
              ))}

            {!showSkeleton &&
              filteredInstances.map((instance) => {
              const running = Boolean(runningMap[instance.id]);
              return (
                <article
                  className={`server-card ${selectedInstanceId === instance.id ? "selected" : ""}`}
                  key={instance.id}
                  onClick={() => setSelectedInstanceId(instance.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedInstanceId(instance.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="server-main">
                    <div>
                      <h4>{instance.name}</h4>
                      <p>
                        {instance.serverType} {instance.version}
                      </p>
                      <p className="instance-detail-line">
                        <span className="status-pill warning">{t(getInstanceModeLabelKey(instance.creationMode))}</span>
                        <span className="status-pill muted">{t(getInstanceGoalLabelKey(instance.serverGoal))}</span>
                      </p>
                    </div>
                    <span className={`status-pill ${running ? "good" : "muted"}`}>{running ? t("home.instance.running") : t("home.instance.stopped")}</span>
                  </div>

                  <div className="server-meta">
                    <span>
                      {t("home.instance.memory", { min: instance.minMemoryMb, max: instance.maxMemoryMb })}
                    </span>
                    <span>{instance.coreDownloaded ? t("home.instance.coreReady") : t("home.instance.coreMissing")}</span>
                  </div>
                </article>
              );
              })}

            {instances.length === 0 && !loading && !showSkeleton && (
              <article className="server-card">
                <h4>{t("home.empty.instances")}</h4>
                <p>{t("home.empty.instances.hint")}</p>
              </article>
            )}

            {instances.length > 0 && filteredInstances.length === 0 && !loading && !showSkeleton && (
              <article className="server-card">
                <h4>{t("home.empty.filter")}</h4>
                <p>{t("home.empty.filter.hint")}</p>
              </article>
            )}
          </div>
          <div className="hero-actions home-footer-actions">
            <button
              className="chip-button"
              type="button"
              onClick={() => {
                if (selectedInstanceId) {
                  onOpenInstances("open-console", selectedInstanceId);
                  return;
                }
                onOpenInstances("none");
              }}
              disabled={!selectedInstanceId}
            >
              {t("home.actions.openConsole")}
            </button>
            <button className="chip-button" type="button" onClick={() => onOpenInstances("downloads")}>
              {t("home.actions.downloads")}
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}
