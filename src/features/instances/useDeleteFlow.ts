import { useEffect, useRef, useState } from "react";
import { deleteInstance, getInstanceProcessStatus, type InstanceConfig } from "../instanceService";
import { withErrorCode } from "../errorHandling";
import type { TranslationKey } from "../../i18n";

interface NotifyPayload {
  tone: "success" | "error" | "info" | "danger";
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface UseDeleteFlowOptions {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onNotify: (payload: NotifyPayload) => void;
  setMessage: (value: string) => void;
  onInstanceDeleted?: (instanceId: string) => void;
  onDeleteError: (code: string, detail: string, context: string) => void;
  refreshInstances: () => Promise<InstanceConfig[] | null>;
}

export function useDeleteFlow(options: UseDeleteFlowOptions) {
  const { t, onNotify, setMessage, onInstanceDeleted, onDeleteError, refreshInstances } = options;
  const undoWindowMs = 5000;

  const [deletePromptInstance, setDeletePromptInstance] = useState<InstanceConfig | null>(null);
  const [deletePromptRunning, setDeletePromptRunning] = useState(false);

  const deletePromptResolverRef = useRef<((value: boolean) => void) | null>(null);
  const pendingDeleteTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      Object.values(pendingDeleteTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      pendingDeleteTimersRef.current = {};
    };
  }, []);

  const askForDelete = async (instance: InstanceConfig, running: boolean) => {
    setDeletePromptInstance(instance);
    setDeletePromptRunning(running);
    return new Promise<boolean>((resolve) => {
      deletePromptResolverRef.current = resolve;
    });
  };

  const resolveDeletePrompt = (value: boolean) => {
    const resolve = deletePromptResolverRef.current;
    deletePromptResolverRef.current = null;
    setDeletePromptInstance(null);
    setDeletePromptRunning(false);
    resolve?.(value);
  };

  const removeInstance = async (instance: InstanceConfig) => {
    try {
      const processStatus = await getInstanceProcessStatus(instance.id);
      const confirmed = await askForDelete(instance, processStatus.running);
      if (!confirmed) {
        return;
      }

      const existingTimer = pendingDeleteTimersRef.current[instance.id];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      const timerId = window.setTimeout(async () => {
        delete pendingDeleteTimersRef.current[instance.id];
        try {
          await deleteInstance(instance.id);
          setMessage(t("instances.deletedMessage", { name: instance.name }));
          onNotify({ tone: "danger", title: t("instances.deleted"), detail: instance.name });
          onInstanceDeleted?.(instance.id);
          await refreshInstances();
        } catch (error) {
          const tagged = withErrorCode(error, "E_INSTANCE_DELETE");
          onDeleteError(tagged.code, tagged.detail, `instance-delete ${instance.name}`);
          const text = t("instances.deleteFailedMessage", { name: instance.name, code: tagged.code, detail: tagged.detail });
          setMessage(text);
          onNotify({ tone: "danger", title: t("instances.deleteFailed"), detail: instance.name });
        }
      }, undoWindowMs);

      pendingDeleteTimersRef.current[instance.id] = timerId;
      setMessage(t("instances.deleteQueuedMessage", { name: instance.name }));
      onNotify({
        tone: "danger",
        title: t("instances.deleteQueued"),
        detail: t("instances.deleteQueuedDetail", { name: instance.name }),
        actionLabel: t("instances.undo"),
        durationMs: undoWindowMs,
        onAction: () => {
          const currentTimer = pendingDeleteTimersRef.current[instance.id];
          if (!currentTimer) {
            return;
          }
          window.clearTimeout(currentTimer);
          delete pendingDeleteTimersRef.current[instance.id];
          setMessage(t("instances.deleteUndoneMessage", { name: instance.name }));
          onNotify({ tone: "info", title: t("instances.deleteUndone"), detail: instance.name });
        },
      });
    } catch (error) {
      const tagged = withErrorCode(error, "E_INSTANCE_DELETE");
      onDeleteError(tagged.code, tagged.detail, `instance-delete ${instance.name}`);
      const text = t("instances.deleteFailedMessage", { name: instance.name, code: tagged.code, detail: tagged.detail });
      setMessage(text);
      onNotify({ tone: "danger", title: t("instances.deleteFailed"), detail: instance.name });
    }
  };

  return {
    deletePromptInstance,
    deletePromptRunning,
    resolveDeletePrompt,
    removeInstance,
  };
}
