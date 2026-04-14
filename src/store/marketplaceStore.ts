export interface MarketplaceSection {
  title: string;
  description: string;
  items: string[];
}

export const marketplaceSections: MarketplaceSection[] = [
  {
    title: "插件市场",
    description: "后续接入插件列表、搜索与安装流程。",
    items: ["服务端插件", "管理工具", "主题资源"],
  },
  {
    title: "服务端市场",
    description: "后续接入 Paper / Fabric / Forge 等服务端下载入口。",
    items: ["官方版本", "整合包", "模板实例"],
  },
];
