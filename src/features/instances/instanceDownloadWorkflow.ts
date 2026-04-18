import type { DownloadTaskView } from "../../components/DownloadCenter";
import type { DownloadResult, DownloadProgressEvent, InstanceConfig } from "../instanceService";
import type { TranslationKey } from "../../i18n";

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export const MAX_DOWNLOAD_RETRIES = 2;

export interface SpeedSampleMap {
  [instanceId: string]: {
    bytes: number;
    at: number;
  };
}

function formatSpeed(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return "0 B/s";
  }

  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`;
  }

  if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }

  return `${bytesPerSecond.toFixed(0)} B/s`;
}

export function formatTaskLogLine(message: string, locale: string) {
  const stamp = new Date().toLocaleTimeString(locale, { hour12: false });
  return `[${stamp}] ${message}`;
}

export function getDownloadItemLabel(item: string, t: Translate) {
  if (item === "java-runtime") {
    return t("instances.javaItem");
  }
  if (item === "server-core") {
    return t("instances.coreItem");
  }
  return item;
}

export async function retryWithBackoff<T>(
  action: (attempt: number) => Promise<T>,
  options: {
    onRetry?: (attempt: number, delayMs: number) => void;
  },
) {
  let attempt = 0;
  while (attempt <= MAX_DOWNLOAD_RETRIES) {
    try {
      return await action(attempt);
    } catch (error) {
      if (attempt >= MAX_DOWNLOAD_RETRIES) {
        throw error;
      }

      const nextAttempt = attempt + 1;
      const delayMs = 800 * 2 ** attempt;
      options.onRetry?.(nextAttempt, delayMs);
      await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
      attempt = nextAttempt;
    }
  }

  throw new Error("unreachable");
}

export function applyDownloadProgress(params: {
  prevTasks: DownloadTaskView[];
  payload: DownloadProgressEvent;
  instances: InstanceConfig[];
  locale: string;
  t: Translate;
  speedSamples: SpeedSampleMap;
}) {
  const { prevTasks, payload, instances, locale, t, speedSamples } = params;

  const now = Date.now();
  const sample = speedSamples[payload.instanceId];
  let nextSpeed = payload.bytesPerSecond ?? 0;
  if (nextSpeed <= 0 && sample && payload.downloadedBytes >= sample.bytes) {
    const deltaBytes = payload.downloadedBytes - sample.bytes;
    const deltaMs = now - sample.at;
    if (deltaMs > 0) {
      nextSpeed = (deltaBytes * 1000) / deltaMs;
    }
  }
  speedSamples[payload.instanceId] = { bytes: payload.downloadedBytes, at: now };

  const hasTotal = typeof payload.totalBytes === "number" && payload.totalBytes > 0;
  const progress = hasTotal
    ? Math.max(0, Math.min(100, payload.percent ?? 0))
    : payload.downloadedBytes > 0
      ? 5
      : 0;

  const existing = prevTasks.find((task) => task.instanceId === payload.instanceId);
  const instanceName =
    instances.find((instance) => instance.id === payload.instanceId)?.name ?? existing?.instanceName ?? payload.instanceId;

  const itemLabel = getDownloadItemLabel(payload.item, t);
  const logText = payload.message
    ? `${itemLabel}: ${payload.message} (${Math.floor(progress)}%) ${formatSpeed(nextSpeed)}`
    : `${itemLabel}: ${Math.floor(progress)}%`;

  const nextTask: DownloadTaskView = {
    id: existing?.id ?? payload.instanceId,
    instanceId: payload.instanceId,
    instanceName,
    item: itemLabel,
    progress,
    speedText: formatSpeed(nextSpeed),
    status: payload.status === "completed" ? "completed" : payload.status === "error" ? "failed" : "downloading",
    message: payload.message ?? t("downloadCenter.status.downloading"),
    logs: [...(existing?.logs ?? []), formatTaskLogLine(logText, locale)].slice(-80),
    updatedAt: Date.now(),
    retryType: existing?.retryType,
    includeJava: existing?.includeJava,
  };

  if (!nextTask.retryType) {
    nextTask.retryType = payload.item === "java-runtime" ? "java-runtime" : "core";
  }

  const tasks = !existing
    ? [nextTask, ...prevTasks]
    : prevTasks.map((task) => (task.instanceId === payload.instanceId ? nextTask : task));

  return {
    tasks,
    uiMessage: payload.message ? `${itemLabel}: ${payload.message} (${Math.floor(progress)}%) ${formatSpeed(nextSpeed)}` : "",
    isTerminal: payload.status === "completed" || payload.status === "error",
  };
}

export function createQueuedJavaTask(instance: InstanceConfig, locale: string, t: Translate): DownloadTaskView {
  return {
    id: instance.id,
    instanceId: instance.id,
    instanceName: instance.name,
    item: t("instances.javaItem"),
    progress: 0,
    speedText: "0 B/s",
    status: "queued",
    message: t("instances.javaTaskWaiting"),
    logs: [formatTaskLogLine(t("instances.javaTaskCreated"), locale)],
    updatedAt: Date.now(),
    retryType: "java-runtime",
  };
}

export function createQueuedCoreTask(instance: InstanceConfig, includeJava: boolean, reason: string | undefined, locale: string, t: Translate): DownloadTaskView {
  return {
    id: instance.id,
    instanceId: instance.id,
    instanceName: instance.name,
    item: t("instances.coreItem"),
    progress: 0,
    speedText: "0 B/s",
    status: "queued",
    message: reason ?? (includeJava ? t("instances.waitingDownloadWithJava") : t("instances.waitingDownload")),
    logs: [formatTaskLogLine(reason ?? t("instances.taskCreated", { extra: includeJava ? t("instances.taskCreatedWithJava") : "" }), locale)],
    updatedAt: Date.now(),
    retryType: "core",
    includeJava,
  };
}

export function upsertTask(prevTasks: DownloadTaskView[], instanceId: string, nextTask: DownloadTaskView): DownloadTaskView[] {
  const existing = prevTasks.some((task) => task.instanceId === instanceId);
  if (!existing) {
    return [nextTask, ...prevTasks];
  }
  return prevTasks.map((task) => (task.instanceId === instanceId ? { ...task, ...nextTask } : task));
}

export function markTaskRetrying(
  prevTasks: DownloadTaskView[],
  instanceId: string,
  message: string,
  logLine: string,
) : DownloadTaskView[] {
  return prevTasks.map((task) =>
    task.instanceId === instanceId
      ? {
          ...task,
          status: "downloading" as const,
          message,
          logs: [...task.logs, logLine].slice(-80),
        }
      : task,
  );
}

export function markJavaTaskCompleted(prevTasks: DownloadTaskView[], instanceId: string, javaPath: string, locale: string, t: Translate): DownloadTaskView[] {
  return prevTasks.map((task) =>
    task.instanceId === instanceId
      ? {
          ...task,
          status: "completed" as const,
          progress: 100,
          speedText: "0 B/s",
          message: t("instances.javaReady"),
          logs: [...task.logs, formatTaskLogLine(t("instances.javaPath", { path: javaPath }), locale)].slice(-80),
        }
      : task,
  );
}

export function markCoreTaskCompleted(prevTasks: DownloadTaskView[], instanceId: string, result: DownloadResult, locale: string, t: Translate): DownloadTaskView[] {
  return prevTasks.map((task) =>
    task.instanceId === instanceId
      ? {
          ...task,
          status: "completed" as const,
          progress: 100,
          speedText: "0 B/s",
          message: result.javaDownloaded ? t("instances.coreAndJavaReady") : t("instances.coreReady"),
          logs: [
            ...task.logs,
            ...(result.javaDownloaded && result.javaExecutablePath
              ? [formatTaskLogLine(t("instances.javaPath", { path: result.javaExecutablePath }), locale)]
              : []),
            formatTaskLogLine(
              result.javaDownloaded
                ? t("instances.downloadDoneLogWithJava", { path: result.javaExecutablePath ?? t("instances.pathMissing") })
                : t("instances.downloadDoneLog"),
              locale,
            ),
          ].slice(-80),
        }
      : task,
  );
}

export function markTaskFailed(
  prevTasks: DownloadTaskView[],
  instanceId: string,
  errorText: string,
  logLine: string,
  retryType: "core" | "java-runtime",
  includeJava?: boolean,
) : DownloadTaskView[] {
  return prevTasks.map((task) =>
    task.instanceId === instanceId
      ? {
          ...task,
          status: "failed" as const,
          message: errorText,
          logs: [...task.logs, logLine].slice(-80),
          retryType,
          includeJava,
        }
      : task,
  );
}