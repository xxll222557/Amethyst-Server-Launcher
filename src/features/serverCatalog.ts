export type ServerGoal = "vanilla" | "mod" | "plugin" | "hybrid";
export type CreationMode = "beginner" | "expert";

export interface ServerFramework {
  id: string;
  label: string;
  supports: ServerGoal[];
  recommendedForBeginner?: boolean;
  versions: string[];
  description: string;
}

export interface BeginnerProfile {
  goal: ServerGoal;
  recommendedMinMemoryMb: number;
  recommendedMaxMemoryMb: number;
  recommendedVersions: string[];
}

export const COMMON_VERSIONS = ["1.21.4", "1.21.1", "1.20.6", "1.20.4", "1.19.4"];

export const SERVER_FRAMEWORKS: ServerFramework[] = [
  {
    id: "vanilla",
    label: "Vanilla",
    supports: ["vanilla"],
    recommendedForBeginner: true,
    versions: COMMON_VERSIONS,
    description: "Official vanilla server. Stable and ideal for pure survival gameplay.",
  },
  {
    id: "paper",
    label: "Paper",
    supports: ["plugin"],
    recommendedForBeginner: true,
    versions: COMMON_VERSIONS,
    description: "High-performance plugin server with a mature ecosystem.",
  },
  {
    id: "fabric",
    label: "Fabric",
    supports: ["mod"],
    recommendedForBeginner: true,
    versions: COMMON_VERSIONS,
    description: "Lightweight mod platform with fast updates.",
  },
  {
    id: "forge",
    label: "Forge",
    supports: ["mod"],
    versions: ["1.20.4", "1.20.1", "1.19.4"],
    description: "Classic mod platform with strong legacy mod compatibility.",
  },
  {
    id: "purpur",
    label: "Purpur",
    supports: ["plugin"],
    versions: COMMON_VERSIONS,
    description: "Built on Paper with additional configurable features.",
  },
  {
    id: "mohist",
    label: "Mohist",
    supports: ["hybrid", "mod", "plugin"],
    versions: ["1.20.1", "1.19.2"],
    description: "Hybrid core that supports both mods and plugins.",
  },
  {
    id: "arclight",
    label: "Arclight",
    supports: ["hybrid", "mod", "plugin"],
    versions: ["1.20.1", "1.19.4"],
    description: "Highly compatible hybrid core suitable for advanced users.",
  },
];

export const BEGINNER_PROFILES: Record<ServerGoal, BeginnerProfile> = {
  vanilla: {
    goal: "vanilla",
    recommendedMinMemoryMb: 1024,
    recommendedMaxMemoryMb: 3072,
    recommendedVersions: ["1.21.4", "1.21.1", "1.20.6"],
  },
  plugin: {
    goal: "plugin",
    recommendedMinMemoryMb: 2048,
    recommendedMaxMemoryMb: 4096,
    recommendedVersions: ["1.21.4", "1.21.1", "1.20.4"],
  },
  mod: {
    goal: "mod",
    recommendedMinMemoryMb: 4096,
    recommendedMaxMemoryMb: 6144,
    recommendedVersions: ["1.20.4", "1.20.1", "1.19.4"],
  },
  hybrid: {
    goal: "hybrid",
    recommendedMinMemoryMb: 6144,
    recommendedMaxMemoryMb: 8192,
    recommendedVersions: ["1.20.1", "1.19.4"],
  },
};

export const GOAL_LABELS: Record<ServerGoal, string> = {
  vanilla: "Vanilla",
  mod: "Mod",
  plugin: "Plugin",
  hybrid: "Mod + Plugin",
};

export const MODE_LABELS: Record<CreationMode, string> = {
  beginner: "Beginner",
  expert: "Expert",
};

export function getFrameworksByGoal(goal: ServerGoal) {
  return SERVER_FRAMEWORKS.filter((framework) => framework.supports.includes(goal));
}

export function getFrameworkById(id: string) {
  return SERVER_FRAMEWORKS.find((framework) => framework.id === id);
}

export function getBeginnerProfile(goal: ServerGoal) {
  return BEGINNER_PROFILES[goal];
}
