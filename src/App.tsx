import { useMemo, useState } from "react";
import "./App.css";
import { LauncherTopBar } from "./components";
import { HomePage, InstancesPage, SettingsPage } from "./pages";
import { useSystemResourceMonitor } from "./features/systemResource";

type DesktopPlatform = "macos" | "windows" | "linux" | "unknown";

function detectPlatform(): DesktopPlatform {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes("mac") || userAgent.includes("darwin")) {
    return "macos";
  }

  if (userAgent.includes("win")) {
    return "windows";
  }

  if (userAgent.includes("linux")) {
    return "linux";
  }

  return "unknown";
}

function App() {
  const [activeView, setActiveView] = useState<"home" | "instances" | "settings">("home");
  const [selectedServerName, setSelectedServerName] = useState("Survival Main");
  const systemResources = useSystemResourceMonitor();
  const platform = useMemo(() => detectPlatform(), []);

  return (
    <div className="app-shell">
      <main className="content">
        <LauncherTopBar
          platform={platform}
          activeView={activeView}
          systemResources={systemResources}
          onActiveViewChange={setActiveView}
        />

        <div className="view-frame">
          {activeView === "home" && (
            <HomePage
              selectedServerName={selectedServerName}
              onSelectServer={setSelectedServerName}
              systemResources={systemResources}
            />
          )}

          {activeView === "instances" && <InstancesPage />}

          {activeView === "settings" && <SettingsPage />}
        </div>
      </main>
    </div>
  );
}

export default App;
