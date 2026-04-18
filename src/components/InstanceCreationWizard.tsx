import { useEffect, useMemo, useState } from "react";
import type { CreateInstanceRequest } from "../features/instanceService";
import { useI18n } from "../i18n";
import {
  getBeginnerProfile,
  COMMON_VERSIONS,
  getFrameworksByGoal,
  SERVER_FRAMEWORKS,
  type CreationMode,
  type ServerGoal,
} from "../features/serverCatalog";

const CUSTOM_CORE_FRAMEWORK = {
  id: "custom-core",
  label: "Custom Core",
  versions: COMMON_VERSIONS,
  description: "",
} as const;

function localizedGoalLabel(goal: "mod" | "plugin" | "hybrid" | "vanilla", t: (key: "wizard.goal.mod" | "wizard.goal.plugin" | "wizard.goal.hybrid" | "wizard.goal.vanilla") => string) {
  if (goal === "mod") {
    return t("wizard.goal.mod");
  }
  if (goal === "plugin") {
    return t("wizard.goal.plugin");
  }
  if (goal === "hybrid") {
    return t("wizard.goal.hybrid");
  }
  return t("wizard.goal.vanilla");
}

function localizedFrameworkDescription(
  frameworkId: string,
  t: (
    key:
      | "wizard.framework.vanilla.desc"
      | "wizard.framework.paper.desc"
      | "wizard.framework.fabric.desc"
      | "wizard.framework.forge.desc"
      | "wizard.framework.purpur.desc"
      | "wizard.framework.mohist.desc"
      | "wizard.framework.arclight.desc",
  ) => string,
) {
  if (frameworkId === "vanilla") {
    return t("wizard.framework.vanilla.desc");
  }
  if (frameworkId === "paper") {
    return t("wizard.framework.paper.desc");
  }
  if (frameworkId === "fabric") {
    return t("wizard.framework.fabric.desc");
  }
  if (frameworkId === "forge") {
    return t("wizard.framework.forge.desc");
  }
  if (frameworkId === "purpur") {
    return t("wizard.framework.purpur.desc");
  }
  if (frameworkId === "mohist") {
    return t("wizard.framework.mohist.desc");
  }
  if (frameworkId === "arclight") {
    return t("wizard.framework.arclight.desc");
  }
  return "";
}

interface InstanceCreationWizardProps {
  open: boolean;
  defaultName: string;
  onClose: () => void;
  onSubmit: (request: CreateInstanceRequest) => Promise<void>;
}

export function InstanceCreationWizard({ open, defaultName, onClose, onSubmit }: InstanceCreationWizardProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<CreationMode | null>(null);
  const [goal, setGoal] = useState<ServerGoal>("plugin");
  const [version, setVersion] = useState(COMMON_VERSIONS[0]);
  const [frameworkId, setFrameworkId] = useState<string>("");
  const [instanceName, setInstanceName] = useState(defaultName);
  const [minMemoryMb, setMinMemoryMb] = useState(1024);
  const [maxMemoryMb, setMaxMemoryMb] = useState(4096);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [customVersion, setCustomVersion] = useState(COMMON_VERSIONS[0]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setMode(null);
    setGoal("plugin");
    setVersion(COMMON_VERSIONS[0]);
    setFrameworkId("");
    setInstanceName(defaultName);
    setMinMemoryMb(1024);
    setMaxMemoryMb(4096);
    setSubmitting(false);
    setSubmitError("");
    setCustomVersion(COMMON_VERSIONS[0]);
  }, [defaultName, open]);

  const beginnerFrameworks = useMemo(() => getFrameworksByGoal(goal), [goal]);
  const expertFrameworks = useMemo(() => [...SERVER_FRAMEWORKS, CUSTOM_CORE_FRAMEWORK], []);
  const beginnerProfile = getBeginnerProfile(goal);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frameworkPool = mode === "expert" ? expertFrameworks : beginnerFrameworks;

    if (frameworkPool.length === 0) {
      setFrameworkId("");
      return;
    }

    if (!frameworkPool.some((framework) => framework.id === frameworkId)) {
      setFrameworkId(frameworkPool[0].id);
    }
  }, [beginnerFrameworks, expertFrameworks, frameworkId, mode, open]);

  const selectedPool = mode === "expert" ? expertFrameworks : beginnerFrameworks;
  const currentFramework = frameworkId ? selectedPool.find((framework) => framework.id === frameworkId) : undefined;
  const availableVersions = currentFramework?.versions ?? COMMON_VERSIONS;
  const customCoreSelected = currentFramework?.id === CUSTOM_CORE_FRAMEWORK.id;
  const goalOptions = useMemo(
    () => [
      { value: "mod" as const, label: t("wizard.goal.mod"), description: t("wizard.goal.mod.desc") },
      { value: "plugin" as const, label: t("wizard.goal.plugin"), description: t("wizard.goal.plugin.desc") },
      { value: "hybrid" as const, label: t("wizard.goal.hybrid"), description: t("wizard.goal.hybrid.desc") },
      { value: "vanilla" as const, label: t("wizard.goal.vanilla"), description: t("wizard.goal.vanilla.desc") },
    ],
    [t],
  );

  useEffect(() => {
    if (mode !== "beginner") {
      return;
    }

    setMinMemoryMb(beginnerProfile.recommendedMinMemoryMb);
    setMaxMemoryMb(beginnerProfile.recommendedMaxMemoryMb);

    const firstRecommendedVersion = beginnerProfile.recommendedVersions.find((item) => availableVersions.includes(item));
    if (firstRecommendedVersion) {
      setVersion(firstRecommendedVersion);
    }
  }, [availableVersions, beginnerProfile, mode]);

  useEffect(() => {
    if (!availableVersions.includes(version)) {
      setVersion(availableVersions[0] ?? COMMON_VERSIONS[0]);
    }
  }, [availableVersions, version]);

  if (!open) {
    return null;
  }

  const handleSubmit = async () => {
    if (!instanceName.trim()) {
      setSubmitError(t("wizard.error.name"));
      return;
    }

    if (!currentFramework) {
      setSubmitError(t("wizard.error.framework"));
      return;
    }

    if (customCoreSelected && !customVersion.trim()) {
      setSubmitError(t("wizard.error.customVersion"));
      return;
    }

    if (minMemoryMb <= 0 || maxMemoryMb <= 0 || minMemoryMb > maxMemoryMb) {
      setSubmitError(t("wizard.error.memory"));
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError("");
      await onSubmit({
        name: instanceName.trim(),
        serverType: customCoreSelected ? CUSTOM_CORE_FRAMEWORK.id : currentFramework.label,
        serverGoal: customCoreSelected ? undefined : goal,
        creationMode: mode ?? undefined,
        frameworkDescription: customCoreSelected
          ? t("wizard.customCoreFrameworkDescription")
          : localizedFrameworkDescription(currentFramework.id, t),
        version: customCoreSelected ? customVersion.trim() : version,
        minMemoryMb,
        maxMemoryMb,
      });
      onClose();
    } catch (error) {
      setSubmitError(String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <section
        className="wizard-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("wizard.aria")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="wizard-header">
          <div>
            <p className="panel-label">{t("wizard.label")}</p>
            <h3>{t("wizard.title")}</h3>
          </div>
          <button className="ghost-action" type="button" onClick={onClose}>
            {t("wizard.close")}
          </button>
        </div>

        {!mode && (
          <div className="wizard-step">
            <p className="instance-message">{t("wizard.chooseMode")}</p>
            <div className="wizard-grid two-column">
              <button className="wizard-option" type="button" onClick={() => setMode("beginner")}>
                <strong>{t("wizard.mode.beginner")}</strong>
                <span>{t("wizard.mode.beginner.desc")}</span>
              </button>
              <button className="wizard-option" type="button" onClick={() => setMode("expert")}>
                <strong>{t("wizard.mode.expert")}</strong>
                <span>{t("wizard.mode.expert.desc")}</span>
              </button>
            </div>
          </div>
        )}

        {mode === "beginner" && (
          <div className="wizard-step">
            <p className="instance-message">{t("wizard.guide.beginner")}</p>

            <div className="wizard-grid two-column">
              {goalOptions.map((option) => (
                <button
                  key={option.value}
                  className={`wizard-option ${goal === option.value ? "selected" : ""}`}
                  type="button"
                  onClick={() => setGoal(option.value)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>

            <label className="wizard-field" htmlFor="beginner-framework">
              {t("wizard.recommendedFramework")}
              <select
                id="beginner-framework"
                value={frameworkId}
                onChange={(event) => setFrameworkId(event.target.value)}
              >
                {beginnerFrameworks.map((framework) => (
                  <option key={framework.id} value={framework.id}>
                    {framework.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="wizard-field" htmlFor="beginner-version">
              {t("wizard.serverVersion")}
              <select id="beginner-version" value={version} onChange={(event) => setVersion(event.target.value)}>
                {availableVersions.map((versionOption) => (
                  <option key={versionOption} value={versionOption}>
                    {versionOption}
                  </option>
                ))}
              </select>
            </label>

            <p className="instance-message">
              {t("wizard.currentGoal", {
                goal: localizedGoalLabel(goal, t),
                min: beginnerProfile.recommendedMinMemoryMb,
                max: beginnerProfile.recommendedMaxMemoryMb,
              })}
            </p>
          </div>
        )}

        {mode === "expert" && (
          <div className="wizard-step">
            <p className="instance-message">{t("wizard.guide.expert")}</p>

            <label className="wizard-field" htmlFor="expert-framework">
              {t("wizard.framework")}
              <select id="expert-framework" value={frameworkId} onChange={(event) => setFrameworkId(event.target.value)}>
                {expertFrameworks.map((framework) => (
                  <option key={framework.id} value={framework.id}>
                    {framework.id === CUSTOM_CORE_FRAMEWORK.id ? t("wizard.customCoreName") : framework.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="wizard-field" htmlFor="expert-version">
              {customCoreSelected ? t("wizard.customVersion") : t("wizard.serverVersion")}
              {customCoreSelected ? (
                <input
                  id="expert-version"
                  value={customVersion}
                  onChange={(event) => setCustomVersion(event.target.value)}
                  placeholder={t("wizard.customVersionPlaceholder")}
                />
              ) : (
                <select id="expert-version" value={version} onChange={(event) => setVersion(event.target.value)}>
                  {availableVersions.map((versionOption) => (
                    <option key={versionOption} value={versionOption}>
                      {versionOption}
                    </option>
                  ))}
                </select>
              )}
            </label>

            {currentFramework && (
              <p className="instance-message">
                {customCoreSelected && t("wizard.customCoreExtra")}
                {currentFramework.id === CUSTOM_CORE_FRAMEWORK.id
                  ? t("wizard.customCoreDescription")
                  : localizedFrameworkDescription(currentFramework.id, t)}
              </p>
            )}
          </div>
        )}

        {mode && (
          <div className="wizard-step compact">
            <div className="wizard-grid two-column">
              <label className="wizard-field" htmlFor="instance-name">
                {t("wizard.instanceName")}
                <input
                  id="instance-name"
                  value={instanceName}
                  onChange={(event) => setInstanceName(event.target.value)}
                  placeholder={t("wizard.instanceNamePlaceholder")}
                />
              </label>

              <div className="wizard-grid two-column">
                <label className="wizard-field" htmlFor="min-memory">
                  {t("wizard.minMemory")}
                  <input
                    id="min-memory"
                    type="number"
                    min={512}
                    step={256}
                    value={minMemoryMb}
                    onChange={(event) => setMinMemoryMb(Number(event.target.value) || 0)}
                  />
                </label>
                <label className="wizard-field" htmlFor="max-memory">
                  {t("wizard.maxMemory")}
                  <input
                    id="max-memory"
                    type="number"
                    min={1024}
                    step={256}
                    value={maxMemoryMb}
                    onChange={(event) => setMaxMemoryMb(Number(event.target.value) || 0)}
                  />
                </label>
              </div>
            </div>

            {submitError && <p className="wizard-error">{submitError}</p>}

            <div className="wizard-actions">
              <button className="secondary-action" type="button" onClick={() => setMode(null)}>
                {t("wizard.back")}
              </button>
              <button className="primary-action" type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? t("wizard.creating") : t("wizard.create")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
