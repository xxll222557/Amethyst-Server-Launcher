import { useI18n } from "../i18n";

interface JavaRuntimePromptModalProps {
  open: boolean;
  instanceName: string;
  recommendedJavaMajor: number;
  installDirectory: string;
  reason?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function JavaRuntimePromptModal({
  open,
  instanceName,
  recommendedJavaMajor,
  installDirectory,
  reason,
  onConfirm,
  onCancel,
}: JavaRuntimePromptModalProps) {
  const { t } = useI18n();
  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t("javaPrompt.aria")}>
      <section className="wizard-modal java-runtime-prompt-modal">
        <div className="wizard-header">
          <div>
            <p className="panel-label">{t("javaPrompt.preflight")}</p>
            <h3>{t("javaPrompt.title")}</h3>
          </div>
        </div>

        <div className="wizard-step compact">
          <p className="instance-message">
            {t("javaPrompt.desc", { name: instanceName })}
          </p>
          <p className="instance-message">{t("javaPrompt.recommended", { major: recommendedJavaMajor })}</p>
          <p className="instance-message">{t("javaPrompt.installDir", { path: installDirectory })}</p>
          {reason ? <p className="instance-message">{t("javaPrompt.reason", { reason })}</p> : null}
        </div>

        <div className="wizard-actions">
          <button className="ghost-action" type="button" onClick={onCancel}>
            {t("javaPrompt.cancel")}
          </button>
          <button className="primary-action" type="button" onClick={onConfirm}>
            {t("javaPrompt.confirm")}
          </button>
        </div>
      </section>
    </div>
  );
}
