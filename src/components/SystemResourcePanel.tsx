import type { SystemResourceSnapshot } from "../features/systemResource";
import { createResourceCards } from "../features/systemResource";

interface SystemResourcePanelProps {
  snapshot: SystemResourceSnapshot | null;
}

export function SystemResourcePanel({ snapshot }: SystemResourcePanelProps) {
  const cards = createResourceCards(snapshot);

  return (
    <section className="panel resource-panel">
      <div className="panel-header">
        <div>
          <p className="panel-label">系统监控</p>
          <h3>当前设备资源</h3>
        </div>
        <span className="panel-badge">实时刷新</span>
      </div>

      <div className="resource-grid">
        {cards.map((card) => (
          <article className="resource-card" key={card.label}>
            <p>{card.label}</p>
            <strong>{card.value}</strong>
            <span>{card.hint}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
