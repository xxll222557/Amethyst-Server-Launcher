import { activity, overviewCards, servers } from "../features/launcherData";
import { ServerCard } from "../components/ServerCard";
import { SystemResourcePanel } from "../components/SystemResourcePanel";
import type { SystemResourceSnapshot } from "../features/systemResource";

interface HomePageProps {
  selectedServerName: string;
  onSelectServer: (serverName: string) => void;
  systemResources: SystemResourceSnapshot | null;
}

export function HomePage({ selectedServerName, onSelectServer, systemResources }: HomePageProps) {
  const selectedServer = servers.find((server) => server.name === selectedServerName) ?? servers[0];

  return (
    <>
      <SystemResourcePanel snapshot={systemResources} />

      <section className="hero">
        <div>
          <p className="eyebrow">Local-first / Multi-instance / Launcher UI</p>
          <h2>随时查看系统占用和当前实例状态</h2>
          <p className="hero-copy">
            顶栏切换页面，主界面保留核心信息视图，后续直接接入 Rust 的实例管理、下载与启动能力。
          </p>
        </div>

        <div className="hero-actions">
          <button className="primary-action" type="button">
            新建实例
          </button>
          <button className="secondary-action" type="button">
            打开日志
          </button>
        </div>
      </section>

      <section className="stats-grid" aria-label="概览数据">
        {overviewCards.map((card) => (
          <article className="stat-card" key={card.label}>
            <p>{card.label}</p>
            <strong>{card.value}</strong>
            <span>{card.hint}</span>
          </article>
        ))}
      </section>

      <section className="workspace-grid">
        <article className="panel panel-large">
          <div className="panel-header">
            <div>
              <p className="panel-label">服务器实例</p>
              <h3>快速管理当前环境</h3>
            </div>
            <button className="ghost-action" type="button">
              查看全部
            </button>
          </div>

          <div className="server-list">
            {servers.map((server) => (
              <ServerCard key={server.name} server={server} selected={selectedServer.name === server.name} onSelect={onSelectServer} />
            ))}
          </div>
        </article>

        <article className="panel panel-compact">
          <div className="panel-header">
            <div>
              <p className="panel-label">最近活动</p>
              <h3>任务与状态流</h3>
            </div>
          </div>

          <div className="activity-list">
            {activity.map((item) => (
              <div className="activity-item" key={item.title}>
                <span className="activity-time">{item.time}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <section className="panel-footer-card">
            <p className="panel-label">下一步</p>
            <h4>把 Rust 接口接进来</h4>
            <p>先完成实例数据、下载、启动和日志读取四条主链路。</p>
          </section>
        </article>
      </section>
    </>
  );
}
