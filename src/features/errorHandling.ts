import type { TranslationKey } from "../i18n";

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export interface TaggedError {
  code: string;
  detail: string;
}

export function getErrorText(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const objectError = error as Record<string, unknown>;
    const direct = objectError.message;
    if (typeof direct === "string" && direct.trim()) {
      return direct;
    }

    const nested = objectError.error;
    if (typeof nested === "string" && nested.trim()) {
      return nested;
    }
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function withErrorCode(rawError: unknown, fallbackCode: string): TaggedError {
  const text = getErrorText(rawError).trim();
  const match = text.match(/^([A-Z0-9_]+)::(.*)$/s);
  if (match) {
    return {
      code: match[1],
      detail: match[2].trim() || text,
    };
  }

  return {
    code: fallbackCode,
    detail: text,
  };
}

export function localizeErrorText(t: Translate, error: unknown, fallbackCode = "E_GENERIC") {
  const tagged = withErrorCode(error, fallbackCode);

  if (tagged.code === "E_PORT_IN_USE") {
    return `${t("instances.error.portInUse.title")} (${tagged.code}): ${t("instances.error.portInUse.detail", {
      detail: tagged.detail,
    })}`;
  }

  if (tagged.code === "E_DIR_NOT_WRITABLE") {
    return `${t("instances.error.dirNotWritable.title")} (${tagged.code}): ${t("instances.error.dirNotWritable.detail", {
      detail: tagged.detail,
    })}`;
  }

  if (
    tagged.code === "E_JAVA_NOT_FOUND" ||
    tagged.code === "E_JAVA_INVALID_PATH" ||
    tagged.code === "E_JAVA_MISSING" ||
    tagged.code === "MISSING_JAVA_RUNTIME" ||
    tagged.code.startsWith("E_JAVA_")
  ) {
    return `${t("instances.error.javaMissing.title")} (${tagged.code}): ${tagged.detail}`;
  }

  if (tagged.code === "E_INSTANCE_ALREADY_RUNNING") {
    return `${t("instances.error.instanceRunning.title")} (${tagged.code}): ${tagged.detail}`;
  }

  if (tagged.code === "E_CORE_MISSING") {
    return `${t("instances.error.coreMissing.title")} (${tagged.code}): ${tagged.detail}`;
  }

  if (tagged.code.startsWith("E_CORE_")) {
    return `${t("instances.error.coreDownload.title")} (${tagged.code}): ${tagged.detail}`;
  }

  return `${tagged.code}: ${tagged.detail}`;
}