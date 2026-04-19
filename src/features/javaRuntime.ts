export function recommendedJavaMajorFromMcVersion(version: string): number {
  const [majorRaw, minorRaw, patchRaw] = version.split(".");
  const major = Number.parseInt(majorRaw ?? "1", 10);
  const minor = Number.parseInt(minorRaw ?? "20", 10);
  const patch = Number.parseInt(patchRaw ?? "0", 10);

  if (major > 1 || (major === 1 && (minor > 20 || (minor === 20 && patch >= 5)))) {
    return 21;
  }
  if (major === 1 && minor >= 18) {
    return 17;
  }
  return 8;
}

export function javaInstallDirectory(mcVersion: string): string {
  const major = recommendedJavaMajorFromMcVersion(mcVersion);
  return `AppData/runtime/shared-java/java-${major}`;
}
