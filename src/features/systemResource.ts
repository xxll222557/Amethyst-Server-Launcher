import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export interface SystemResourceSnapshot {
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  timestamp: number;
}

export interface SystemResourceCard {
  label: string;
  value: string;
  hint: string;
}

export function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;

  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatPercent(value: number) {
  return `${Math.max(0, Math.min(100, value)).toFixed(0)}%`;
}

export function createResourceCards(snapshot: SystemResourceSnapshot | null): SystemResourceCard[] {
  if (!snapshot) {
    return [
      { label: "CPU", value: "--", hint: "等待系统数据" },
      { label: "内存", value: "--", hint: "等待系统数据" },
      { label: "磁盘", value: "--", hint: "等待系统数据" },
      { label: "刷新", value: "--", hint: "初始化中" },
    ];
  }

  const memoryPercent = snapshot.memoryTotal > 0 ? (snapshot.memoryUsed / snapshot.memoryTotal) * 100 : 0;
  const diskPercent = snapshot.diskTotal > 0 ? (snapshot.diskUsed / snapshot.diskTotal) * 100 : 0;

  return [
    { label: "CPU", value: formatPercent(snapshot.cpuUsage), hint: "当前平均占用" },
    {
      label: "内存",
      value: `${formatBytes(snapshot.memoryUsed)} / ${formatBytes(snapshot.memoryTotal)}`,
      hint: `占用 ${formatPercent(memoryPercent)}`,
    },
    {
      label: "磁盘",
      value: `${formatBytes(snapshot.diskUsed)} / ${formatBytes(snapshot.diskTotal)}`,
      hint: `占用 ${formatPercent(diskPercent)}`,
    },
    { label: "刷新", value: new Date(snapshot.timestamp).toLocaleTimeString(), hint: "系统监控已更新" },
  ];
}

export function useSystemResourceMonitor(refreshInterval = 2000) {
  const [snapshot, setSnapshot] = useState<SystemResourceSnapshot | null>(null);

  useEffect(() => {
    let active = true;

    const loadSnapshot = async () => {
      try {
        const nextSnapshot = await invoke<SystemResourceSnapshot>("get_system_resources");

        if (active) {
          setSnapshot(nextSnapshot);
        }
      } catch (error) {
        console.error("Failed to load system resources", error);
      }
    };

    loadSnapshot();
    const timer = window.setInterval(loadSnapshot, refreshInterval);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshInterval]);

  return snapshot;
}
