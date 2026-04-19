import { useEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  defaultAppSettings,
  type AppSettings,
  type BackgroundPreset,
  type DownloadSource,
  type UpdateChannel,
  useAppSettings,
} from "../features/appSettings";
import { useI18n } from "../i18n";

type SettingsSection = "launch" | "personalization" | "download" | "about";
type DownloadFolderKey = "core" | "java" | "mods" | "backups";

function sourceLabel(
  value: DownloadSource,
  t: (key: "settings.download.source.official" | "settings.download.source.mirror" | "settings.download.source.auto") => string,
) {
  if (value === "official") {
    return t("settings.download.source.official");
  }
  if (value === "mirror-cn") {
    return t("settings.download.source.mirror");
  }
  return t("settings.download.source.auto");
}

function sectionTitle(
  section: SettingsSection,
  t: (
    key:
      | "settings.section.launch"
      | "settings.section.personalization"
      | "settings.section.download"
      | "settings.section.about",
  ) => string,
) {
  if (section === "launch") {
    return t("settings.section.launch");
  }
  if (section === "personalization") {
    return t("settings.section.personalization");
  }
  if (section === "download") {
    return t("settings.section.download");
  }
  return t("settings.section.about");
}

function SettingsSectionIcon({ section }: { section: SettingsSection }) {
  if (section === "launch") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.8 6.2 9.6l2 2 3.8-3.8 3.8 3.8 2-2z" />
        <path d="M8.4 12.1h7.2" />
        <path d="M9.4 15.8h5.2" />
      </svg>
    );
  }

  if (section === "personalization") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4.2a7.8 7.8 0 1 0 0 15.6 2.4 2.4 0 0 0 0-4.8h-.6" />
        <circle cx="8.2" cy="10" r="1.1" />
        <circle cx="10.1" cy="7.4" r="1.1" />
        <circle cx="14" cy="7.4" r="1.1" />
      </svg>
    );
  }

  if (section === "download") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 8.5h12" />
        <path d="M12 5v9.2" />
        <path d="m9.6 11.8 2.4 2.4 2.4-2.4" />
        <rect x="4.6" y="16" width="14.8" height="3.6" rx="1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.8" />
      <path d="M12 9.4v3.6" />
      <circle cx="12" cy="15.9" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface SettingsPageProps {
  onOpenFirstRunGuide?: () => void;
  checkingUpdates?: boolean;
  onCheckUpdates?: () => void;
}

export function SettingsPage({ onOpenFirstRunGuide, checkingUpdates = false, onCheckUpdates }: SettingsPageProps) {
  const { t } = useI18n();
  const [settings, setSettings] = useAppSettings();
  const [activeSection, setActiveSection] = useState<SettingsSection>("launch");
  const [selectedBackgroundName, setSelectedBackgroundName] = useState("");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const sectionLockRef = useRef(false);
  const sectionLockTimerRef = useRef<number | null>(null);
  const backgroundFileInputRef = useRef<HTMLInputElement | null>(null);
  const launchRef = useRef<HTMLElement | null>(null);
  const personalizationRef = useRef<HTMLElement | null>(null);
  const downloadRef = useRef<HTMLElement | null>(null);
  const aboutRef = useRef<HTMLElement | null>(null);

  const presetOptions: Array<{ value: BackgroundPreset; label: string }> = [
    { value: "aurora", label: t("settings.preset.aurora") },
    { value: "sunset", label: t("settings.preset.sunset") },
    { value: "forest", label: t("settings.preset.forest") },
    { value: "midnight", label: t("settings.preset.midnight") },
    { value: "ocean", label: t("settings.preset.ocean") },
    { value: "dawn", label: t("settings.preset.dawn") },
    { value: "ember", label: t("settings.preset.ember") },
    { value: "graphite", label: t("settings.preset.graphite") },
  ];

  const sections: Array<{ key: SettingsSection; desc: string }> = useMemo(
    () => [
      { key: "launch", desc: t("settings.section.launch.desc") },
      { key: "personalization", desc: t("settings.section.personalization.desc") },
      { key: "download", desc: t("settings.section.download.desc") },
      { key: "about", desc: t("settings.section.about.desc") },
    ],
    [t],
  );

  const patchSettings = (updater: (current: AppSettings) => AppSettings) => {
    setSettings((current) => updater(current));
  };

  const browseDownloadFolder = async (key: DownloadFolderKey) => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("settings.dialog.selectFolder"),
      defaultPath: settings.download.folders[key],
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    patchSettings((current) => ({
      ...current,
      download: {
        ...current.download,
        folders: {
          ...current.download.folders,
          [key]: selected,
        },
      },
    }));
  };

  const clearDownloadFolder = (key: DownloadFolderKey) => {
    patchSettings((current) => ({
      ...current,
      download: {
        ...current.download,
        folders: {
          ...current.download.folders,
          [key]: "",
        },
      },
    }));
  };

  const sectionRefs: Record<SettingsSection, RefObject<HTMLElement>> = {
    launch: launchRef,
    personalization: personalizationRef,
    download: downloadRef,
    about: aboutRef,
  };

  useEffect(() => {
    const root = contentRef.current;
    if (!root) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (sectionLockRef.current) {
          return;
        }

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (!visible[0]?.target.id) {
          return;
        }

        const id = visible[0].target.id as SettingsSection;
        setActiveSection(id);
      },
      {
        root,
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0.2, 0.5, 0.8],
      },
    );

    Object.values(sectionRefs).forEach((sectionRef) => {
      if (sectionRef.current) {
        observer.observe(sectionRef.current);
      }
    });

    return () => {
      observer.disconnect();
      if (sectionLockTimerRef.current !== null) {
        window.clearTimeout(sectionLockTimerRef.current);
        sectionLockTimerRef.current = null;
      }
    };
  }, []);

  const scrollToSection = (section: SettingsSection) => {
    const container = contentRef.current;
    const target = sectionRefs[section].current;
    if (!container || !target) {
      return;
    }

    if (sectionLockTimerRef.current !== null) {
      window.clearTimeout(sectionLockTimerRef.current);
    }
    sectionLockRef.current = true;
    setActiveSection(section);
    const offset = target.offsetTop - 8;
    container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });

    sectionLockTimerRef.current = window.setTimeout(() => {
      sectionLockRef.current = false;
      sectionLockTimerRef.current = null;
    }, 460);
  };

  const handleBackgroundBrowse = () => {
    backgroundFileInputRef.current?.click();
  };

  const handleBackgroundFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setSelectedBackgroundName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      patchSettings((current) => ({
        ...current,
        personalization: {
          ...current.personalization,
          backgroundImageUrl: result,
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className="panel page-panel settings-layout">
      <div className="panel-header">
        <div>
          <p className="panel-label">{t("settings.label")}</p>
          <h3>{t("settings.title")}</h3>
        </div>
        <button className="ghost-action" type="button" onClick={() => setSettings(defaultAppSettings)}>
          {t("settings.restoreDefault")}
        </button>
      </div>

      <div className="settings-workspace">
        <aside className="settings-side-nav" aria-label={t("settings.label")}>
          {sections.map((item) => (
            <button
              key={item.key}
              className={`settings-side-item ${activeSection === item.key ? "active" : ""}`}
              type="button"
              onClick={() => scrollToSection(item.key)}
            >
              <span className="settings-side-item-icon" aria-hidden="true">
                <SettingsSectionIcon section={item.key} />
              </span>
              <span className="settings-side-item-copy">
                <strong>{sectionTitle(item.key, t)}</strong>
                <span>{item.desc}</span>
              </span>
            </button>
          ))}
        </aside>

        <div className="settings-content" ref={contentRef}>
          <article className="settings-section" id="launch" ref={launchRef}>
            <article className="setting-card clean">
              <h4>{t("settings.launch.title")}</h4>
              <p>{t("settings.launch.desc")}</p>

              <div className="settings-form-grid two-column">
                <label className="settings-field">
                  <span>{t("settings.launch.minMemory")}</span>
                  <input
                    type="number"
                    min={512}
                    step={256}
                    value={settings.launch.minMemoryMb}
                    onChange={(event) => {
                      const value = Math.max(512, Number(event.target.value) || 512);
                      patchSettings((current) => ({
                        ...current,
                        launch: {
                          ...current.launch,
                          minMemoryMb: value,
                          maxMemoryMb: Math.max(value, current.launch.maxMemoryMb),
                        },
                      }));
                    }}
                  />
                </label>

                <label className="settings-field">
                  <span>{t("settings.launch.maxMemory")}</span>
                  <input
                    type="number"
                    min={512}
                    step={256}
                    value={settings.launch.maxMemoryMb}
                    onChange={(event) => {
                      const value = Math.max(settings.launch.minMemoryMb, Number(event.target.value) || settings.launch.minMemoryMb);
                      patchSettings((current) => ({
                        ...current,
                        launch: {
                          ...current.launch,
                          maxMemoryMb: value,
                        },
                      }));
                    }}
                  />
                </label>
              </div>

              <label className="settings-field">
                <span>{t("settings.launch.javaArgs")}</span>
                <textarea
                  rows={4}
                  value={settings.launch.javaArgs}
                  onChange={(event) => {
                    const value = event.target.value;
                    patchSettings((current) => ({
                      ...current,
                      launch: {
                        ...current.launch,
                        javaArgs: value,
                      },
                    }));
                  }}
                />
              </label>

              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={settings.launch.enableGcTuning}
                  onChange={(event) => {
                    const value = event.target.checked;
                    patchSettings((current) => ({
                      ...current,
                      launch: {
                        ...current.launch,
                        enableGcTuning: value,
                      },
                    }));
                  }}
                />
                <span>{t("settings.launch.gc")}</span>
              </label>
            </article>
          </article>

          <article className="settings-section" id="personalization" ref={personalizationRef}>
            <article className="setting-card clean">
              <h4>{t("settings.personalization.title")}</h4>
              <p>{t("settings.personalization.desc")}</p>

              <div className="settings-form-grid two-column">
                <label className="settings-field">
                  <span>{t("settings.personalization.themeColor")}</span>
                  <div className="settings-color-row">
                    <input
                      type="color"
                      value={settings.personalization.themeColor}
                      onChange={(event) => {
                        const value = event.target.value;
                        patchSettings((current) => ({
                          ...current,
                          personalization: {
                            ...current.personalization,
                            themeColor: value,
                          },
                        }));
                      }}
                    />
                    <code>{settings.personalization.themeColor}</code>
                  </div>
                </label>

                <label className="settings-field">
                  <span>{t("settings.personalization.backgroundPreset")}</span>
                  <select
                    value={settings.personalization.backgroundPreset}
                    onChange={(event) => {
                      const value = event.target.value as BackgroundPreset;
                      patchSettings((current) => ({
                        ...current,
                        personalization: {
                          ...current.personalization,
                          backgroundPreset: value,
                        },
                      }));
                    }}
                  >
                    {presetOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="settings-field">
                <span>{t("settings.personalization.customBackground")}</span>
                <input
                  ref={backgroundFileInputRef}
                  type="file"
                  accept="image/*"
                  className="settings-hidden-file"
                  onChange={handleBackgroundFileChange}
                />
                <div className="settings-file-row">
                  <button className="chip-button" type="button" onClick={handleBackgroundBrowse}>
                    {t("settings.personalization.browse")}
                  </button>
                  <button
                    className="chip-button"
                    type="button"
                    onClick={() => {
                      setSelectedBackgroundName("");
                      patchSettings((current) => ({
                        ...current,
                        personalization: {
                          ...current.personalization,
                          backgroundImageUrl: "",
                        },
                      }));
                    }}
                  >
                    {t("settings.personalization.clear")}
                  </button>
                  <span className="settings-file-name">
                    {selectedBackgroundName || (settings.personalization.backgroundImageUrl ? t("settings.personalization.bgApplied") : t("settings.personalization.bgEmpty"))}
                  </span>
                </div>
              </label>

              <h5 className="settings-subtitle">{t("settings.personalization.homeWidgets")}</h5>
              <div className="settings-switch-list">
                <label className="settings-switch">
                  <input
                    type="checkbox"
                    checked={settings.personalization.homeWidgets.showResourcePanel}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      patchSettings((current) => ({
                        ...current,
                        personalization: {
                          ...current.personalization,
                          homeWidgets: {
                            ...current.personalization.homeWidgets,
                            showResourcePanel: checked,
                          },
                        },
                      }));
                    }}
                  />
                  <span>{t("settings.personalization.widget.resource")}</span>
                </label>

                <label className="settings-switch">
                  <input
                    type="checkbox"
                    checked={settings.personalization.homeWidgets.showOverviewCards}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      patchSettings((current) => ({
                        ...current,
                        personalization: {
                          ...current.personalization,
                          homeWidgets: {
                            ...current.personalization.homeWidgets,
                            showOverviewCards: checked,
                          },
                        },
                      }));
                    }}
                  />
                  <span>{t("settings.personalization.widget.overview")}</span>
                </label>

                <label className="settings-switch">
                  <input
                    type="checkbox"
                    checked={settings.personalization.homeWidgets.showInstanceList}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      patchSettings((current) => ({
                        ...current,
                        personalization: {
                          ...current.personalization,
                          homeWidgets: {
                            ...current.personalization.homeWidgets,
                            showInstanceList: checked,
                          },
                        },
                      }));
                    }}
                  />
                  <span>{t("settings.personalization.widget.instance")}</span>
                </label>

                <label className="settings-switch">
                  <input
                    type="checkbox"
                    checked={settings.personalization.homeWidgets.showTaskFlow}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      patchSettings((current) => ({
                        ...current,
                        personalization: {
                          ...current.personalization,
                          homeWidgets: {
                            ...current.personalization.homeWidgets,
                            showTaskFlow: checked,
                          },
                        },
                      }));
                    }}
                  />
                  <span>{t("settings.personalization.widget.flow")}</span>
                </label>
              </div>
            </article>
          </article>

          <article className="settings-section" id="download" ref={downloadRef}>
            <article className="setting-card clean">
              <h4>{t("settings.download.title")}</h4>
              <p>{t("settings.download.desc")}</p>

              <div className="settings-form-grid two-column">
                <label className="settings-field">
                  <span>{t("settings.download.fileSource")}</span>
                  <select
                    value={settings.download.fileSource}
                    onChange={(event) => {
                      const value = event.target.value as DownloadSource;
                      patchSettings((current) => ({
                        ...current,
                        download: {
                          ...current.download,
                          fileSource: value,
                        },
                      }));
                    }}
                  >
                    <option value="official">{t("settings.download.source.official")}</option>
                    <option value="mirror-cn">{t("settings.download.source.mirror")}</option>
                    <option value="auto">{t("settings.download.source.auto")}</option>
                  </select>
                </label>

                <label className="settings-field">
                  <span>{t("settings.download.versionSource")}</span>
                  <select
                    value={settings.download.versionSource}
                    onChange={(event) => {
                      const value = event.target.value as DownloadSource;
                      patchSettings((current) => ({
                        ...current,
                        download: {
                          ...current.download,
                          versionSource: value,
                        },
                      }));
                    }}
                  >
                    <option value="official">{t("settings.download.source.official")}</option>
                    <option value="mirror-cn">{t("settings.download.source.mirror")}</option>
                    <option value="auto">{t("settings.download.source.auto")}</option>
                  </select>
                </label>

                <label className="settings-field">
                  <span>{t("settings.download.maxThreads", { value: settings.download.maxThreads })}</span>
                  <input
                    type="range"
                    min={1}
                    max={32}
                    step={1}
                    value={settings.download.maxThreads}
                    onChange={(event) => {
                      const value = Math.min(32, Math.max(1, Number(event.target.value) || 1));
                      patchSettings((current) => ({
                        ...current,
                        download: {
                          ...current.download,
                          maxThreads: value,
                        },
                      }));
                    }}
                  />
                </label>

                <label className="settings-field">
                  <span>
                    {t("settings.download.speedLimit", {
                      value: settings.download.speedLimitMbps === 0 ? t("settings.download.unlimited") : `${settings.download.speedLimitMbps} Mbps`,
                    })}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={1}
                    value={settings.download.speedLimitMbps}
                    onChange={(event) => {
                      const value = Math.max(0, Number(event.target.value) || 0);
                      patchSettings((current) => ({
                        ...current,
                        download: {
                          ...current.download,
                          speedLimitMbps: value,
                        },
                      }));
                    }}
                  />
                </label>
              </div>

              <h5 className="settings-subtitle">{t("settings.download.folders")}</h5>
              <div className="settings-form-grid two-column">
                <label className="settings-field">
                  <span>{t("settings.download.folder.core")}</span>
                  <div className="settings-folder-row">
                    <input type="text" value={settings.download.folders.core || t("settings.download.folder.empty")} readOnly />
                    <button className="chip-button" type="button" onClick={() => void browseDownloadFolder("core")}>
                      {t("settings.download.browse")}
                    </button>
                    <button className="chip-button" type="button" onClick={() => clearDownloadFolder("core")}>
                      {t("settings.download.clear")}
                    </button>
                  </div>
                </label>

                <label className="settings-field">
                  <span>{t("settings.download.folder.java")}</span>
                  <div className="settings-folder-row">
                    <input type="text" value={settings.download.folders.java || t("settings.download.folder.empty")} readOnly />
                    <button className="chip-button" type="button" onClick={() => void browseDownloadFolder("java")}>
                      {t("settings.download.browse")}
                    </button>
                    <button className="chip-button" type="button" onClick={() => clearDownloadFolder("java")}>
                      {t("settings.download.clear")}
                    </button>
                  </div>
                </label>

                <label className="settings-field">
                  <span>{t("settings.download.folder.mods")}</span>
                  <div className="settings-folder-row">
                    <input type="text" value={settings.download.folders.mods || t("settings.download.folder.empty")} readOnly />
                    <button className="chip-button" type="button" onClick={() => void browseDownloadFolder("mods")}>
                      {t("settings.download.browse")}
                    </button>
                    <button className="chip-button" type="button" onClick={() => clearDownloadFolder("mods")}>
                      {t("settings.download.clear")}
                    </button>
                  </div>
                </label>

                <label className="settings-field">
                  <span>{t("settings.download.folder.backups")}</span>
                  <div className="settings-folder-row">
                    <input type="text" value={settings.download.folders.backups || t("settings.download.folder.empty")} readOnly />
                    <button className="chip-button" type="button" onClick={() => void browseDownloadFolder("backups")}>
                      {t("settings.download.browse")}
                    </button>
                    <button className="chip-button" type="button" onClick={() => clearDownloadFolder("backups")}>
                      {t("settings.download.clear")}
                    </button>
                  </div>
                </label>
              </div>

              <p className="instance-message">
                {t("settings.download.summary", {
                  fileSource: sourceLabel(settings.download.fileSource, t),
                  versionSource: sourceLabel(settings.download.versionSource, t),
                  threads: settings.download.maxThreads,
                })}
              </p>
            </article>
          </article>

          <article className="settings-section" id="about" ref={aboutRef}>
            <article className="setting-card clean">
              <h4>{t("settings.about.title")}</h4>
              <p>{t("settings.about.desc")}</p>

              <div className="settings-about-grid">
                <div className="settings-about-block">
                  <h5>{t("settings.about.programInfo")}</h5>
                  <ul>
                    <li>{t("settings.about.version")}</li>
                    <li>{t("settings.about.stack")}</li>
                    <li>{t("settings.about.mode")}</li>
                  </ul>
                </div>

                <div className="settings-about-block">
                  <h5>{t("settings.about.thanks")}</h5>
                  <ul>
                    <li>{t("settings.about.eco")}</li>
                    <li>{t("settings.about.oss1")}</li>
                    <li>{t("settings.about.oss2")}</li>
                  </ul>
                </div>
              </div>

              <h5 className="settings-subtitle">{t("settings.about.update")}</h5>
              <div className="settings-switch-list">
                <label className="settings-switch">
                  <input
                    type="checkbox"
                    checked={settings.about.autoCheckUpdates}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      patchSettings((current) => ({
                        ...current,
                        about: {
                          ...current.about,
                          autoCheckUpdates: checked,
                        },
                      }));
                    }}
                  />
                  <span>{t("settings.about.autoUpdate")}</span>
                </label>

                <label className="settings-field inline">
                  <span>{t("settings.about.channel")}</span>
                  <select
                    value={settings.about.updateChannel}
                    onChange={(event) => {
                      const value = event.target.value as UpdateChannel;
                      patchSettings((current) => ({
                        ...current,
                        about: {
                          ...current.about,
                          updateChannel: value,
                        },
                      }));
                    }}
                  >
                    <option value="stable">Stable</option>
                    <option value="beta">Beta</option>
                  </select>
                </label>
              </div>

              <div className="hero-actions settings-actions">
                <button
                  className="chip-button"
                  type="button"
                  disabled={checkingUpdates}
                  onClick={() => {
                    if (checkingUpdates) {
                      return;
                    }

                    onCheckUpdates?.();
                  }}
                >
                  {checkingUpdates ? t("settings.about.checking") : t("settings.about.checkNow")}
                </button>
                <button
                  className="chip-button"
                  type="button"
                  onClick={() => {
                    onOpenFirstRunGuide?.();
                  }}
                >
                  {t("settings.about.firstRun")}
                </button>
              </div>
            </article>
          </article>
        </div>
      </div>
    </section>
  );
}
