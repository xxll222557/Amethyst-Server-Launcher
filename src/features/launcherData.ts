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
  { label: "在线实例", value: "3", hint: "1 个正在启动，2 个已运行" },
  { label: "磁盘占用", value: "128 GB", hint: "本地存储使用率 42%" },
  { label: "最近备份", value: "12 分钟前", hint: "自动备份任务已完成" },
  { label: "当前版本", value: "v0.1.0", hint: "启动器自身更新已启用" },
];

export const servers: ServerEntry[] = [
  {
    name: "Survival Main",
    type: "Paper 1.20.4",
    status: "运行中",
    statusTone: "good",
    players: "18 / 50",
    path: "~/Minecraft/Servers/Survival",
    actions: ["控制台", "重启", "备份"],
  },
  {
    name: "Modpack Lab",
    type: "Fabric 1.20.1",
    status: "启动中",
    statusTone: "warning",
    players: "0 / 20",
    path: "~/Minecraft/Servers/Modpack-Lab",
    actions: ["打开日志", "停止", "设置"],
  },
  {
    name: "Legacy World",
    type: "Forge 1.12.2",
    status: "已停止",
    statusTone: "muted",
    players: "0 / 10",
    path: "~/Minecraft/Servers/Legacy-World",
    actions: ["启动", "下载更新", "文件夹"],
  },
];

export const activity: ActivityItem[] = [
  { time: "09:42", title: "Survival Main 启动成功", detail: "Java 17 / 4 GB 内存 / 18 名玩家在线" },
  { time: "09:31", title: "Modpack Lab 正在解压服务端", detail: "下载进度 78%，自动校验已开启" },
  { time: "09:12", title: "Legacy World 备份完成", detail: "已写入本地备份目录" },
  { time: "08:58", title: "启动器完成版本检查", detail: "当前为最新版本" },
];
