import { getVersion } from "@tauri-apps/api/app";
import type { UpdateChannel } from "./appSettings";

const RELEASES_API = "https://api.github.com/repos/nova/Amethyst-Server-Launcher/releases";

interface GithubReleaseItem {
  tag_name: string;
  html_url: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  releaseUrl: string;
  releaseNotes: string;
  channel: UpdateChannel;
}

function normalizeVersion(value: string) {
  return value.trim().replace(/^v/i, "");
}

function parseNumericParts(version: string) {
  return normalizeVersion(version)
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) && part >= 0 ? part : 0));
}

function compareVersions(current: string, latest: string) {
  const currentParts = parseNumericParts(current);
  const latestParts = parseNumericParts(latest);
  const maxLen = Math.max(currentParts.length, latestParts.length);

  for (let index = 0; index < maxLen; index += 1) {
    const currentValue = currentParts[index] ?? 0;
    const latestValue = latestParts[index] ?? 0;
    if (latestValue > currentValue) {
      return 1;
    }
    if (latestValue < currentValue) {
      return -1;
    }
  }

  return 0;
}

function selectRelease(releases: GithubReleaseItem[], channel: UpdateChannel) {
  if (channel === "beta") {
    return releases.find((release) => !release.draft) ?? null;
  }

  return releases.find((release) => !release.draft && !release.prerelease) ?? null;
}

export async function checkForLauncherUpdates(channel: UpdateChannel): Promise<UpdateCheckResult> {
  const currentVersion = await getVersion();

  const response = await fetch(RELEASES_API, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`E_UPDATE_HTTP::Update service responded with status ${response.status}`);
  }

  const payload = (await response.json()) as GithubReleaseItem[];
  const target = selectRelease(payload, channel);
  if (!target) {
    throw new Error("E_UPDATE_EMPTY::No matching release found");
  }

  const latestVersion = normalizeVersion(target.tag_name);

  return {
    currentVersion,
    latestVersion,
    available: compareVersions(currentVersion, latestVersion) < 0,
    releaseUrl: target.html_url,
    releaseNotes: target.body ?? "",
    channel,
  };
}
