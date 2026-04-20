import { useI18n } from "../i18n";

export interface CrashAnalysisPayload {
  instanceId: string;
  crashCode: string;
  summary: string;
  detail: string;
  confidence: number;
  suggestions: string[];
  logExcerpt?: string | null;
}

interface CrashAnalysisModalProps {
  open: boolean;
  payload: CrashAnalysisPayload | null;
  onClose: () => void;
}

export function CrashAnalysisModal({ open, payload, onClose }: CrashAnalysisModalProps) {
  const { t } = useI18n();

  if (!open || !payload) {
    return null;
  }

  const confidence = Math.max(0, Math.min(100, Math.round(payload.confidence ?? 0)));
  const suggestions = payload.suggestions.length > 0
    ? payload.suggestions
    : [t("crashPrompt.defaultSuggestion")];

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t("crashPrompt.aria")}>
      <section className="wizard-modal crash-analysis-modal">
        <div className="wizard-header">
          <div>
            <p className="panel-label">{t("crashPrompt.label")}</p>
            <h3>{t("crashPrompt.title")}</h3>
          </div>
        </div>

        <div className="wizard-step compact">
          <p className="instance-message">
            {t("crashPrompt.instance", { id: payload.instanceId })}
          </p>
          <p className="instance-message">
            {t("crashPrompt.code", { code: payload.crashCode })}
          </p>
          <p className="instance-message">{payload.summary}</p>
          <p className="instance-message">{payload.detail}</p>
          <p className="instance-message">
            {t("crashPrompt.confidence", { confidence })}
          </p>

          {payload.logExcerpt ? (
            <div className="crash-analysis-excerpt" role="note" aria-label={t("crashPrompt.excerpt")}>
              <strong>{t("crashPrompt.excerpt")}</strong>
              <pre>{payload.logExcerpt}</pre>
            </div>
          ) : null}

          <div className="crash-analysis-actions-list" aria-label={t("crashPrompt.suggestions")}>
            <strong>{t("crashPrompt.suggestions")}</strong>
            <ul>
              {suggestions.map((item, index) => (
                <li key={`${payload.instanceId}-${payload.crashCode}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="wizard-actions">
          <button className="primary-action" type="button" onClick={onClose}>
            {t("crashPrompt.confirm")}
          </button>
        </div>
      </section>
    </div>
  );
}
