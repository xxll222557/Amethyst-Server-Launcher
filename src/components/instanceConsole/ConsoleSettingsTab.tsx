import type { TranslationKey } from "../../i18n";

interface ConsoleSettingsTabProps {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  busy: boolean;
  javaPath: string;
  setJavaPath: (value: string) => void;
  onSaveJavaPath: () => void;
}

export function ConsoleSettingsTab({
  t,
  busy,
  javaPath,
  setJavaPath,
  onSaveJavaPath,
}: ConsoleSettingsTabProps) {
  return (
    <div className="wizard-step">
      <label className="wizard-field">
        <span>{t("console.settings.javaPath")}</span>
        <input
          value={javaPath}
          onChange={(event) => setJavaPath(event.target.value)}
          placeholder={t("console.settings.javaPathPlaceholder")}
        />
      </label>
      <div className="wizard-actions">
        <button className="primary-action" type="button" onClick={onSaveJavaPath} disabled={busy}>
          {t("console.settings.saveJava")}
        </button>
      </div>
      <p className="instance-message">{t("console.settings.javaHint")}</p>
    </div>
  );
}
