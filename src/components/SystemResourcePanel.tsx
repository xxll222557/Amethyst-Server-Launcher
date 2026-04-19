import type { SystemResourceSnapshot } from "../features/systemResource";
import { formatBytes, formatPercent } from "../features/systemResource";
import { useI18n } from "../i18n";

interface SystemResourcePanelProps {
  snapshot: SystemResourceSnapshot | null;
  refreshIntervalMs: number;
  onRefreshIntervalChange: (intervalMs: number) => void;
}

const REFRESH_INTERVAL_OPTIONS = [
  { key: "resource.interval.1s" as const, value: 1000 },
  { key: "resource.interval.2s" as const, value: 2000 },
  { key: "resource.interval.5s" as const, value: 5000 },
  { key: "resource.interval.10s" as const, value: 10000 },
] as const;

export function SystemResourcePanel({ snapshot, refreshIntervalMs, onRefreshIntervalChange }: SystemResourcePanelProps) {
  const { t } = useI18n();
  const cpuUsage = snapshot ? Math.max(0, Math.min(100, snapshot.cpuUsage)) : null;
  const memoryUsage =
    snapshot && snapshot.memoryTotal > 0 ? Math.max(0, Math.min(100, (snapshot.memoryUsed / snapshot.memoryTotal) * 100)) : null;
  const diskUsage =
    snapshot && snapshot.diskTotal > 0 ? Math.max(0, Math.min(100, (snapshot.diskUsed / snapshot.diskTotal) * 100)) : null;

  const gauges = [
    {
      label: "CPU",
      percent: cpuUsage,
      value: cpuUsage === null ? "--" : formatPercent(cpuUsage),
      hint: t("resource.hint.cpu"),
    },
    {
      label: t("resource.memory"),
      percent: memoryUsage,
      value: snapshot ? `${formatBytes(snapshot.memoryUsed)} / ${formatBytes(snapshot.memoryTotal)}` : "--",
      hint: memoryUsage === null ? t("resource.hint.waiting") : t("resource.hint.used", { percent: formatPercent(memoryUsage) }),
    },
    {
      label: t("resource.disk"),
      percent: diskUsage,
      value: snapshot ? `${formatBytes(snapshot.diskUsed)} / ${formatBytes(snapshot.diskTotal)}` : "--",
      hint: diskUsage === null ? t("resource.hint.waiting") : t("resource.hint.used", { percent: formatPercent(diskUsage) }),
    },
  ];

  const downloadText = snapshot ? formatBytes(snapshot.networkDownloadBps) : "--";
  const uploadText = snapshot ? formatBytes(snapshot.networkUploadBps) : "--";

  return (
    <section className="panel resource-panel">
      <div className="panel-header">
        <div>
          <p className="panel-label">{t("resource.label")}</p>
          <h3>{t("resource.title")}</h3>
        </div>
        <label className="resource-refresh-control">
          <span className="panel-badge">{t("resource.refreshRate")}</span>
          <select
            value={refreshIntervalMs}
            onChange={(event) => {
              onRefreshIntervalChange(Number(event.target.value));
            }}
            aria-label={t("resource.refreshRate")}
          >
            {REFRESH_INTERVAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.key)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="resource-gauge-grid">
        {gauges.map((gauge) => {
          const clamped = gauge.percent === null ? 0 : Math.max(0, Math.min(100, gauge.percent));
          const dashOffset = 0.75 * 314.16 * (1 - clamped / 100);
          const level =
            gauge.percent === null ? "idle" : clamped >= 80 ? "danger" : clamped >= 60 ? "warning" : "safe";

          return (
            <article className={`resource-gauge-card gauge-${level}`} key={gauge.label}>
              <p className="resource-gauge-label">{gauge.label}</p>

              <div
                className="resource-gauge"
                role="img"
                aria-label={
                  gauge.percent === null
                    ? t("resource.aria.usageUnknown", { label: gauge.label })
                    : t("resource.aria.usageKnown", { label: gauge.label, percent: formatPercent(clamped) })
                }
              >
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle className="resource-gauge-track" cx="60" cy="60" r="50" pathLength="314.16" />
                  <circle
                    className={`resource-gauge-progress gauge-${level}`}
                    cx="60"
                    cy="60"
                    r="50"
                    pathLength="314.16"
                    strokeDasharray="235.62 314.16"
                    strokeDashoffset={dashOffset}
                  />
                </svg>
                <strong>{gauge.percent === null ? "--" : formatPercent(clamped)}</strong>
              </div>

              <strong>{gauge.value}</strong>
              <span>{gauge.hint}</span>
            </article>
          );
        })}
      </div>

      <div className="resource-network-row" aria-label={t("resource.network")}> 
        <span className="resource-network-pill">
          <strong>{t("resource.network.download")}</strong>
          {`${downloadText}/s`}
        </span>
        <span className="resource-network-pill">
          <strong>{t("resource.network.upload")}</strong>
          {`${uploadText}/s`}
        </span>
      </div>
    </section>
  );
}
