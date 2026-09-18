/**
 * Re-apply Grok30m identity + session-tab contributes onto a community
 * package.json. Run after every upstream merge so a clean merge cannot
 * silently become PawelHuryn.grok-vscode-phuryn again (2.0.1).
 */

export const GROK30M_DESCRIPTION =
  "Grok30m — fork of the community Grok Build VS Code client with Claude-style editor tabs, dedicated Sessions sidebar, and auto-hide for automated sessions. Requires the Grok Build CLI plus SuperGrok, X Premium+, or an xAI API key. Based on Pawel Huryn's grok-build-vscode. Not affiliated with or endorsed by xAI.";

const GROK30M_SETTINGS: Record<string, unknown> = {
  "grok.autoUpdate": {
    type: "boolean",
    default: true,
    markdownDescription:
      "Keep Grok30m current from the public GitHub Releases feed ([thirtym/grok30m](https://github.com/thirtym/grok30m/releases/latest)). Checks on this computer *and* on SSH remotes (each host has its own install). Turn off to only update when you run **Grok30m: Check for Updates**.",
  },
  "grok.preferredLocation": {
    type: "string",
    enum: ["panel", "sidebar"],
    enumDescriptions: [
      "Editor tab — chat stays open while you edit files (Claude Code style)",
      "Sidebar — original Grok layout with chat in the side panel",
    ],
    default: "panel",
    description: "Where Grok chat opens by default.",
  },
  "grok.sessionsSidebar": {
    type: "boolean",
    default: true,
    description:
      "Show session history in a dedicated Sessions sidebar view instead of the in-chat history dropdown.",
  },
  "grok.hideAutoSessions": {
    type: "boolean",
    default: true,
    description:
      "Hide automated sessions tagged [Auto:review], [Auto:deploy], or [Auto:robot] from session history. Toggle live in the Sessions sidebar.",
  },
};

const EXTRA_ACTIVATION = [
  "onStartupFinished",
  "onView:grok.sessions",
  "onWebviewPanel:grok.panel",
  "onCommand:grok.panel.open",
  "onCommand:grok.sidebar.open",
  "onCommand:grok.checkForUpdates",
];

const EXTRA_COMMANDS = [
  { command: "grok.panel.open", title: "Grok30m: Open in Editor Tab" },
  { command: "grok.sidebar.open", title: "Grok30m: Open in Sidebar" },
  { command: "grok.checkForUpdates", title: "Grok30m: Check for Updates" },
];

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function grok30mCommandTitle(title: string): string {
  if (title.startsWith("AFK Pilot:")) return title;
  if (title.includes("Grok30m")) return title;
  return title.replace(/\bGrok\b/g, "Grok30m");
}

export function applyGrok30mManifest(pkg: JsonObject, opts: { version: string }): JsonObject {
  const next: JsonObject = { ...pkg };
  next.name = "grok30m";
  next.displayName = "Grok30m";
  next.publisher = "grok30m";
  next.version = opts.version;
  next.description = GROK30M_DESCRIPTION;
  next.author = { name: "Grok30m contributors", url: "https://github.com/thirtym/grok30m" };
  next.homepage = "https://github.com/thirtym/grok30m";
  next.bugs = { url: "https://github.com/thirtym/grok30m/issues" };
  next.repository = { type: "git", url: "https://github.com/thirtym/grok30m.git" };
  next.extensionKind = ["workspace"];

  const activation = asArray<string>(pkg.activationEvents);
  next.activationEvents = [...new Set([...activation, ...EXTRA_ACTIVATION])];

  const contributes = { ...asObject(pkg.contributes) };
  const containers = { ...asObject(contributes.viewsContainers) };
  for (const key of Object.keys(containers)) {
    const group = asArray<JsonObject>(containers[key]).map((c) => ({ ...c, title: "Grok30m" }));
    containers[key] = group;
  }
  contributes.viewsContainers = containers;

  const views = { ...asObject(contributes.views) };
  const sidebarViews = asArray<JsonObject>(views.grokSidebar).map((v) => {
    if (v.id !== "grok.chat") return { ...v };
    return {
      ...v,
      name: "Chat",
      when: "config.grok.preferredLocation == 'sidebar' || !config.grok.sessionsSidebar",
    };
  });
  views.grokSidebar = sidebarViews;
  views.grokProjects = asArray<JsonObject>(views.grokProjects).map((v) => {
    if (v.id !== "grok.projects") return { ...v };
    return { ...v, when: "!config.grok.sessionsSidebar" };
  });
  const primaryViews = asArray<JsonObject>(views.grokPrimary).filter((v) => v.id !== "grok.sessions");
  primaryViews.push({
    type: "webview",
    id: "grok.sessions",
    name: "Sessions",
    when: "config.grok.sessionsSidebar",
  });
  views.grokPrimary = primaryViews;
  contributes.views = views;

  const commands: JsonObject[] = asArray<JsonObject>(contributes.commands).map((c) => ({
    ...c,
    title: typeof c.title === "string" ? grok30mCommandTitle(c.title) : c.title,
  }));
  for (const extra of EXTRA_COMMANDS) {
    if (!commands.some((c) => c.command === extra.command)) commands.push({ ...extra });
  }
  contributes.commands = commands;

  const configuration = { ...asObject(contributes.configuration) };
  configuration.title = "Grok30m";
  const properties = { ...asObject(configuration.properties), ...GROK30M_SETTINGS };
  configuration.properties = properties;
  contributes.configuration = configuration;

  next.contributes = contributes;
  return next;
}
