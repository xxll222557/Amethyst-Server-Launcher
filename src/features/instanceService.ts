import { invoke } from "@tauri-apps/api/core";

export interface InstanceConfig {
  id: string;
  name: string;
  serverType: string;
  version: string;
  directory: string;
  minMemoryMb: number;
  maxMemoryMb: number;
}

export interface CreateInstanceRequest {
  name: string;
  serverType: string;
  version: string;
  minMemoryMb: number;
  maxMemoryMb: number;
}

export interface LaunchResult {
  instanceId: string;
  pid: number;
  command: string;
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
