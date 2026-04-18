import { useI18n } from "../i18n";

interface DeleteInstancePromptModalProps {
  open: boolean;
  instanceName: string;
  running: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteInstancePromptModal({
  open,
  instanceName,
  running,
  onConfirm,
  onCancel,
}: DeleteInstancePromptModalProps) {
  const { t } = useI18n();
  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t("deletePrompt.aria")}>
      <section className="wizard-modal delete-instance-prompt-modal">
        <div className="wizard-header">
          <div>
            <p className="panel-label">{t("deletePrompt.danger")}</p>
            <h3>{t("deletePrompt.title")}</h3>
          </div>
        </div>

        <div className="wizard-step compact">
          <p className="instance-message">{t("deletePrompt.desc", { name: instanceName })}</p>
          {running ? <p className="instance-message">{t("deletePrompt.running")}</p> : null}
        </div>

        <div className="wizard-actions">
          <button className="ghost-action" type="button" onClick={onCancel}>
            {t("deletePrompt.cancel")}
          </button>
          <button className="primary-action" type="button" onClick={onConfirm}>
            {running ? t("deletePrompt.confirmRunning") : t("deletePrompt.confirm")}
          </button>
        </div>
      </section>
    </div>
  );
}
