import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  Connection,
  LinkResult,
  PreflightItem,
  SourceEntry,
  SourceScan,
  SourceSummary,
  TargetSummary,
} from "./types";

const isTauri = () => "__TAURI_INTERNALS__" in window;
const wait = (milliseconds = 180) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const folderNames = [
  "automation",
  "browser-control",
  "chrome-control",
  "clarify-copy",
  "command-center",
  "documents",
  "domain-modeling",
  "excel-live-control",
  "gh-address-comments",
  "gh-fix-ci",
  "github",
  "grill-with-docs",
  "grilling",
  "ideate",
  "image-to-code",
  "imagegen",
  "impeccable",
  "openai-docs",
  "pdf",
  "plugin-creator",
  "product-design-audit",
  "prompt-library",
  "release-notes",
  "sites-building",
  "sites-hosting",
  "skill-creator",
  "skill-installer",
  "spreadsheets",
  "template-creator",
  "url-to-code",
  "visualize",
  "workflows",
];

const fileNames = [".gitignore", "AGENTS.md", "LICENSE", "README.md", "package.json", "skills.config.json"];

let demoTargets: TargetSummary[] = [
  { id: "C:\\Users\\LX\\.codex\\skills", name: "Codex 全局 Skills", path: "C:\\Users\\LX\\.codex\\skills", available: true },
  { id: "C:\\Workspace\\agent-lab\\.agents\\skills", name: "项目 Agents Skills", path: "C:\\Workspace\\agent-lab\\.agents\\skills", available: true },
  { id: "D:\\Projects\\notes-app\\.agents\\skills", name: "Notes 项目", path: "D:\\Projects\\notes-app\\.agents\\skills", available: true },
  { id: "F:\\PortableAgents\\.agents\\skills", name: "移动盘 Skills", path: "F:\\PortableAgents\\.agents\\skills", available: false },
];

const demoSources: SourceSummary[] = [
  { id: "demo-shawn", name: "shawn-skills-use", path: "C:\\Users\\LX\\Desktop\\shawn-skills-use\\.agents\\skills", available: true },
  { id: "demo-personal", name: "personal-skills", path: "D:\\AgentSkills\\personal", available: true },
  { id: "demo-experiments", name: "skills-experiments", path: "D:\\AgentSkills\\experiments", available: true },
  { id: "demo-empty", name: "new-skills", path: "C:\\Users\\LX\\Desktop\\new-skills", available: true },
];

const connectionFor = (entry: string, target: TargetSummary): Connection => ({
  id: `${target.path}\\${entry}`,
  name: target.name,
  path: target.path,
  linkPath: `${target.path}\\${entry}`,
  available: target.available,
});

const makeEntries = (source: SourceSummary, count = folderNames.length): SourceEntry[] => [
  ...folderNames.slice(0, count).map((name, index) => ({
    id: `${source.id}:${name}`,
    name,
    path: `${source.path}\\${name}`,
    kind: "directory" as const,
    connections:
      index % 6 === 0
        ? []
        : demoTargets.slice(0, 1 + (index % Math.min(3, demoTargets.length))).map((target) => connectionFor(name, target)),
  })),
  ...fileNames.map((name) => ({
    id: `${source.id}:file:${name}`,
    name,
    path: `${source.path}\\${name}`,
    kind: "file" as const,
    connections: [],
  })),
].sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));

let mutableDemoSources = [...demoSources];
const demoEntries = new Map<string, SourceEntry[]>([
  ["demo-shawn", makeEntries(demoSources[0])],
  ["demo-personal", makeEntries(demoSources[1], 24)],
  ["demo-experiments", makeEntries(demoSources[2], 14)],
  ["demo-empty", []],
]);

const webApi = {
  async listSources() {
    return [...mutableDemoSources];
  },
  async addSource(path: string) {
    const name = path.split(/[\\/]/).filter(Boolean).at(-1) ?? "skills";
    const source = { id: `demo-${Date.now()}`, name, path, available: true };
    mutableDemoSources = [source, ...mutableDemoSources];
    demoEntries.set(source.id, makeEntries(source, 10));
    return source;
  },
  async removeSource(path: string) {
    mutableDemoSources = mutableDemoSources.filter((source) => source.path !== path);
  },
  async renameSource(path: string, name: string) {
    await wait(120);
    const source = mutableDemoSources.find((item) => item.path === path);
    if (!source) throw new Error("找不到源目录");
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("源目录名称不能为空");
    if (trimmedName.length > 80) throw new Error("源目录名称不能超过 80 个字符");
    const renamed = { ...source, name: trimmedName };
    mutableDemoSources = mutableDemoSources.map((item) => item.id === source.id ? renamed : item);
    return renamed;
  },
  async scanSource(path: string): Promise<SourceScan> {
    await wait(360);
    const source = mutableDemoSources.find((item) => item.path === path);
    if (!source) throw new Error("找不到源目录");
    return {
      source,
      entries: (demoEntries.get(source.id) ?? []).map((entry) => ({
        ...entry,
        connections: entry.connections.filter((connection) => connection.available),
      })),
    };
  },
  async listTargets() {
    return demoTargets.filter((target) => target.available);
  },
  async addTarget(path: string) {
    const existing = demoTargets.find((target) => target.path.toLocaleLowerCase() === path.toLocaleLowerCase());
    if (existing) return existing;
    const target = { id: path, name: path.split(/[\\/]/).filter(Boolean).at(-1) ?? "目标目录", path, available: true };
    demoTargets = [target, ...demoTargets];
    return target;
  },
  async forgetTarget(path: string) {
    demoTargets = demoTargets.filter((target) => target.path !== path);
  },
  async renameTarget(path: string, name: string) {
    await wait(120);
    const target = demoTargets.find((item) => item.path === path);
    if (!target) throw new Error("找不到目标目录");
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("目标目录名称不能为空");
    if (trimmedName.length > 80) throw new Error("目标目录名称不能超过 80 个字符");
    const renamed = { ...target, name: trimmedName };
    demoTargets = demoTargets.map((item) => item.id === target.id ? renamed : item);
    for (const entries of demoEntries.values()) {
      for (const entry of entries) {
        entry.connections = entry.connections.map((connection) =>
          connection.path === path ? { ...connection, name: trimmedName } : connection,
        );
      }
    }
    return renamed;
  },
  async preflightLinks(sourcePaths: string[], targetPath: string): Promise<PreflightItem[]> {
    await wait(120);
    const allEntries = [...demoEntries.values()].flat();
    return sourcePaths.map((sourcePath, index) => {
      const entry = allEntries.find((item) => item.path === sourcePath)!;
      const connected = entry.connections.some((connection) => connection.path === targetPath);
      return {
        sourcePath,
        name: entry.name,
        targetPath,
        linkPath: `${targetPath}\\${entry.name}`,
        status: connected ? "connected" : index % 9 === 7 ? "conflict" : "create",
        reason: index % 9 === 7 ? "目标目录中已有同名内容" : null,
      };
    });
  },
  async createLinks(sourcePaths: string[], targetPath: string): Promise<LinkResult[]> {
    await wait(520);
    const preflight = await webApi.preflightLinks(sourcePaths, targetPath);
    const target = demoTargets.find((item) => item.path === targetPath)!;
    return preflight.map((item) => {
      if (item.status !== "create") return item;
      const entry = [...demoEntries.values()].flat().find((candidate) => candidate.path === item.sourcePath)!;
      entry.connections.push(connectionFor(entry.name, target));
      return { ...item, status: "success" as const };
    });
  },
  async removeLink(linkPath: string) {
    for (const entries of demoEntries.values()) {
      for (const entry of entries) {
        entry.connections = entry.connections.filter((connection) => connection.linkPath !== linkPath);
      }
    }
  },
};

export const api = {
  listSources: (): Promise<SourceSummary[]> =>
    isTauri() ? invoke("list_sources") : webApi.listSources(),
  addSource: (path: string): Promise<SourceSummary> =>
    isTauri() ? invoke("add_source", { path }) : webApi.addSource(path),
  removeSource: (path: string): Promise<void> =>
    isTauri() ? invoke("remove_source", { path }) : webApi.removeSource(path),
  renameSource: (path: string, name: string): Promise<SourceSummary> =>
    isTauri() ? invoke("rename_source", { path, name }) : webApi.renameSource(path, name),
  scanSource: (path: string): Promise<SourceScan> =>
    isTauri() ? invoke("scan_source", { path }) : webApi.scanSource(path),
  listTargets: (): Promise<TargetSummary[]> =>
    isTauri() ? invoke("list_targets") : webApi.listTargets(),
  addTarget: (path: string): Promise<TargetSummary> =>
    isTauri() ? invoke("add_target", { path }) : webApi.addTarget(path),
  forgetTarget: (path: string): Promise<void> =>
    isTauri() ? invoke("forget_target", { path }) : webApi.forgetTarget(path),
  renameTarget: (path: string, name: string): Promise<TargetSummary> =>
    isTauri() ? invoke("rename_target", { path, name }) : webApi.renameTarget(path, name),
  preflightLinks: (sourcePaths: string[], targetPath: string): Promise<PreflightItem[]> =>
    isTauri()
      ? invoke("preflight_links", { sourcePaths, targetPath })
      : webApi.preflightLinks(sourcePaths, targetPath),
  createLinks: (sourcePaths: string[], targetPath: string): Promise<LinkResult[]> =>
    isTauri()
      ? invoke("create_links", { sourcePaths, targetPath })
      : webApi.createLinks(sourcePaths, targetPath),
  removeLink: (linkPath: string): Promise<void> =>
    isTauri() ? invoke("remove_link", { linkPath }) : webApi.removeLink(linkPath),
  openDirectory: (path: string): Promise<void> =>
    isTauri()
      ? invoke("open_directory", { path })
      : Promise.reject(new Error("打开目录仅在桌面版中可用")),
  async chooseDirectory(title: string): Promise<string | null> {
    if (!isTauri()) return null;
    const selection = await open({ directory: true, multiple: false, title });
    return typeof selection === "string" ? selection : null;
  },
  isDesktop: isTauri,
};
