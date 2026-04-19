import { WindowControls } from "./WindowControls";
import { useI18n } from "../i18n";
import { useEffect, useMemo, useRef, useState } from "react";

interface LauncherTopBarProps {
  platform: "macos" | "windows" | "linux" | "unknown";
  activeView: "home" | "instances" | "settings";
  onActiveViewChange: (view: "home" | "instances" | "settings") => void;
}

function ViewIcon({ view }: { view: "home" | "instances" | "settings" }) {
  if (view === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11.5 12 5l8 6.5" />
        <path d="M6.5 10.5V19h11v-8.5" />
        <path d="M10 19v-5h4v5" />
      </svg>
    );
  }

  if (view === "instances") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="6.5" height="6.5" rx="1.5" />
        <rect x="13.5" y="5" width="6.5" height="6.5" rx="1.5" />
        <rect x="4" y="14" width="6.5" height="6.5" rx="1.5" />
        <rect x="13.5" y="14" width="6.5" height="6.5" rx="1.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v6" />
      <path d="M12 15v6" />
      <path d="M4.9 6.9l4.2 4.2" />
      <path d="M14.9 12.9l4.2 4.2" />
      <path d="M3 12h6" />
      <path d="M15 12h6" />
      <path d="M4.9 17.1l4.2-4.2" />
      <path d="M14.9 11.1l4.2-4.2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function LauncherTopBar({
  platform,
  activeView,
  onActiveViewChange,
}: LauncherTopBarProps) {
  const { t } = useI18n();
  const viewTabs = useMemo(
    () => [
      { key: "home" as const, label: t("app.nav.home") },
      { key: "instances" as const, label: t("app.nav.instances") },
      { key: "settings" as const, label: t("app.nav.settings") },
    ],
    [t],
  );
  const navRef = useRef<HTMLElement | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

  useEffect(() => {
    const activeIndex = viewTabs.findIndex((tab) => tab.key === activeView);
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
    <header className={`topbar ${platform}`} data-tauri-drag-region>
      <div className="topbar-left">
        <div className="brand-block compact">
          <h1 className="topbar-brand-name">{t("app.brand.launcherName")}</h1>
        </div>
      </div>

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

      <div className="topbar-right">
        <WindowControls platform={platform} />
      </div>
    </header>
  );
}
