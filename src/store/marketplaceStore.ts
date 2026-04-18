export interface MarketplaceSection {
  title: string;
  description: string;
  items: string[];
}

export const marketplaceSections: MarketplaceSection[] = [
  {
    title: "Plugin Marketplace",
    description: "Plugin list, search, and installation workflows will be added in a future update.",
    items: ["Server Plugins", "Management Tools", "Theme Assets"],
  },
  {
    title: "Server Marketplace",
    description: "Download entries for Paper, Fabric, Forge, and other server types will be added later.",
    items: ["Official Builds", "Modpacks", "Template Instances"],
  },
];
