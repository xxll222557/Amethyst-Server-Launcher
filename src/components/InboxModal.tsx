import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n";

export type InboxLevel = "error" | "warning" | "info";

export interface InboxEntry {
  id: number;
  level: InboxLevel;
  title: string;
  detail?: string;
  instanceId?: string;
  source: string;
  createdAt: number;
  read: boolean;
}

interface InboxModalProps {
  open: boolean;
  items: InboxEntry[];
  onlyUnread?: boolean;
  onToggleOnlyUnread?: () => void;
  onClose: () => void;
  onClear: () => void;
  onExport: (items: InboxEntry[]) => void;
}

function levelLabel(
  level: InboxLevel,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
) {
  if (level === "error") {
    return t("inbox.level.error");
  }
  if (level === "warning") {
    return t("inbox.level.warning");
  }
  return t("inbox.level.info");
}

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export function InboxModal({ open, items, onlyUnread = false, onToggleOnlyUnread, onClose, onClear, onExport }: InboxModalProps) {
  const { t } = useI18n();
  const [levelFilter, setLevelFilter] = useState<"all" | InboxLevel>("all");
  const [instanceSearch, setInstanceSearch] = useState("");

  const filteredItems = useMemo(() => {
    const keyword = instanceSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (onlyUnread && item.read) {
        return false;
      }
      if (levelFilter !== "all" && item.level !== levelFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const instanceId = (item.instanceId ?? "").toLowerCase();
      return instanceId.includes(keyword);
    });
  }, [items, levelFilter, instanceSearch, onlyUnread]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t("inbox.aria")}>
      <section className="wizard-modal inbox-modal">
        <div className="wizard-header">
          <div>
            <p className="panel-label">{t("inbox.label")}</p>
            <h3>{t("inbox.title")}</h3>
          </div>
        </div>

        <div className="inbox-toolbar">
          <p>{t("inbox.count", { count: filteredItems.length })}</p>
          <div className="inbox-toolbar-actions">
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 12 }}>
              <input
                type="checkbox"
                checked={onlyUnread}
                onChange={onToggleOnlyUnread}
                style={{ marginRight: 4 }}
              />
              {t("inbox.onlyUnread")}
            </label>
            <button
              className="ghost-action"
              type="button"
              onClick={() => onExport(filteredItems)}
              disabled={filteredItems.length === 0}
            >
              {t("inbox.export")}
            </button>
            <button className="ghost-action" type="button" onClick={onClear}>
              {t("inbox.clear")}
            </button>
          </div>
        </div>

        <div className="inbox-filters" aria-label={t("inbox.filtersAria")}>
          <label>
            <span>{t("inbox.filter.level")}</span>
            <select
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value as "all" | InboxLevel)}
            >
              <option value="all">{t("inbox.filter.all")}</option>
              <option value="error">{t("inbox.level.error")}</option>
              <option value="warning">{t("inbox.level.warning")}</option>
              <option value="info">{t("inbox.level.info")}</option>
            </select>
          </label>

          <label>
            <span>{t("inbox.search.instance")}</span>
            <input
              value={instanceSearch}
              onChange={(event) => setInstanceSearch(event.target.value)}
              placeholder={t("inbox.search.instancePlaceholder")}
            />
          </label>
        </div>

        <div className="inbox-list" role="list" aria-label={t("inbox.listAria")}>
          {filteredItems.length === 0 ? (
            <p className="inbox-empty">{t("inbox.empty")}</p>
          ) : (
            filteredItems.map((item) => (
              <article className={`inbox-item ${item.level}`} role="listitem" key={item.id}>
                <header>
                  <strong>{item.title}</strong>
                  <span>{levelLabel(item.level, t)}</span>
                </header>
                {item.detail ? <p>{item.detail}</p> : null}
                <footer>
                  <span>
                    {item.source}
                    {item.instanceId ? ` · ${item.instanceId}` : ""}
                  </span>
                  <time>{timeLabel(item.createdAt)}</time>
                </footer>
              </article>
            ))
          )}
        </div>

        <div className="wizard-actions">
          <button className="primary-action" type="button" onClick={onClose}>
            {t("inbox.close")}
          </button>
        </div>
      </section>
    </div>
  );
}
