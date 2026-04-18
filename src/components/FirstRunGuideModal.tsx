import { useI18n } from "../i18n";

interface FirstRunGuideModalProps {
  open: boolean;
  onClose: () => void;
  onDoNotShowAgain: () => void;
  onCreateInstance: () => void;
  onOpenDownloads: () => void;
  onOpenSettings: () => void;
}

export function FirstRunGuideModal({
  open,
  onClose,
  onDoNotShowAgain,
  onCreateInstance,
  onOpenDownloads,
  onOpenSettings,
}: FirstRunGuideModalProps) {
  const { t } = useI18n();
  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <section
        className="wizard-modal first-run-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("firstRun.aria")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="wizard-header">
          <div>
            <p className="panel-label">{t("firstRun.quickStart")}</p>
            <h3>{t("firstRun.title")}</h3>
            <p className="instance-message">{t("firstRun.subtitle")}</p>
          </div>
          <button className="ghost-action" type="button" onClick={onClose}>
            {t("firstRun.close")}
          </button>
        </header>

        <div className="first-run-steps">
          <article className="first-run-step-card">
            <span className="first-run-step-index">01</span>
            <h4>{t("firstRun.step1.title")}</h4>
            <p>{t("firstRun.step1.desc")}</p>
            <button className="chip-button" type="button" onClick={onCreateInstance}>
              {t("firstRun.step1.action")}
            </button>
          </article>

          <article className="first-run-step-card">
            <span className="first-run-step-index">02</span>
            <h4>{t("firstRun.step2.title")}</h4>
            <p>{t("firstRun.step2.desc")}</p>
            <button className="chip-button" type="button" onClick={onOpenDownloads}>
              {t("firstRun.step2.action")}
            </button>
          </article>

          <article className="first-run-step-card">
            <span className="first-run-step-index">03</span>
            <h4>{t("firstRun.step3.title")}</h4>
            <p>{t("firstRun.step3.desc")}</p>
            <button className="chip-button" type="button" onClick={onOpenSettings}>
              {t("firstRun.step3.action")}
            </button>
          </article>
        </div>

        <footer className="wizard-actions first-run-actions">
          <button className="secondary-action" type="button" onClick={onDoNotShowAgain}>
            {t("firstRun.hide")}
          </button>
          <button className="primary-action" type="button" onClick={onClose}>
            {t("firstRun.ok")}
          </button>
        </footer>
      </section>
    </div>
  );
}
