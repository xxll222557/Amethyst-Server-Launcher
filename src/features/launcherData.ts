export type ServerStatusTone = "good" | "warning" | "muted";

export type ServerAction = string;

export interface ServerEntry {
  name: string;
  type: string;
  status: string;
  statusTone: ServerStatusTone;
  players: string;
  path: string;
  actions: ServerAction[];
}

export interface OverviewCard {
  label: string;
  value: string;
  hint: string;
}

export interface ActivityItem {
  time: string;
  title: string;
  detail: string;
}

export const overviewCards: OverviewCard[] = [
  { label: "Online Instances", value: "3", hint: "1 starting, 2 running" },
  { label: "Disk Usage", value: "128 GB", hint: "Local storage usage 42%" },
  { label: "Last Backup", value: "12 minutes ago", hint: "Auto backup task completed" },
  { label: "Current Version", value: "v0.1.0", hint: "Launcher self-update is enabled" },
];

export const servers: ServerEntry[] = [
  {
    name: "Survival Main",
    type: "Paper 1.20.4",
    status: "Running",
    statusTone: "good",
    players: "18 / 50",
    path: "~/Minecraft/Servers/Survival",
    actions: ["Console", "Restart", "Backup"],
  },
  {
    name: "Modpack Lab",
    type: "Fabric 1.20.1",
    status: "Starting",
    statusTone: "warning",
    players: "0 / 20",
    path: "~/Minecraft/Servers/Modpack-Lab",
    actions: ["Open Logs", "Stop", "Settings"],
  },
  {
    name: "Legacy World",
    type: "Forge 1.12.2",
    status: "Stopped",
    statusTone: "muted",
    players: "0 / 10",
    path: "~/Minecraft/Servers/Legacy-World",
    actions: ["Start", "Download Updates", "Folder"],
  },
];

export const activity: ActivityItem[] = [
  { time: "09:42", title: "Survival Main started successfully", detail: "Java 17 / 4 GB memory / 18 players online" },
  { time: "09:31", title: "Modpack Lab is extracting server files", detail: "Download progress 78%, auto verification enabled" },
  { time: "09:12", title: "Legacy World backup completed", detail: "Written to local backup directory" },
  { time: "08:58", title: "Launcher version check completed", detail: "Already on the latest version" },
];
