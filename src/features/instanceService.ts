import { invoke } from "@tauri-apps/api/core";

export interface InstanceConfig {
  id: string;
  name: string;
  serverType: string;
  serverGoal?: string;
  creationMode?: string;
  frameworkDescription?: string;
  version: string;
  directory: string;
  javaPath?: string;
  coreDownloaded?: boolean;
  minMemoryMb: number;
  maxMemoryMb: number;
}

export interface InstanceFileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
}

export interface CreateInstanceRequest {
  name: string;
  serverType: string;
  serverGoal?: string;
  creationMode?: string;
  frameworkDescription?: string;
  version: string;
  minMemoryMb: number;
  maxMemoryMb: number;
}

export interface LaunchResult {
  instanceId: string;
  pid: number;
  command: string;
}

export interface DownloadResult {
  instanceId: string;
  serverType: string;
  version: string;
  sourceUrl: string;
  outputPath: string;
  bytesWritten: number;
  javaDownloaded: boolean;
  javaExecutablePath?: string;
}

export interface DownloadProgressEvent {
  instanceId: string;
  item: string;
  downloadedBytes: number;
  totalBytes?: number;
  percent: number;
  bytesPerSecond: number;
  status: string;
  message?: string;
}

export interface JavaRuntimeStatus {
  available: boolean;
  path?: string;
  reason?: string;
}

export interface InstanceProcessStatus {
  running: boolean;
}

export interface InstancePreflightIssue {
  code: string;
  message: string;
  detail?: string;
  hint?: string;
}

export interface InstancePreflightReport {
  instanceId: string;
  canStart: boolean;
  issues: InstancePreflightIssue[];
}

export async function getInstances() {
  return invoke<InstanceConfig[]>("get_instances");
}

export async function createInstanceConfig(request: CreateInstanceRequest) {
  return invoke<InstanceConfig>("create_instance_config", { request });
}

export async function startInstanceServer(instanceId: string) {
  return invoke<LaunchResult>("start_instance_server", { instanceId });
}

export async function getInstanceJavaRuntimeStatus(instanceId: string) {
  return invoke<JavaRuntimeStatus>("get_instance_java_runtime_status", { instanceId });
}

export async function getInstanceProcessStatus(instanceId: string) {
  return invoke<InstanceProcessStatus>("get_instance_process_status", { instanceId });
}

export async function checkInstancePreflight(instanceId: string) {
  return invoke<InstancePreflightReport>("check_instance_preflight", { instanceId });
}

export async function sendInstanceCommand(instanceId: string, command: string) {
  return invoke<void>("send_instance_command", { instanceId, command });
}

export async function stopInstanceProcess(instanceId: string) {
  return invoke<void>("stop_instance_process", { instanceId });
}

export async function downloadInstanceCore(instanceId: string, includeJava: boolean) {
  return invoke<DownloadResult>("download_instance_core", { instanceId, includeJava });
}

export async function downloadInstanceJavaRuntime(instanceId: string) {
  return invoke<string>("download_instance_java_runtime", { instanceId });
}

export async function updateInstanceJavaPath(instanceId: string, javaPath?: string) {
  return invoke<InstanceConfig>("update_instance_java_path_command", { instanceId, javaPath });
}

export async function deleteInstance(instanceId: string) {
  return invoke<void>("delete_instance_command", { instanceId });
}

export async function readInstanceLogTail(instanceId: string, maxLines = 300) {
  return invoke<string[]>("read_instance_log_tail", { instanceId, maxLines });
}

export async function getInstanceConsoleLogs(instanceId: string, maxLines = 400) {
  return invoke<string[]>("get_instance_console_logs", { instanceId, maxLines });
}

export async function listInstanceFiles(instanceId: string, relativePath?: string) {
  return invoke<InstanceFileEntry[]>("list_instance_files", { instanceId, relativePath });
}

export async function readInstanceTextFile(instanceId: string, relativePath: string) {
  return invoke<string>("read_instance_text_file", { instanceId, relativePath });
}

export async function writeInstanceTextFile(instanceId: string, relativePath: string, content: string) {
  return invoke<void>("write_instance_text_file", { instanceId, relativePath, content });
}

export async function createInstanceDirectory(instanceId: string, relativePath: string) {
  return invoke<void>("create_instance_directory", { instanceId, relativePath });
}

export async function exportTextFile(path: string, content: string) {
  return invoke<void>("export_text_file", { path, content });
}

export async function exportDiagnosticsReport(diagnosticsPayload?: string) {
  return invoke<string>("export_diagnostics_report", { diagnosticsPayload });
}
