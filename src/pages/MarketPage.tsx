import { useMemo, useState } from "react";
import { useI18n } from "../i18n";

type MarketCategory = "server" | "plugin" | "modpack" | "java";

interface MarketPageProps {
  onOpenDownloads: () => void;
  onQueueDownload: (payload: {
    marketItemId: string;
    itemName: string;
    version: string;
    category: MarketCategory;
    source: string;
    fileName: string;
  }) => void;
}

interface MarketItem {
  id: string;
  category: MarketCategory;
  name: string;
  version: string;
  source: string;
  fileName: string;
  tags: string[];
  note: string;
}

function MarketCategoryIcon({ category }: { category: MarketCategory }) {
  if (category === "server") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.4" y="5" width="15.2" height="4.8" rx="1.4" />
        <rect x="4.4" y="14.2" width="15.2" height="4.8" rx="1.4" />
        <path d="M8.1 7.4h.01" />
        <path d="M8.1 16.6h.01" />
        <path d="M11.1 7.4h5.1" />
        <path d="M11.1 16.6h5.1" />
      </svg>
    );
  }

  if (category === "plugin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13.8 4.4a2.5 2.5 0 1 1 4.9 0v3.1" />
        <path d="M5.2 10.1h13.6a1.8 1.8 0 0 1 1.8 1.8v2.8a4.9 4.9 0 0 1-4.9 4.9H8.3a4.9 4.9 0 0 1-4.9-4.9v-2.8a1.8 1.8 0 0 1 1.8-1.8Z" />
        <path d="M9.2 13v3.8" />
        <path d="M14.8 13v3.8" />
      </svg>
    );
  }

  if (category === "modpack") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.8 4.9 7.4 12 11l7.1-3.6L12 3.8Z" />
        <path d="M4.9 12.1 12 15.7l7.1-3.6" />
        <path d="M4.9 16.7 12 20.2l7.1-3.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 6.2h2" />
      <path d="M12 3.9v2.3" />
      <path d="M7.2 8.1 8.8 9.7" />
      <path d="M16.8 8.1 15.2 9.7" />
      <path d="M6 12h2.2" />
      <path d="M15.8 12H18" />
      <rect x="7.2" y="10.1" width="9.6" height="9.7" rx="2.2" />
      <path d="M10.2 13.7h3.6" />
      <path d="M10.2 16.3h3.6" />
    </svg>
  );
}

export function MarketPage({ onOpenDownloads, onQueueDownload }: MarketPageProps) {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState<MarketCategory>("server");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string>("all");

  const categories: Array<{
    key: MarketCategory;
    titleKey:
      | "market.section.server.title"
      | "market.section.plugin.title"
      | "market.section.modpack.title"
      | "market.section.java.title";
    shortTitleKey:
      | "market.section.server.short"
      | "market.section.plugin.short"
      | "market.section.modpack.short"
      | "market.section.java.short";
    descKey:
      | "market.section.server.desc"
      | "market.section.plugin.desc"
      | "market.section.modpack.desc"
      | "market.section.java.desc";
  }> = [
    {
      key: "server",
      titleKey: "market.section.server.title",
      shortTitleKey: "market.section.server.short",
      descKey: "market.section.server.desc",
    },
    {
      key: "plugin",
      titleKey: "market.section.plugin.title",
      shortTitleKey: "market.section.plugin.short",
      descKey: "market.section.plugin.desc",
    },
    {
      key: "modpack",
      titleKey: "market.section.modpack.title",
      shortTitleKey: "market.section.modpack.short",
      descKey: "market.section.modpack.desc",
    },
    {
      key: "java",
      titleKey: "market.section.java.title",
      shortTitleKey: "market.section.java.short",
      descKey: "market.section.java.desc",
    },
  ];

  const items: MarketItem[] = [
    {
      id: "paper-1214",
      category: "server",
      name: "Paper",
      version: "1.21.4",
      source: "Purpur API",
      fileName: "purpur-1.21.4.jar",
      tags: ["stable", "recommended"],
      note: "高兼容插件生态，适合多数生存服场景。",
    },
    {
      id: "fabric-1214",
      category: "server",
      name: "Fabric",
      version: "1.21.4",
      source: "FabricMC",
      fileName: "fabric-server-1.21.4.jar",
      tags: ["mod", "lightweight"],
      note: "轻量核心，适配新版本模组更新节奏。",
    },
    {
      id: "forge-1201",
      category: "server",
      name: "Forge",
      version: "1.20.1",
      source: "MinecraftForge",
      fileName: "forge-1.20.1-47.3.12-installer.jar",
      tags: ["mod", "legacy"],
      note: "成熟的模组平台，适合老牌整合包环境。",
    },
    {
      id: "luckperms",
      category: "plugin",
      name: "LuckPerms",
      version: "5.4",
      source: "Hangar",
      fileName: "LuckPerms-Bukkit-5.4.130.jar",
      tags: ["admin", "recommended"],
      note: "权限管理基础组件，支持多后端同步。",
    },
    {
      id: "essentialsx",
      category: "plugin",
      name: "EssentialsX",
      version: "2.21",
      source: "Modrinth",
      fileName: "EssentialsX-2.21.0.jar",
      tags: ["utility", "stable"],
      note: "常用管理与基础指令集合，开箱可用。",
    },
    {
      id: "geyser",
      category: "plugin",
      name: "Geyser",
      version: "2.4",
      source: "Modrinth",
      fileName: "Geyser-Spigot.jar",
      tags: ["bridge", "network"],
      note: "跨平台连接桥接，便于移动端接入。",
    },
    {
      id: "atm9",
      category: "modpack",
      name: "All the Mods 9",
      version: "0.3.x",
      source: "CurseForge",
      fileName: "ATM9-Server-Files-0.3.2.zip",
      tags: ["kitchen-sink", "popular"],
      note: "高热度大型整合包，内容覆盖全面。",
    },
    {
      id: "prominence2",
      category: "modpack",
      name: "Prominence II",
      version: "3.x",
      source: "Modrinth",
      fileName: "Prominence2-ServerPack-0.7.15.zip",
      tags: ["adventure", "rpg"],
      note: "偏冒险 RPG 方向，任务和进度体系丰富。",
    },
    {
      id: "fabulously-optimized",
      category: "modpack",
      name: "Fabulously Optimized",
      version: "6.x",
      source: "Modrinth",
      fileName: "Fabulously.Optimized-6.4.0.mrpack",
      tags: ["performance", "client"],
      note: "优化向整合包，适合作为轻量基底。",
    },
    {
      id: "temurin-21",
      category: "java",
      name: "Eclipse Temurin",
      version: "21 LTS",
      source: "Adoptium",
      fileName: "temurin-21-jdk-macos-x64.tar.gz",
      tags: ["lts", "recommended"],
      note: "新版本服务端推荐运行时，稳定性与生态较好。",
    },
    {
      id: "zulu-17",
      category: "java",
      name: "Zulu",
      version: "17 LTS",
      source: "Azul",
      fileName: "zulu-17-jdk-macos-x64.tar.gz",
      tags: ["lts", "legacy"],
      note: "适配 1.18-1.20 时代常见环境需求。",
    },
    {
      id: "graalvm-21",
      category: "java",
      name: "GraalVM",
      version: "21",
      source: "Oracle",
      fileName: "oracle-jdk-21-macos-x64.tar.gz",
      tags: ["advanced", "runtime"],
      note: "面向进阶用户的高性能运行时选项。",
    },
  ];

  const activeMeta = categories.find((item) => item.key === activeCategory) ?? categories[0];

  const categoryItems = useMemo(
    () => items.filter((item) => item.category === activeCategory),
    [activeCategory],
  );

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    categoryItems.forEach((item) => {
      item.tags.forEach((tag) => set.add(tag));
    });
    return ["all", ...Array.from(set)];
  }, [categoryItems]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = useMemo(
    () =>
      categoryItems.filter((item) => {
        const hitTag = activeTag === "all" || item.tags.includes(activeTag);
        const hitQuery =
          normalizedQuery.length === 0 ||
          `${item.name} ${item.version} ${item.source} ${item.note} ${item.tags.join(" ")}`.toLowerCase().includes(normalizedQuery);
        return hitTag && hitQuery;
      }),
    [activeTag, categoryItems, normalizedQuery],
  );

  return (
    <section className="market-shell" aria-label={t("market.label")}>
      <section className="market-workspace">
        <aside className="market-side-nav" aria-label={t("market.browser.tabsAria")}>
          {categories.map((item) => (
            <button
              key={item.key}
              className={`market-side-item ${activeCategory === item.key ? "active" : ""}`}
              type="button"
              onClick={() => {
                setActiveCategory(item.key);
                setActiveTag("all");
              }}
            >
              <span className="market-card-icon" aria-hidden="true">
                <MarketCategoryIcon category={item.key} />
              </span>
              <span className="market-side-copy">
                <strong>{t(item.titleKey)}</strong>
                <span>{t(item.descKey)}</span>
              </span>
            </button>
          ))}
        </aside>

        <section className="panel market-browser">
          <div className="market-browser-head">
            <div>
              <span className="panel-label">{t("market.browser.label")}</span>
              <h3>{t(activeMeta.titleKey)}</h3>
            </div>
            <button className="primary-action" type="button" onClick={onOpenDownloads}>
              {t("market.action.openDownloads")}
            </button>
          </div>

          <div className="market-filter-bar">
            <label className="market-search-field" htmlFor="market-search-input">
              <span>{t("market.search.label")}</span>
              <input
                id="market-search-input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("market.search.placeholder")}
              />
            </label>

            <div className="market-tag-row" role="group" aria-label={t("market.filter.aria")}>
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  className={`market-tag ${activeTag === tag ? "active" : ""}`}
                  type="button"
                  onClick={() => setActiveTag(tag)}
                >
                  {tag === "all" ? t("market.filter.all") : tag}
                </button>
              ))}
            </div>
          </div>

          <div className="market-item-list">
            {filteredItems.map((item) => (
              <article className="market-item" key={item.id}>
                <div className="market-item-main">
                  <h4>{item.name}</h4>
                  <p>{item.note}</p>
                </div>
                <div className="market-item-meta">
                  <span className="status-pill muted">{item.version}</span>
                  <span className="status-pill muted">{item.source}</span>
                </div>
                <button className="chip-button" type="button" onClick={onOpenDownloads}>
                  {t("market.action.download")}
                </button>
                <button
                  className="chip-button"
                  type="button"
                  onClick={() =>
                    onQueueDownload({
                      marketItemId: item.id,
                      itemName: item.name,
                      version: item.version,
                      category: item.category,
                      source: item.source,
                      fileName: item.fileName,
                    })
                  }
                >
                  {t("market.action.queue")}
                </button>
              </article>
            ))}

            {filteredItems.length === 0 && (
              <article className="market-item market-empty">
                <p>{t("market.empty")}</p>
              </article>
            )}
          </div>
        </section>
      </section>
    </section>
  );
}
