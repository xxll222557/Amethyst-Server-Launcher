import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  checkInstancePreflight,
  createInstanceConfig,
  downloadInstanceCore,
  downloadInstanceJavaRuntime,
  exportDiagnosticsReport,
  getInstances,
  startInstanceServer,
  type CreateInstanceRequest,
  type DownloadProgressEvent,
  type InstanceConfig,
} from "../features/instanceService";
import { InstanceCreationWizard } from "../components/InstanceCreationWizard";
import { DownloadCenter, type DownloadTaskView } from "../components/DownloadCenter";
import { InstanceConsole } from "../components/InstanceConsole";
import { DeleteInstancePromptModal } from "../components/DeleteInstancePromptModal";
import { JavaRuntimePromptModal } from "../components/JavaRuntimePromptModal";
import { withErrorCode } from "../features/errorHandling";
import { useDeleteFlow } from "../features/instances/useDeleteFlow";
import { getInstanceErrorTemplate } from "../features/instances/instanceErrorTemplate";
import {
  applyDownloadProgress,
  createQueuedCoreTask,
  createQueuedJavaTask,
  formatTaskLogLine,
  markCoreTaskCompleted,
  markJavaTaskCompleted,
  markTaskFailed,
  markTaskRetrying,
  retryWithBackoff,
  upsertTask,
} from "../features/instances/instanceDownloadWorkflow";
import { getInstanceGoalLabelKey, getInstanceModeLabelKey } from "../features/instanceLabels";
import { javaInstallDirectory, recommendedJavaMajorFromMcVersion } from "../features/javaRuntime";
import { useI18n } from "../i18n";

type InstanceViewIntentType = "none" | "create" | "downloads" | "open-console";
const CUSTOM_CORE_SERVER_TYPE = "custom-core";
const LEGACY_CUSTOM_CORE_SERVER_TYPE = "\u81ea\u5b9a\u4e49\u6838\u5fc3";

interface InstancesPageProps {
  intent?: {
    type: InstanceViewIntentType;
    instanceId?: string;
    nonce: number;
  };
  onNotify: (payload: {
    tone: "success" | "error" | "info" | "danger";
    title: string;
    detail?: string;
    actionLabel?: string;
    onAction?: () => void;
    durationMs?: number;
  }) => void;
}
export function InstancesPage({ intent, onNotify }: InstancesPageProps) {
  const { t, locale } = useI18n();
  const [instances, setInstances] = useState<InstanceConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadTasks, setDownloadTasks] = useState<DownloadTaskView[]>([]);
  const [downloadCenterOpen, setDownloadCenterOpen] = useState(false);
  const [consoleInstance, setConsoleInstance] = useState<InstanceConfig | null>(null);
  const [javaPromptInstance, setJavaPromptInstance] = useState<InstanceConfig | null>(null);
  const [javaPromptReason, setJavaPromptReason] = useState("");
  const javaPromptResolverRef = useRef<((value: boolean) => void) | null>(null);
  const handledIntentNonceRef = useRef<number | null>(null);
  const speedSampleRef = useRef<Record<string, { bytes: number; at: number }>>({});
  const recentErrorsRef = useRef<string[]>([]);

  const isCustomCoreInstance = (instance: InstanceConfig) =>
    instance.serverType === CUSTOM_CORE_SERVER_TYPE || instance.serverType === LEGACY_CUSTOM_CORE_SERVER_TYPE;

  const pushRecentError = (code: string, detail: string, context: string) => {
    const line = `${new Date().toISOString()} [${code}] ${context}: ${detail}`;
    recentErrorsRef.current = [...recentErrorsRef.current.slice(-39), line];
  };

  const retryDownloadTask = async (task: DownloadTaskView) => {
    const instance = instances.find((item) => item.id === task.instanceId);
    if (!instance) {
      onNotify({ tone: "error", title: t("instances.retryFailed"), detail: t("instances.retryInstanceMissing", { name: task.instanceName }) });
      return;
    }

    if (task.retryType === "java-runtime") {
      await startInstance(instance);
      return;
    }

    await downloadCore(instance, task.includeJava ?? true, t("instances.retryManualTask"));
  };

  const exportDiagnostics = async () => {
    const diagnosticsPayload = JSON.stringify({
      generatedAt: new Date().toISOString(),
      uiMessage: message,
      downloadTasks: downloadTasks.map((task) => ({
        instanceId: task.instanceId,
        instanceName: task.instanceName,
        item: task.item,
        status: task.status,
        progress: task.progress,
        message: task.message,
        speedText: task.speedText,
        retryType: task.retryType,
        includeJava: task.includeJava,
        updatedAt: task.updatedAt,
        recentLogs: task.logs.slice(-12),
      })),
      recentErrors: recentErrorsRef.current.slice(-40),
    });

    try {
      const path = await exportDiagnosticsReport(diagnosticsPayload);
      setMessage(t("instances.diagnosticsExportedMessage", { path }));
      onNotify({ tone: "success", title: t("instances.diagnosticsExported"), detail: path, durationMs: 6000 });
    } catch (error) {
      const tagged = withErrorCode(error, "E_DIAGNOSTICS_EXPORT");
      const detail = `${tagged.code}: ${tagged.detail}`;
      pushRecentError(tagged.code, tagged.detail, "diagnostics-export");
      setMessage(t("instances.diagnosticsExportFailedMessage", { detail }));
      onNotify({ tone: "error", title: t("instances.diagnosticsExportFailed"), detail });
    }
  };

  const askForJavaDownload = async (instance: InstanceConfig, reason?: string) => {
    setJavaPromptInstance(instance);
    setJavaPromptReason(reason ?? "");
    return new Promise<boolean>((resolve) => {
      javaPromptResolverRef.current = resolve;
    });
  };

  const resolveJavaPrompt = (value: boolean) => {
    const resolve = javaPromptResolverRef.current;
    javaPromptResolverRef.current = null;
    setJavaPromptInstance(null);
    setJavaPromptReason("");
    resolve?.(value);
  };

  const refreshInstances = async () => {
    setLoading(true);
    try {
      const next = await getInstances();
      setInstances(next);
      return next;
    } catch (error) {
      const tagged = withErrorCode(error, "E_INSTANCE_LIST");
      pushRecentError(tagged.code, tagged.detail, "instance-read");
      const text = t("instances.readFailedDetail", { code: tagged.code, detail: tagged.detail });
      setMessage(text);
      onNotify({ tone: "error", title: t("instances.readFailed"), detail: text });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const {
    deletePromptInstance,
    deletePromptRunning,
    resolveDeletePrompt,
    removeInstance,
  } = useDeleteFlow({
    t,
    onNotify,
    setMessage,
    onDeleteError: pushRecentError,
    refreshInstances,
    onInstanceDeleted: (instanceId) => {
      if (consoleInstance?.id === instanceId) {
        setConsoleInstance(null);
      }
    },
  });

  useEffect(() => {
    refreshInstances();
  }, []);

  useEffect(() => {
    if (!intent || intent.type === "none") {
      return;
    }

    if (handledIntentNonceRef.current === intent.nonce) {
      return;
    }

    handledIntentNonceRef.current = intent.nonce;

    if (intent.type === "create") {
      setWizardOpen(true);
      setDownloadCenterOpen(false);
      return;
    }

    if (intent.type === "downloads") {
      setDownloadCenterOpen(true);
      setWizardOpen(false);
      return;
    }

    if (intent.type !== "open-console") {
      return;
    }

    setWizardOpen(false);
    setDownloadCenterOpen(false);

    let active = true;

    const openConsoleByIntent = async () => {
      if (!intent.instanceId) {
        return;
      }

      const localTarget = instances.find((instance) => instance.id === intent.instanceId);
      const source = localTarget ? instances : ((await refreshInstances()) ?? []);
      const target = source.find((instance) => instance.id === intent.instanceId);

      if (!active) {
        return;
      }

      if (target) {
        setConsoleInstance(target);
        setMessage(t("instances.openedFromHome", { name: target.name }));
        onNotify({ tone: "success", title: t("instances.consoleOpened"), detail: target.name });
        return;
      }

      setMessage(t("instances.targetNotFoundHint"));
      onNotify({ tone: "error", title: t("instances.consoleOpenFailed"), detail: t("instances.targetNotFound") });
    };

    void openConsoleByIntent();

    return () => {
      active = false;
    };
  }, [intent?.nonce, intent?.type, intent?.instanceId]);

  useEffect(() => {
    let active = true;

    const setup = async () => {
      const unlisten = await listen<DownloadProgressEvent>("instance-download-progress", (event) => {
        if (!active || !event.payload) {
          return;
        }

        const payload = event.payload;
        setDownloadingId(payload.instanceId);

        setDownloadTasks((prev) => {
          const progressResult = applyDownloadProgress({
            prevTasks: prev,
            payload,
            instances,
            locale,
            t,
            speedSamples: speedSampleRef.current,
          });

          if (progressResult.uiMessage) {
            setMessage(progressResult.uiMessage);
          }

          if (progressResult.isTerminal) {
            setDownloadingId((current) => (current === payload.instanceId ? null : current));
            delete speedSampleRef.current[payload.instanceId];
          }

          return progressResult.tasks;
        });
      });

      if (!active) {
        unlisten();
      }

      return unlisten;
    };

    const unlistenPromise = setup();

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten?.());
    };
  }, [instances, locale, t]);

  const createInstance = async (request: CreateInstanceRequest) => {
    try {
      const created = await createInstanceConfig(request);

      setMessage(t("instances.createdMessage", { name: created.name }));
      onNotify({ tone: "success", title: t("instances.createSuccess"), detail: created.name });
      await refreshInstances();

      if (isCustomCoreInstance(created)) {
        setMessage(t("instances.customCoreCreatedHint", { name: created.name }));
        onNotify({
          tone: "info",
          title: t("instances.customCoreMode"),
          detail: t("instances.customCorePlaceJar", { dir: created.directory }),
          durationMs: 5000,
        });
        return;
      }

      await downloadCore(created, true, t("instances.waitingDownloadWithJava"));
    } catch (error) {
      const tagged = withErrorCode(error, "E_INSTANCE_CREATE");
      pushRecentError(tagged.code, tagged.detail, "instance-create");
      const text = `${tagged.code}: ${tagged.detail}`;
      onNotify({ tone: "error", title: t("instances.createFailed"), detail: text });
      throw new Error(t("instances.createFailedThrow", { detail: text }));
    }
  };

  const startInstance = async (instance: InstanceConfig) => {
    try {
      if (!instance.coreDownloaded && !isCustomCoreInstance(instance)) {
        await downloadCore(instance, true, t("instances.waitingDownloadWithJava"));
        await refreshInstances();
      }

      const preflight = await checkInstancePreflight(instance.id);
      const javaIssue = preflight.issues.find((issue) => issue.code === "E_JAVA_MISSING");
      const blockingIssues = preflight.issues.filter((issue) => issue.code !== "E_JAVA_MISSING");

      if (blockingIssues.length > 0) {
        const first = blockingIssues[0];
        const template = getInstanceErrorTemplate(first.code, first.detail ?? first.message, t);
        pushRecentError(first.code, first.detail ?? first.message, `preflight-check ${instance.name}`);
        setMessage(t("instances.preflightFailed", { code: first.code, message: first.message, hint: first.hint ?? "" }).trim());

        if (first.code === "E_CORE_MISSING" && isCustomCoreInstance(instance)) {
          onNotify({
            tone: "info",
            title: t("instances.preflightCustomCore"),
            detail: `${first.detail ?? instance.directory}`,
            actionLabel: t("instances.copyDir"),
            onAction: () => {
              void navigator.clipboard.writeText(instance.directory);
            },
            durationMs: 7000,
          });
          return;
        }

        onNotify({
          tone: "error",
          title: template.title,
          detail: `${template.detail}（${template.action}）`,
          durationMs: 7000,
        });
        return;
      }

      if (javaIssue) {
        const shouldDownloadJava = await askForJavaDownload(instance, javaIssue.detail ?? javaIssue.message);

        if (!shouldDownloadJava) {
          setMessage(t("instances.javaMissingMessage", { name: instance.name }));
          onNotify({ tone: "info", title: t("instances.startCancelled"), detail: t("instances.javaMissingDetail", { name: instance.name }) });
          return;
        }

        setDownloadingId(instance.id);
        setDownloadCenterOpen(true);
        speedSampleRef.current[instance.id] = { bytes: 0, at: Date.now() };

        setDownloadTasks((prev) => {
          const baseTask = createQueuedJavaTask(instance, locale, t);
          return upsertTask(prev, instance.id, baseTask);
        });

        try {
          const javaPath = await retryWithBackoff(
            async () => downloadInstanceJavaRuntime(instance.id),
            {
              onRetry: (attempt, delayMs) => {
                onNotify({
                  tone: "info",
                  title: t("instances.retryAuto", { task: t("instances.javaDownloadTask") }),
                  detail: t("instances.retryDetail", { name: instance.name, attempt: attempt + 1 }),
                });
                setDownloadTasks((prev) =>
                  markTaskRetrying(
                    prev,
                    instance.id,
                    t("instances.javaRetryMessage", { seconds: Math.round(delayMs / 1000), attempt: attempt + 1 }),
                    formatTaskLogLine(t("instances.javaRetryLog", { attempt: attempt + 1, delay: delayMs }), locale),
                  ),
                );
              },
            },
          );
          setMessage(t("instances.javaDownloadedMessage", { name: instance.name, path: javaPath }));
          onNotify({ tone: "success", title: t("instances.javaDownloaded"), detail: instance.name });

          setDownloadTasks((prev) => markJavaTaskCompleted(prev, instance.id, javaPath, locale, t));

          await refreshInstances();
        } catch (javaError) {
          const tagged = withErrorCode(javaError, "E_JAVA_DOWNLOAD");
          const javaErrorText = `${tagged.code}: ${tagged.detail}`;
          pushRecentError(tagged.code, tagged.detail, `java-download ${instance.name}`);
          setMessage(t("instances.javaDownloadFailedMessage", { name: instance.name, error: javaErrorText }));
          onNotify({ tone: "error", title: t("instances.javaDownloadFailed"), detail: javaErrorText });
          setDownloadTasks((prev) =>
            markTaskFailed(
              prev,
              instance.id,
              javaErrorText,
              formatTaskLogLine(t("instances.javaDownloadFailedLog", { error: javaErrorText }), locale),
              "java-runtime",
            ),
          );
          return;
        } finally {
          setDownloadingId(null);
          delete speedSampleRef.current[instance.id];
        }
      }

      const result = await startInstanceServer(instance.id);
      setMessage(t("instances.startedMessage", { name: instance.name, pid: result.pid }));
      onNotify({ tone: "success", title: t("instances.started"), detail: t("instances.startedDetail", { name: instance.name, pid: result.pid }) });
    } catch (error) {
      const tagged = withErrorCode(error, "E_INSTANCE_START");
      pushRecentError(tagged.code, tagged.detail, `instance-start ${instance.name}`);
      const template = getInstanceErrorTemplate(tagged.code, tagged.detail, t);
      setMessage(t("instances.startFailedMessage", { name: instance.name, code: tagged.code, detail: tagged.detail }));
      onNotify({ tone: "error", title: template.title, detail: `${tagged.code}: ${tagged.detail}` });
    }
  };

  const downloadCore = async (instance: InstanceConfig, includeJava: boolean, reason?: string) => {
    if (downloadingId) {
      return;
    }

    if (isCustomCoreInstance(instance)) {
      setMessage(t("instances.customCoreNoDownloadMessage", { name: instance.name }));
      onNotify({ tone: "info", title: t("instances.customCoreNoDownload"), detail: instance.name });
      return;
    }

    setDownloadingId(instance.id);
    setDownloadCenterOpen(true);
    speedSampleRef.current[instance.id] = { bytes: 0, at: Date.now() };

    setDownloadTasks((prev) => {
      const baseTask = createQueuedCoreTask(instance, includeJava, reason, locale, t);
      return upsertTask(prev, instance.id, baseTask);
    });

    setMessage(reason ? t("instances.downloadReason", { name: instance.name, reason }) : t("instances.downloadStart", { name: instance.name }));

    try {
      const result = await retryWithBackoff(
        async () => downloadInstanceCore(instance.id, includeJava),
        {
          onRetry: (attempt, delayMs) => {
            onNotify({
              tone: "info",
              title: t("instances.retryAuto", { task: t("instances.coreDownloadTask") }),
              detail: t("instances.retryDetail", { name: instance.name, attempt: attempt + 1 }),
            });
            setDownloadTasks((prev) =>
              markTaskRetrying(
                prev,
                instance.id,
                t("instances.coreRetryMessage", { seconds: Math.round(delayMs / 1000), attempt: attempt + 1 }),
                formatTaskLogLine(t("instances.coreRetryLog", { attempt: attempt + 1, delay: delayMs }), locale),
              ),
            );
          },
        },
      );
      setMessage(
        t("instances.downloadDoneMessage", {
          name: instance.name,
          size: (result.bytesWritten / 1024 / 1024).toFixed(2),
          extra: result.javaDownloaded ? t("instances.downloadDoneWithJava") : "",
        }),
      );
      onNotify({ tone: "success", title: t("instances.downloadDone"), detail: instance.name });

      setDownloadTasks((prev) => markCoreTaskCompleted(prev, instance.id, result, locale, t));

      await refreshInstances();
    } catch (error) {
      const tagged = withErrorCode(error, "E_CORE_DOWNLOAD");
      const errorText = `${tagged.code}: ${tagged.detail}`;
      pushRecentError(tagged.code, tagged.detail, `core-download ${instance.name}`);
      setMessage(t("instances.downloadFailedMessage", { name: instance.name, error: errorText }));
      onNotify({ tone: "error", title: t("instances.downloadFailed"), detail: errorText });
      setDownloadTasks((prev) =>
        markTaskFailed(
          prev,
          instance.id,
          errorText,
          formatTaskLogLine(t("instances.downloadFailedLog", { error: errorText }), locale),
          "core",
          includeJava,
        ),
      );
    } finally {
      setDownloadingId(null);
      delete speedSampleRef.current[instance.id];
    }
  };

  return (
    <>
      <section className="panel page-panel">
        <div className="panel-header">
          <div>
            <p className="panel-label">{t("instances.panelLabel")}</p>
            <h3>{t("instances.panelTitle")}</h3>
          </div>
          <div className="hero-actions">
            <button className="ghost-action" type="button" onClick={() => void exportDiagnostics()}>
              {t("instances.exportDiagnostics")}
            </button>
            <button className="ghost-action" type="button" onClick={() => setWizardOpen(true)}>
              {t("instances.create")}
            </button>
          </div>
        </div>

        <p className="instance-message">{loading ? t("instances.loading") : message || t("instances.defaultMessage")}</p>

        <div className="server-list">
          {instances.map((instance) => (
            <article className="server-card" key={instance.id}>
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
                <span className="status-pill muted">{t("instances.created")}</span>
              </div>

              {instance.frameworkDescription && <p className="instance-message">{instance.frameworkDescription}</p>}

              <div className="server-meta">
                <span>
                  {t("instances.memory", { min: instance.minMemoryMb, max: instance.maxMemoryMb })}
                </span>
                <span>{instance.directory}</span>
              </div>

              <div className="server-actions">
                <button className="chip-button" type="button" onClick={() => startInstance(instance)}>
                  {t("instances.action.start")}
                </button>
                <button className="chip-button" type="button" onClick={() => setConsoleInstance(instance)}>
                  {t("instances.action.console")}
                </button>
                <button className="chip-button" type="button" onClick={() => removeInstance(instance)}>
                  {t("instances.action.delete")}
                </button>
              </div>

              {isCustomCoreInstance(instance) && !instance.coreDownloaded && (
                <p className="instance-message">{t("instances.customCoreHint")}</p>
              )}
            </article>
          ))}

          {instances.length === 0 && !loading && (
            <article className="server-card">
              <h4>{t("instances.empty.title")}</h4>
              <p>{t("instances.empty.desc")}</p>
            </article>
          )}
        </div>
      </section>

      <InstanceCreationWizard
        open={wizardOpen}
        defaultName={`Server-${instances.length + 1}`}
        onClose={() => setWizardOpen(false)}
        onSubmit={createInstance}
      />

      <DownloadCenter
        open={downloadCenterOpen}
        tasks={downloadTasks}
        onToggleOpen={() => setDownloadCenterOpen((prev) => !prev)}
        onClose={() => setDownloadCenterOpen(false)}
        onRetryTask={(task) => {
          void retryDownloadTask(task);
        }}
      />

      <InstanceConsole
        open={Boolean(consoleInstance)}
        instance={consoleInstance}
        onClose={() => setConsoleInstance(null)}
        onUpdated={() => {
          void refreshInstances();
        }}
      />

      <JavaRuntimePromptModal
        open={Boolean(javaPromptInstance)}
        instanceName={javaPromptInstance?.name ?? t("instances.panelLabel")}
        recommendedJavaMajor={recommendedJavaMajorFromMcVersion(javaPromptInstance?.version ?? "1.21.4")}
        installDirectory={javaInstallDirectory(javaPromptInstance?.directory ?? "")}
        reason={javaPromptReason || undefined}
        onConfirm={() => resolveJavaPrompt(true)}
        onCancel={() => resolveJavaPrompt(false)}
      />

      <DeleteInstancePromptModal
        open={Boolean(deletePromptInstance)}
        instanceName={deletePromptInstance?.name ?? t("instances.panelLabel")}
        running={deletePromptRunning}
        onConfirm={() => resolveDeletePrompt(true)}
        onCancel={() => resolveDeletePrompt(false)}
      />
    </>
  );
}
