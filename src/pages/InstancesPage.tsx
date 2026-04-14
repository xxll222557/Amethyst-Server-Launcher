import { useEffect, useState } from "react";
import {
  createInstanceConfig,
  getInstances,
  startInstanceServer,
  type InstanceConfig,
} from "../features/instanceService";

export function InstancesPage() {
  const [instances, setInstances] = useState<InstanceConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const refreshInstances = async () => {
    setLoading(true);
    try {
      const next = await getInstances();
      setInstances(next);
    } catch (error) {
      setMessage(`读取实例失败: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshInstances();
  }, []);

  const createInstance = async () => {
    const inputName = window.prompt("请输入新实例名称", `Server-${instances.length + 1}`);
    if (!inputName) {
      return;
    }

    try {
      const created = await createInstanceConfig({
        name: inputName,
        serverType: "Paper",
        version: "1.20.4",
        minMemoryMb: 1024,
        maxMemoryMb: 4096,
      });

      setMessage(`实例创建成功: ${created.name}`);
      await refreshInstances();
    } catch (error) {
      setMessage(`创建实例失败: ${String(error)}`);
    }
  };

  const startInstance = async (instance: InstanceConfig) => {
    try {
      const result = await startInstanceServer(instance.id);
      setMessage(`实例 ${instance.name} 已启动，PID=${result.pid}`);
    } catch (error) {
      setMessage(`启动失败 (${instance.name}): ${String(error)}`);
    }
  };

  return (
    <section className="panel page-panel">
      <div className="panel-header">
        <div>
          <p className="panel-label">实例列表</p>
          <h3>所有服务器实例</h3>
        </div>
        <button className="ghost-action" type="button" onClick={createInstance}>
          新建实例
        </button>
      </div>

      <p className="instance-message">{loading ? "正在加载实例..." : message || "可在此创建并启动实例。"}</p>

      <div className="server-list">
        {instances.map((instance) => (
          <article className="server-card" key={instance.id}>
            <div className="server-main">
              <div>
                <h4>{instance.name}</h4>
                <p>
                  {instance.serverType} {instance.version}
                </p>
              </div>
              <span className="status-pill muted">已创建</span>
            </div>

            <div className="server-meta">
              <span>
                内存 {instance.minMemoryMb}M / {instance.maxMemoryMb}M
              </span>
              <span>{instance.directory}</span>
            </div>

            <div className="server-actions">
              <button className="chip-button" type="button" onClick={() => startInstance(instance)}>
                启动实例
              </button>
            </div>
          </article>
        ))}

        {instances.length === 0 && !loading && (
          <article className="server-card">
            <h4>暂无实例</h4>
            <p>点击“新建实例”创建第一个实例。</p>
          </article>
        )}
      </div>
    </section>
  );
}
