import type { TranslationKey } from "../i18n";

export function getInstanceModeLabelKey(mode?: string): TranslationKey {
  if (mode === "beginner") {
    return "meta.mode.beginner";
  }
  if (mode === "expert") {
    return "meta.mode.expert";
  }
  return "instances.mode.unknown";
}

export function getInstanceGoalLabelKey(goal?: string): TranslationKey {
  if (goal === "vanilla") {
    return "meta.goal.vanilla";
  }
  if (goal === "mod") {
    return "meta.goal.mod";
  }
  if (goal === "plugin") {
    return "meta.goal.plugin";
  }
  if (goal === "hybrid") {
    return "meta.goal.hybrid";
  }
  return "instances.goal.unknown";
}