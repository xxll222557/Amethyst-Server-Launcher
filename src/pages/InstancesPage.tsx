import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  checkInstancePreflight,
  createInstanceConfig,
  deleteInstance,
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
import type { DownloadTaskView } from "../components/DownloadCenter";
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
const INSTANCE_GROUPS_KEY = "asl-instance-groups-v1";
const INSTANCE_GROUP_MAP_KEY = "asl-instance-group-map-v1";
const INSTANCE_META_KEY = "asl-instance-meta-v1";
const INSTANCE_CUSTOM_GROUPS_EXPANDED_KEY = "asl-instance-groups-expanded-v1";
const BATCH_DELETE_UNDO_MS = 5000;

type GroupFilter = "all" | "ungrouped" | string;

interface InstanceGroup {
  id: string;
  name: string;
  color: string;
}

interface InstanceMeta {
  name?: string;
  description?: string;
  tags?: string;
}

interface InstanceSettingsDraft {
  name: string;
  description: string;
  tags: string;
  groupId: string;
}

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
  downloadTasks: DownloadTaskView[];
  onDownloadTasksChange: Dispatch<SetStateAction<DownloadTaskView[]>>;
  onOpenDownloadsView: () => void;
}
export function InstancesPage({
  intent,
  onNotify,
  downloadTasks,
  onDownloadTasksChange,
  onOpenDownloadsView,
}: InstancesPageProps) {
  const { t, locale } = useI18n();
  const [instances, setInstances] = useState<InstanceConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [groups, setGroups] = useState<InstanceGroup[]>(() => {
    try {
      const raw = window.localStorage.getItem(INSTANCE_GROUPS_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as Array<{ id?: string; name?: string; color?: string }>;
      return Array.isArray(parsed)
        ? parsed
            .filter((item) => typeof item?.id === "string" && typeof item?.name === "string")
            .map((item) => ({
              id: item.id as string,
              name: item.name as string,
              color: typeof item.color === "string" && /^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : "#ff9f43",
            }))
        : [];
    } catch {
      return [];
    }
  });
  const [instanceGroupMap, setInstanceGroupMap] = useState<Record<string, string>>(() => {
    try {
      const raw = window.localStorage.getItem(INSTANCE_GROUP_MAP_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as Record<string, string>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  const [activeGroupFilter, setActiveGroupFilter] = useState<GroupFilter>("all");
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [groupColorInput, setGroupColorInput] = useState("#ff9f43");
  const [instanceMetaMap, setInstanceMetaMap] = useState<Record<string, InstanceMeta>>(() => {
    try {
      const raw = window.localStorage.getItem(INSTANCE_META_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as Record<string, InstanceMeta>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  const [activeSettingsInstanceId, setActiveSettingsInstanceId] = useState<string | null>(null);
  const [customGroupsExpanded, setCustomGroupsExpanded] = useState(
    () => window.localStorage.getItem(INSTANCE_CUSTOM_GROUPS_EXPANDED_KEY) !== "0",
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [bulkMoveTargetGroup, setBulkMoveTargetGroup] = useState("ungrouped");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);
  const [consoleInstance, setConsoleInstance] = useState<InstanceConfig | null>(null);
  const [javaPromptInstance, setJavaPromptInstance] = useState<InstanceConfig | null>(null);
  const [javaPromptReason, setJavaPromptReason] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<InstanceSettingsDraft | null>(null);
  const javaPromptResolverRef = useRef<((value: boolean) => void) | null>(null);
  const handledIntentNonceRef = useRef<number | null>(null);
  const speedSampleRef = useRef<Record<string, { bytes: number; at: number }>>({});
  const recentErrorsRef = useRef<string[]>([]);
  const pendingBatchDeleteTimerRef = useRef<number | null>(null);
  const pendingBatchDeleteIdsRef = useRef<string[]>([]);

  const isCustomCoreInstance = (instance: InstanceConfig) =>
    instance.serverType === CUSTOM_CORE_SERVER_TYPE || instance.serverType === LEGACY_CUSTOM_CORE_SERVER_TYPE;

  useEffect(() => {
    window.localStorage.setItem(INSTANCE_GROUPS_KEY, JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    window.localStorage.setItem(INSTANCE_GROUP_MAP_KEY, JSON.stringify(instanceGroupMap));
  }, [instanceGroupMap]);

  useEffect(() => {
    window.localStorage.setItem(INSTANCE_META_KEY, JSON.stringify(instanceMetaMap));
  }, [instanceMetaMap]);

  useEffect(() => {
    window.localStorage.setItem(INSTANCE_CUSTOM_GROUPS_EXPANDED_KEY, customGroupsExpanded ? "1" : "0");
  }, [customGroupsExpanded]);

  useEffect(() => {
    return () => {
      if (pendingBatchDeleteTimerRef.current) {
        window.clearTimeout(pendingBatchDeleteTimerRef.current);
        pendingBatchDeleteTimerRef.current = null;
      }
    };
  }, []);

  const displayedInstances = useMemo(() => {
    if (activeGroupFilter === "all") {
      return instances;
    }

    if (activeGroupFilter === "ungrouped") {
      return instances.filter((instance) => !instanceGroupMap[instance.id]);
    }

    return instances.filter((instance) => instanceGroupMap[instance.id] === activeGroupFilter);
  }, [activeGroupFilter, instanceGroupMap, instances]);

  const ungroupedCount = useMemo(
    () => instances.filter((instance) => !instanceGroupMap[instance.id]).length,
    [instanceGroupMap, instances],
  );

  const displayedInstanceIds = useMemo(() => displayedInstances.map((item) => item.id), [displayedInstances]);

  useEffect(() => {
    if (selectionMode) {
      return;
    }

    setSelectedInstanceIds([]);
    setSelectedGroupIds([]);
  }, [selectionMode]);

  useEffect(() => {
    if (activeSettingsInstanceId) {
      return;
    }

    setSettingsDraft(null);
  }, [activeSettingsInstanceId]);

  const addGroup = () => {
    const nextName = groupNameInput.trim();
    if (!nextName) {
      return;
    }

    const normalizedColor = /^#[0-9a-fA-F]{6}$/.test(groupColorInput) ? groupColorInput : "#ff9f43";
    const id = `group-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    setGroups((prev) => [...prev, { id, name: nextName, color: normalizedColor }]);
    setGroupNameInput("");
    setGroupColorInput("#ff9f43");
    setGroupModalOpen(false);
    setActiveGroupFilter(id);
  };

  const renameGroup = (group: InstanceGroup) => {
    const nextName = window.prompt(t("instances.group.renamePrompt"), group.name)?.trim();
    if (!nextName) {
      return;
    }
    setGroups((prev) => prev.map((item) => (item.id === group.id ? { ...item, name: nextName } : item)));
  };

  const deleteGroup = (group: InstanceGroup) => {
    const confirmed = window.confirm(t("instances.group.deleteConfirm", { name: group.name }));
    if (!confirmed) {
      return;
    }

    setGroups((prev) => prev.filter((item) => item.id !== group.id));
    setInstanceGroupMap((prev) => {
      const entries = Object.entries(prev).filter(([, groupId]) => groupId !== group.id);
      return Object.fromEntries(entries);
    });

    setActiveGroupFilter((current) => (current === group.id ? "all" : current));
  };

  const toggleInstanceSelection = (instanceId: string) => {
    setSelectedInstanceIds((prev) =>
      prev.includes(instanceId) ? prev.filter((item) => item !== instanceId) : [...prev, instanceId],
    );
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((item) => item !== groupId) : [...prev, groupId],
    );
  };

  const batchDeleteSelectedGroups = () => {
    if (selectedGroupIds.length === 0) {
      return;
    }

    const selectedGroups = groups.filter((group) => selectedGroupIds.includes(group.id));
    const confirmed = window.confirm(
      t("instances.bulk.deleteGroupsConfirm", {
        count: selectedGroups.length,
      }),
    );
    if (!confirmed) {
      return;
    }

    const selectedSet = new Set(selectedGroupIds);
    setGroups((prev) => prev.filter((group) => !selectedSet.has(group.id)));
    setInstanceGroupMap((prev) => {
      const entries = Object.entries(prev).filter(([, groupId]) => !selectedSet.has(groupId));
      return Object.fromEntries(entries);
    });
    setActiveGroupFilter((current) => (selectedSet.has(current) ? "all" : current));
    setSelectedGroupIds([]);

    onNotify({
      tone: "success",
      title: t("instances.bulk.deleteGroupsDone"),
      detail: t("instances.bulk.deleteGroupsDoneDetail", { count: selectedGroups.length }),
    });
  };

  const batchDeleteSelectedInstances = async () => {
    if (selectedInstanceIds.length === 0 || bulkDeleting) {
      return;
    }

    setBatchDeleteConfirmOpen(false);

    const deletingIds = [...selectedInstanceIds];
    setSelectedInstanceIds([]);

    if (pendingBatchDeleteTimerRef.current) {
      window.clearTimeout(pendingBatchDeleteTimerRef.current);
    }

    pendingBatchDeleteIdsRef.current = deletingIds;
    setMessage(t("instances.bulk.deleteQueuedMessage", { count: deletingIds.length, seconds: 5 }));

    const timerId = window.setTimeout(async () => {
      const queuedIds = [...pendingBatchDeleteIdsRef.current];
      pendingBatchDeleteIdsRef.current = [];
      pendingBatchDeleteTimerRef.current = null;

      if (queuedIds.length === 0) {
        return;
      }

      setBulkDeleting(true);
      try {
        const results = await Promise.allSettled(queuedIds.map((instanceId) => deleteInstance(instanceId)));
        const successCount = results.filter((item) => item.status === "fulfilled").length;
        const failedCount = results.length - successCount;

        setInstanceGroupMap((prev) => {
          const next: Record<string, string> = {};
          Object.entries(prev).forEach(([instanceId, groupId]) => {
            if (!queuedIds.includes(instanceId)) {
              next[instanceId] = groupId;
            }
          });
          return next;
        });

        setInstanceMetaMap((prev) => {
          const next: Record<string, InstanceMeta> = {};
          Object.entries(prev).forEach(([instanceId, meta]) => {
            if (!queuedIds.includes(instanceId)) {
              next[instanceId] = meta;
            }
          });
          return next;
        });

        setActiveSettingsInstanceId((current) => (current && queuedIds.includes(current) ? null : current));
        setConsoleInstance((current) => (current && queuedIds.includes(current.id) ? null : current));

        await refreshInstances();

        if (failedCount === 0) {
          onNotify({
            tone: "success",
            title: t("instances.bulk.deleteInstancesDone"),
            detail: t("instances.bulk.deleteInstancesDoneDetail", { count: successCount }),
          });
        } else {
          onNotify({
            tone: "danger",
            title: t("instances.bulk.deleteInstancesPartial"),
            detail: t("instances.bulk.deleteInstancesPartialDetail", { success: successCount, failed: failedCount }),
          });
        }
      } finally {
        setBulkDeleting(false);
      }
    }, BATCH_DELETE_UNDO_MS);

    pendingBatchDeleteTimerRef.current = timerId;

    onNotify({
      tone: "danger",
      title: t("instances.bulk.deleteQueuedTitle"),
      detail: t("instances.bulk.deleteQueuedDetail", { count: deletingIds.length, seconds: 5 }),
      actionLabel: t("instances.undo"),
      durationMs: BATCH_DELETE_UNDO_MS,
      onAction: () => {
        if (!pendingBatchDeleteTimerRef.current) {
          return;
        }

        window.clearTimeout(pendingBatchDeleteTimerRef.current);
        pendingBatchDeleteTimerRef.current = null;
        pendingBatchDeleteIdsRef.current = [];
        setMessage(t("instances.bulk.deleteUndoneMessage"));
        onNotify({ tone: "info", title: t("instances.deleteUndone") });
      },
    });
  };

  const batchMoveSelectedInstances = () => {
    if (selectedInstanceIds.length === 0) {
      return;
    }

    const selectedSet = new Set(selectedInstanceIds);

    setInstanceGroupMap((prev) => {
      const next = { ...prev };
      selectedSet.forEach((instanceId) => {
        if (bulkMoveTargetGroup === "ungrouped") {
          delete next[instanceId];
        } else {
          next[instanceId] = bulkMoveTargetGroup;
        }
      });
      return next;
    });

    setSelectedInstanceIds([]);
    onNotify({
      tone: "success",
      title: t("instances.bulk.moveDone"),
      detail: t("instances.bulk.moveDoneDetail", { count: selectedSet.size }),
    });
  };

  const getDisplayName = (instance: InstanceConfig) => {
    const customName = instanceMetaMap[instance.id]?.name?.trim();
    return customName || instance.name;
  };

  const getDisplayDescription = (instance: InstanceConfig) => {
    const customDescription = instanceMetaMap[instance.id]?.description?.trim();
    return customDescription || instance.frameworkDescription || "";
  };

  const getDisplayTags = (instance: InstanceConfig) => {
    const customTags = instanceMetaMap[instance.id]?.tags?.trim();
    if (!customTags) {
      return [] as string[];
    }
    return customTags
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const updateInstanceMeta = (instanceId: string, patch: Partial<InstanceMeta>) => {
    setInstanceMetaMap((prev) => {
      const nextItem = {
        ...(prev[instanceId] ?? {}),
        ...patch,
      };

      return {
        ...prev,
        [instanceId]: nextItem,
      };
    });
  };

  const openSettingsModal = (instance: InstanceConfig) => {
    const currentMeta = instanceMetaMap[instance.id] ?? {};
    setSettingsDraft({
      name: currentMeta.name ?? instance.name,
      description: currentMeta.description ?? (instance.frameworkDescription ?? ""),
      tags: currentMeta.tags ?? "",
      groupId: instanceGroupMap[instance.id] ?? "ungrouped",
    });
    setActiveSettingsInstanceId(instance.id);
  };

  const closeSettingsModal = () => {
    setActiveSettingsInstanceId(null);
    setSettingsDraft(null);
  };

  const saveSettingsModal = () => {
    if (!activeSettingsInstanceId || !settingsDraft) {
      return;
    }

    updateInstanceMeta(activeSettingsInstanceId, {
      name: settingsDraft.name,
      description: settingsDraft.description,
      tags: settingsDraft.tags,
    });

    setInstanceGroupMap((prev) => {
      if (settingsDraft.groupId === "ungrouped") {
        const { [activeSettingsInstanceId]: _removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [activeSettingsInstanceId]: settingsDraft.groupId,
      };
    });

    closeSettingsModal();
    onNotify({ tone: "success", title: t("instances.settings.saved") });
  };

  const pushRecentError = (code: string, detail: string, context: string) => {
    const line = `${new Date().toISOString()} [${code}] ${context}: ${detail}`;
    recentErrorsRef.current = [...recentErrorsRef.current.slice(-39), line];
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
      return;
    }

    if (intent.type === "downloads") {
      onOpenDownloadsView();
      setWizardOpen(false);
      return;
    }

    if (intent.type !== "open-console") {
      return;
    }

    setWizardOpen(false);
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

        onDownloadTasksChange((prev) => {
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
        onOpenDownloadsView();
        speedSampleRef.current[instance.id] = { bytes: 0, at: Date.now() };

        onDownloadTasksChange((prev) => {
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
                onDownloadTasksChange((prev) =>
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

          onDownloadTasksChange((prev) => markJavaTaskCompleted(prev, instance.id, javaPath, locale, t));

          await refreshInstances();
        } catch (javaError) {
          const tagged = withErrorCode(javaError, "E_JAVA_DOWNLOAD");
          const javaErrorText = `${tagged.code}: ${tagged.detail}`;
          pushRecentError(tagged.code, tagged.detail, `java-download ${instance.name}`);
          setMessage(t("instances.javaDownloadFailedMessage", { name: instance.name, error: javaErrorText }));
          onNotify({ tone: "error", title: t("instances.javaDownloadFailed"), detail: javaErrorText });
          onDownloadTasksChange((prev) =>
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
    onOpenDownloadsView();
    speedSampleRef.current[instance.id] = { bytes: 0, at: Date.now() };

    onDownloadTasksChange((prev) => {
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
            onDownloadTasksChange((prev) =>
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

      onDownloadTasksChange((prev) => markCoreTaskCompleted(prev, instance.id, result, locale, t));

      await refreshInstances();
    } catch (error) {
      const tagged = withErrorCode(error, "E_CORE_DOWNLOAD");
      const errorText = `${tagged.code}: ${tagged.detail}`;
      pushRecentError(tagged.code, tagged.detail, `core-download ${instance.name}`);
      setMessage(t("instances.downloadFailedMessage", { name: instance.name, error: errorText }));
      onNotify({ tone: "error", title: t("instances.downloadFailed"), detail: errorText });
      onDownloadTasksChange((prev) =>
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
      <section className="panel page-panel instances-layout">
        <div className="panel-header">
          <div>
            <p className="panel-label">{t("instances.panelLabel")}</p>
            <h3>{t("instances.panelTitle")}</h3>
          </div>
          <div className="hero-actions">
            <button
              className={`ghost-action ${selectionMode ? "active" : ""}`}
              type="button"
              onClick={() => setSelectionMode((prev) => !prev)}
            >
              {selectionMode ? t("instances.bulk.exit") : t("instances.bulk.manage")}
            </button>
            <button className="ghost-action" type="button" onClick={() => void exportDiagnostics()}>
              {t("instances.exportDiagnostics")}
            </button>
            <button className="ghost-action" type="button" onClick={() => setWizardOpen(true)}>
              {t("instances.create")}
            </button>
          </div>
        </div>

        <div className="instances-workspace">
          <aside className="instances-side-nav" aria-label={t("instances.group.sidebarAria")}>
            <article className="instances-group-create">
              <div className="instances-group-create-head">
                <strong>{t("instances.group.title")}</strong>
                <button
                  className="instances-group-add-btn"
                  type="button"
                  onClick={() => setGroupModalOpen(true)}
                  aria-label={t("instances.group.createAction")}
                  title={t("instances.group.createAction")}
                >
                  +
                </button>
              </div>
              <p>{t("instances.group.desc")}</p>
            </article>

            <div className="instances-group-list">
              <button
                className={`instances-group-item ${activeGroupFilter === "all" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveGroupFilter("all")}
              >
                <span>{t("instances.group.all")}</span>
                <span className="status-pill muted">{instances.length}</span>
              </button>

              <button
                className={`instances-group-item ${activeGroupFilter === "ungrouped" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveGroupFilter("ungrouped")}
              >
                <span>{t("instances.group.ungrouped")}</span>
                <span className="status-pill muted">{ungroupedCount}</span>
              </button>

              <button
                className={`instances-group-collapse ${customGroupsExpanded ? "expanded" : ""}`}
                type="button"
                onClick={() => setCustomGroupsExpanded((prev) => !prev)}
              >
                <span>{t("instances.group.customTitle")}</span>
                <span className="instances-group-collapse-icon" aria-hidden="true">
                  {customGroupsExpanded ? "-" : "+"}
                </span>
              </button>

              {customGroupsExpanded &&
                groups.map((group) => {
                  const count = instances.filter((instance) => instanceGroupMap[instance.id] === group.id).length;
                  const checked = selectedGroupIds.includes(group.id);
                  return (
                    <div className="instances-group-item-wrap" key={group.id}>
                      <button
                        className={`instances-group-item ${activeGroupFilter === group.id ? "active" : ""}`}
                        type="button"
                        onClick={() => setActiveGroupFilter(group.id)}
                      >
                        <span className="instances-group-name">
                          {selectionMode && (
                            <input
                              className="instances-select-checkbox"
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleGroupSelection(group.id)}
                              onClick={(event) => event.stopPropagation()}
                              aria-label={t("instances.bulk.selectGroupAria", { name: group.name })}
                            />
                          )}
                          <span
                            className="instances-group-dot"
                            style={{ "--instance-group-accent": group.color } as CSSProperties}
                            aria-hidden="true"
                          />
                          {group.name}
                        </span>
                        <span className="status-pill muted">{count}</span>
                      </button>
                      <div className="instances-group-item-actions">
                        <button className="ghost-action" type="button" onClick={() => renameGroup(group)}>
                          {t("instances.group.rename")}
                        </button>
                        <button className="ghost-action" type="button" onClick={() => deleteGroup(group)}>
                          {t("instances.group.delete")}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </aside>

          <div className="instances-content">
            {selectionMode && (
              <div className="instances-batch-toolbar">
                <span className="status-pill muted">
                  {t("instances.bulk.selectedInstances", { count: selectedInstanceIds.length })}
                </span>
                <span className="status-pill muted">
                  {t("instances.bulk.selectedGroups", { count: selectedGroupIds.length })}
                </span>
                <button
                  className="chip-button"
                  type="button"
                  onClick={() => setSelectedInstanceIds(displayedInstanceIds)}
                >
                  {t("instances.bulk.selectAllVisible", { count: displayedInstances.length })}
                </button>
                <button
                  className="ghost-action"
                  type="button"
                  onClick={() => {
                    setSelectedInstanceIds([]);
                    setSelectedGroupIds([]);
                  }}
                >
                  {t("instances.bulk.clearSelection")}
                </button>
                <label className="settings-field inline instances-bulk-move-field">
                  <span>{t("instances.bulk.moveToGroup")}</span>
                  <select value={bulkMoveTargetGroup} onChange={(event) => setBulkMoveTargetGroup(event.target.value)}>
                    <option value="ungrouped">{t("instances.group.ungrouped")}</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="ghost-action"
                  type="button"
                  onClick={batchMoveSelectedInstances}
                  disabled={selectedInstanceIds.length === 0}
                >
                  {t("instances.bulk.applyMove")}
                </button>
                <button
                  className="ghost-action"
                  type="button"
                  onClick={() => setBatchDeleteConfirmOpen(true)}
                  disabled={selectedInstanceIds.length === 0 || bulkDeleting}
                >
                  {t("instances.bulk.deleteInstances")}
                </button>
                <button
                  className="ghost-action"
                  type="button"
                  onClick={batchDeleteSelectedGroups}
                  disabled={selectedGroupIds.length === 0}
                >
                  {t("instances.bulk.deleteGroups")}
                </button>
              </div>
            )}

            <p className="instance-message">{loading ? t("instances.loading") : message || t("instances.defaultMessage")}</p>

            <div className="server-list">
              {displayedInstances.map((instance) => {
                const displayName = getDisplayName(instance);
                const displayDescription = getDisplayDescription(instance);
                const displayTags = getDisplayTags(instance);
                const selected = selectedInstanceIds.includes(instance.id);

                return (
                <article className={`server-card ${selected ? "selected" : ""}`} key={instance.id}>
                  <div className="server-main">
                    <div>
                      {selectionMode && (
                        <label className="instance-card-select" onClick={(event) => event.stopPropagation()}>
                          <input
                            className="instances-select-checkbox"
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleInstanceSelection(instance.id)}
                            aria-label={t("instances.bulk.selectInstanceAria", { name: displayName })}
                          />
                          <span>{t("instances.bulk.selectLabel")}</span>
                        </label>
                      )}
                      <h4>{displayName}</h4>
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

                  {displayDescription && <p className="instance-message">{displayDescription}</p>}

                  {displayTags.length > 0 && (
                    <p className="instance-detail-line">
                      {displayTags.map((tag) => (
                        <span className="status-pill muted" key={`${instance.id}-${tag}`}>
                          #{tag}
                        </span>
                      ))}
                    </p>
                  )}

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
                    <button
                      className="chip-button"
                      type="button"
                      onClick={() => openSettingsModal(instance)}
                    >
                      {t("instances.action.settings")}
                    </button>
                    <button className="chip-button" type="button" onClick={() => removeInstance(instance)}>
                      {t("instances.action.delete")}
                    </button>
                  </div>

                  {isCustomCoreInstance(instance) && !instance.coreDownloaded && (
                    <p className="instance-message">{t("instances.customCoreHint")}</p>
                  )}
                </article>
                );
              })}

              {displayedInstances.length === 0 && !loading && (
                <article className="server-card">
                  <h4>{t("instances.empty.title")}</h4>
                  <p>{t("instances.group.emptyByFilter")}</p>
                </article>
              )}
            </div>
          </div>
        </div>
      </section>

      <InstanceCreationWizard
        open={wizardOpen}
        defaultName={`Server-${instances.length + 1}`}
        onClose={() => setWizardOpen(false)}
        onSubmit={createInstance}
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
        installDirectory={javaInstallDirectory(javaPromptInstance?.version ?? "1.21.4")}
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

      {batchDeleteConfirmOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t("instances.bulk.deleteInstancesConfirmTitle")}
        >
          <section className="wizard-modal instance-group-modal">
            <div className="wizard-header">
              <div>
                <p className="panel-label">{t("instances.bulk.deleteInstances")}</p>
                <h3>{t("instances.bulk.deleteInstancesConfirmTitle")}</h3>
              </div>
            </div>
            <div className="wizard-step compact">
              <p className="instance-message">
                {t("instances.bulk.deleteInstancesConfirmDetail", { count: selectedInstanceIds.length })}
              </p>
            </div>
            <div className="wizard-actions">
              <button className="ghost-action" type="button" onClick={() => setBatchDeleteConfirmOpen(false)}>
                {t("instances.group.cancel")}
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={() => void batchDeleteSelectedInstances()}
                disabled={selectedInstanceIds.length === 0 || bulkDeleting}
              >
                {t("instances.bulk.deleteInstances")}
              </button>
            </div>
          </section>
        </div>
      )}

      {activeSettingsInstanceId && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t("instances.action.settings")}>
          <section className="wizard-modal instance-settings-modal">
            <div className="wizard-header">
              <div>
                <p className="panel-label">{t("instances.panelLabel")}</p>
                <h3>{t("instances.action.settings")}</h3>
              </div>
            </div>

            {(() => {
              const hasTarget = instances.some((item) => item.id === activeSettingsInstanceId);
              if (!hasTarget || !settingsDraft) {
                return null;
              }

              return (
                <div className="wizard-step compact instance-settings-modal-grid">
                  <label className="wizard-field">
                    <span>{t("instances.settings.name")}</span>
                    <input
                      type="text"
                      value={settingsDraft.name}
                      onChange={(event) =>
                        setSettingsDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                      }
                    />
                  </label>
                  <label className="wizard-field">
                    <span>{t("instances.settings.description")}</span>
                    <input
                      type="text"
                      value={settingsDraft.description}
                      onChange={(event) =>
                        setSettingsDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))
                      }
                    />
                  </label>
                  <label className="wizard-field">
                    <span>{t("instances.settings.tags")}</span>
                    <input
                      type="text"
                      value={settingsDraft.tags}
                      placeholder={t("instances.settings.tagsPlaceholder")}
                      onChange={(event) =>
                        setSettingsDraft((prev) => (prev ? { ...prev, tags: event.target.value } : prev))
                      }
                    />
                  </label>
                  <label className="wizard-field inline instance-group-assign">
                    <span>{t("instances.group.assign")}</span>
                    <select
                      value={settingsDraft.groupId}
                      onChange={(event) =>
                        setSettingsDraft((prev) => (prev ? { ...prev, groupId: event.target.value } : prev))
                      }
                    >
                      <option value="ungrouped">{t("instances.group.ungrouped")}</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })()}

            <div className="wizard-actions">
              <button className="ghost-action" type="button" onClick={closeSettingsModal}>
                {t("instances.group.cancel")}
              </button>
              <button className="primary-action" type="button" onClick={saveSettingsModal} disabled={!settingsDraft}>
                {t("instances.settings.save")}
              </button>
            </div>
          </section>
        </div>
      )}

      {groupModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t("instances.group.createModalTitle")}>
          <section className="wizard-modal instance-group-modal">
            <div className="wizard-header">
              <div>
                <p className="panel-label">{t("instances.group.title")}</p>
                <h3>{t("instances.group.createModalTitle")}</h3>
              </div>
            </div>
            <div className="wizard-step compact">
              <label className="wizard-field">
                <span>{t("instances.group.nameLabel")}</span>
                <input
                  type="text"
                  value={groupNameInput}
                  onChange={(event) => setGroupNameInput(event.target.value)}
                  placeholder={t("instances.group.createPlaceholder")}
                />
              </label>
              <label className="wizard-field">
                <span>{t("instances.group.colorLabel")}</span>
                <input type="color" value={groupColorInput} onChange={(event) => setGroupColorInput(event.target.value)} />
              </label>
            </div>
            <div className="wizard-actions">
              <button className="ghost-action" type="button" onClick={() => setGroupModalOpen(false)}>
                {t("instances.group.cancel")}
              </button>
              <button className="primary-action" type="button" onClick={addGroup} disabled={!groupNameInput.trim()}>
                {t("instances.group.createConfirm")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
