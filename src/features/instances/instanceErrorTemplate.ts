import type { TranslationKey } from "../../i18n";

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export interface InstanceErrorTemplate {
  title: string;
  detail: string;
  action: string;
}

export function getInstanceErrorTemplate(code: string, detail: string, t: Translate): InstanceErrorTemplate {
  if (code === "E_PORT_IN_USE") {
    return {
      title: t("instances.error.portInUse.title"),
      detail: t("instances.error.portInUse.detail", { detail }),
      action: t("instances.error.portInUse.action"),
    };
  }

  if (code === "E_DIR_NOT_WRITABLE") {
    return {
      title: t("instances.error.dirNotWritable.title"),
      detail: t("instances.error.dirNotWritable.detail", { detail }),
      action: t("instances.error.dirNotWritable.action"),
    };
  }

  if (code === "E_JAVA_MISSING") {
    return {
      title: t("instances.error.javaMissing.title"),
      detail,
      action: t("instances.error.javaMissing.action"),
    };
  }

  if (code === "E_INSTANCE_ALREADY_RUNNING") {
    return {
      title: t("instances.error.instanceRunning.title"),
      detail,
      action: t("instances.error.instanceRunning.action"),
    };
  }

  if (code === "E_CORE_MISSING") {
    return {
      title: t("instances.error.coreMissing.title"),
      detail,
      action: t("instances.error.coreMissing.action"),
    };
  }

  if (code.startsWith("E_CORE_")) {
    return {
      title: t("instances.error.coreDownload.title"),
      detail,
      action: t("instances.error.coreDownload.action"),
    };
  }

  if (code.startsWith("E_JAVA_")) {
    return {
      title: t("instances.error.javaDownload.title"),
      detail,
      action: t("instances.error.javaDownload.action"),
    };
  }

  return {
    title: t("instances.error.generic.title"),
    detail,
    action: t("instances.error.generic.action"),
  };
}