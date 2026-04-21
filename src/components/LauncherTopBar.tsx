import { useI18n } from "../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppLanguage, AppearanceMode } from "../features/appSettings";

interface LauncherTopBarProps {
  activeView: "home" | "instances" | "market" | "downloads" | "settings";
  onActiveViewChange: (view: "home" | "instances" | "market" | "downloads" | "settings") => void;
  appearanceMode: AppearanceMode;
  onToggleAppearance: () => void;
  language: AppLanguage;
  onToggleLanguage: () => void;
  onOpenDownloads: () => void;
  onOpenInbox: () => void;
  inboxUnreadCount: number;
  inboxOpen: boolean;
}

function QuickThemeIcon({ mode }: { mode: AppearanceMode }) {
  if (mode === "dark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.6 4.5a7.6 7.6 0 1 0 5 11.3A8.2 8.2 0 0 1 14.6 4.5Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.1" />
      <path d="M12 2.8v2.4" />
      <path d="M12 18.8v2.4" />
      <path d="M4.8 12h2.4" />
      <path d="M16.8 12h2.4" />
      <path d="m5.9 5.9 1.7 1.7" />
      <path d="m16.4 16.4 1.7 1.7" />
      <path d="m18.1 5.9-1.7 1.7" />
      <path d="m7.6 16.4-1.7 1.7" />
    </svg>
  );
}

function QuickLanguageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 6.5h9" />
      <path d="M9 6.5c0 4.1-1.6 7.4-4.8 9.8" />
      <path d="M6 10.8c1.1 1.3 2.5 2.5 4.2 3.6" />
      <path d="M14.5 9.2h5" />
      <path d="m17 9.2 2.5 8.3" />
      <path d="m17 9.2-2.5 8.3" />
      <path d="M15.2 14.9h3.6" />
    </svg>
  );
}

function QuickDownloadsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 8.5h12" />
      <path d="M9.6 11.8 12 14.2l2.4-2.4" />
      <path d="M12 14.2V5" />
      <rect x="4.6" y="16" width="14.8" height="3.8" rx="1.1" />
    </svg>
  );
}

function QuickInboxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.8 7.2h14.4v9.6H4.8z" />
      <path d="M4.8 8.1 12 13l7.2-4.9" />
      <path d="M9.3 15.4h5.4" />
    </svg>
  );
}

function ViewIcon({ view }: { view: "home" | "instances" | "market" | "settings" }) {
  if (view === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.8 11.7 12 4.9l8.2 6.8" />
        <path d="M6.8 10.7v8.4h10.4v-8.4" />
        <path d="M10.1 19.1v-4.9h3.8v4.9" />
      </svg>
    );
  }

  if (view === "instances") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.4" y="4.8" width="15.2" height="5.1" rx="1.6" />
        <rect x="4.4" y="14.1" width="15.2" height="5.1" rx="1.6" />
        <path d="M8 7.4h.01" />
        <path d="M8 16.6h.01" />
        <path d="M11 7.4h5.2" />
        <path d="M11 16.6h5.2" />
      </svg>
    );
  }

  if (view === "market") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.6 8.2h14.8" />
        <path d="m6.3 8.2 1.1-3h9.2l1.1 3" />
        <path d="M5.8 8.2v9.6h12.4V8.2" />
        <path d="M10 11.3h4" />
        <path d="M10 14.6h4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="5" y1="7" x2="19" y2="7" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="5" y1="17" x2="19" y2="17" />
      <circle cx="9" cy="7" r="1.7" />
      <circle cx="14.7" cy="12" r="1.7" />
      <circle cx="11.1" cy="17" r="1.7" />
    </svg>
  );
}

export function LauncherTopBar({
  activeView,
  onActiveViewChange,
  appearanceMode,
  onToggleAppearance,
  language,
  onToggleLanguage,
  onOpenDownloads,
  onOpenInbox,
  inboxUnreadCount,
  inboxOpen,
}: LauncherTopBarProps) {
  const { t } = useI18n();
  const viewTabs = useMemo(
    () => [
      { key: "home" as const, label: t("app.nav.home") },
      { key: "instances" as const, label: t("app.nav.instances") },
      { key: "market" as const, label: t("app.nav.market") },
      { key: "settings" as const, label: t("app.nav.settings") },
    ],
    [t],
  );
  const navRef = useRef<HTMLElement | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

  useEffect(() => {
    const activeIndex = viewTabs.findIndex((tab) => tab.key === activeView);
    if (activeIndex < 0) {
      setIndicator((prev) => ({ ...prev, ready: false }));
      return;
    }

    const nav = navRef.current;
    const button = buttonRefs.current[activeIndex] ?? null;

    if (!nav || !button) {
      return;
    }

    const update = () => {
      const nextLeft = button.offsetLeft;
      const nextWidth = button.offsetWidth;
      setIndicator({ left: nextLeft, width: nextWidth, ready: true });
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(nav);
    observer.observe(button);

    return () => {
      observer.disconnect();
    };
  }, [activeView, viewTabs]);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand-block compact">
          <h1 className="topbar-brand-name">{t("app.brand.launcherName")}</h1>
        </div>
      </div>

      <div className="topbar-center">
        <nav className="tab-nav" aria-label={t("app.nav.main")} ref={navRef}>
          <span
            className={`tab-active-indicator ${indicator.ready ? "ready" : ""}`}
            style={{ width: `${indicator.width}px`, transform: `translateX(${indicator.left}px)` }}
            aria-hidden="true"
          />
          {viewTabs.map((tab, index) => (
            <button
              key={tab.key}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              className={`tab-button ${activeView === tab.key ? "active" : ""}`}
              type="button"
              onClick={() => onActiveViewChange(tab.key)}
            >
              <ViewIcon view={tab.key} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="topbar-right">
        <div className="topbar-actions topbar-quick-controls">
          <button
            className={`topbar-quick-button ${activeView === "downloads" ? "active" : ""}`}
            type="button"
            onClick={onOpenDownloads}
            aria-label={t("topbar.quick.downloads")}
            title={t("topbar.quick.downloads")}
          >
            <QuickDownloadsIcon />
          </button>

          <button
            className={`topbar-quick-button inbox-button ${inboxOpen ? "active" : ""}`}
            type="button"
            onClick={onOpenInbox}
            aria-label={t("topbar.quick.inbox")}
            title={t("topbar.quick.inbox")}
            aria-pressed={inboxOpen}
          >
            <QuickInboxIcon />
            {inboxUnreadCount > 0 ? (
              <span className="topbar-quick-badge" aria-hidden="true">
                {inboxUnreadCount > 99 ? "99+" : inboxUnreadCount}
              </span>
            ) : null}
          </button>

          <button
            className={`topbar-quick-button theme-toggle ${appearanceMode === "dark" ? "is-dark" : "is-light"}`}
            type="button"
            onClick={onToggleAppearance}
            aria-label={t("topbar.quick.theme")}
            title={t("topbar.quick.theme")}
            aria-pressed={appearanceMode === "dark"}
          >
            <QuickThemeIcon mode={appearanceMode} />
          </button>

          <button
            className="topbar-quick-button topbar-language-button"
            type="button"
            onClick={onToggleLanguage}
            aria-label={t("topbar.quick.language")}
            title={t("topbar.quick.language")}
            aria-pressed={language === "zh-CN"}
          >
            <QuickLanguageIcon />
            <span className="topbar-language-indicator" aria-hidden="true">
              <span className={language === "zh-CN" ? "active" : ""}>中</span>
              <span className={language === "en-US" ? "active" : ""}>EN</span>
            </span>
          </button>
        </div>

      </div>
    </header>
  );
}
