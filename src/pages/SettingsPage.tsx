import { marketplaceSections } from "../store/marketplaceStore";

export function SettingsPage() {
  return (
    <section className="panel page-panel settings-grid">
      <div className="panel-header">
        <div>
          <p className="panel-label">设置</p>
          <h3>启动器配置</h3>
        </div>
      </div>

      <article className="setting-card">
        <h4>更新与版本</h4>
        <p>仅开启启动器自身更新，服务端与模组更新后续再接入。</p>
      </article>

      <article className="setting-card">
        <h4>本地存储</h4>
        <p>实例信息、任务记录与基础设置保存在本地，后续可迁移到云端。</p>
      </article>

      <article className="setting-card">
        <h4>启动参数</h4>
        <p>Java 路径、内存限制、窗口参数与环境变量都将在这里管理。</p>
      </article>

      {marketplaceSections.map((section) => (
        <article className="setting-card" key={section.title}>
          <h4>{section.title}</h4>
          <p>{section.description}</p>
        </article>
      ))}
    </section>
  );
}
