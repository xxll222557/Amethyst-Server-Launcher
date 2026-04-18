import type { ServerEntry } from "../features/launcherData";

interface ServerCardProps {
  server: ServerEntry;
  selected: boolean;
  onSelect: (serverName: string) => void;
}

export function ServerCard({ server, selected, onSelect }: ServerCardProps) {
  return (
    <article
      className={`server-card ${selected ? "selected" : ""}`}
      onClick={() => onSelect(server.name)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(server.name);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="server-main">
        <div>
          <h4>{server.name}</h4>
          <p>{server.type}</p>
        </div>
        <span className={`status-pill ${server.statusTone}`}>{server.status}</span>
      </div>

      <div className="server-meta">
        <span>Players {server.players}</span>
        <span>{server.path}</span>
      </div>

      <div className="server-actions">
        {server.actions.map((action) => (
          <button key={action} className="chip-button" type="button" onClick={(event) => event.stopPropagation()}>
            {action}
          </button>
        ))}
      </div>
    </article>
  );
}
