/**
 * Put Grok30m session tabs back onto a community tree.
 *
 * Community rewrites the same files every release. A textual merge then stops
 * the daily sync. The sync takes community's copy of each file listed here and
 * runs these rewrites, which key off anchors rather than line numbers. A missing
 * anchor throws — the job publishes nothing — instead of silently dropping tabs.
 *
 * Keep each rewrite idempotent: applying it to a tree that already has the
 * fork behavior must return the same text.
 */
export const GROK30M_OVERLAY_PATHS = [
  "README.md",
  "media/chat.js",
  "media/settings.js",
  "media/webview-helpers.js",
  "src/desktop/webview-msg-validate.ts",
  "src/protocol.ts",
  "src/remote-policy.ts",
  "src/session.ts",
  "src/sidebar.ts",
  "test/settings-surface.dom.test.ts",
  "test/webview-harness.ts",
  "test/webview-ui.dom.test.ts",
] as const;

export const SIDEBAR_TAB_METHODS = "  attachSessionsView(view: HostWebviewView): void {\n    this.sessionsView = view;\n    view.webview.options = {\n      enableScripts: true,\n      localResourceRoots: [\n        Uri.joinPath(this.context.extensionUri, \"media\"),\n        Uri.joinPath(this.context.extensionUri, \"resources\"),\n      ],\n    };\n    view.webview.html = this.getSessionsHtml(view.webview);\n    view.webview.onDidReceiveMessage((raw) => {\n      void this.onSessionsMessage(raw as WebviewMsg);\n    });\n    this.postSessionsList();\n  }\n\n  private grokConfig(): { get<T>(key: string, defaultValue: T): T } | undefined {\n    const get = this.host?.getConfiguration;\n    if (typeof get !== \"function\") return undefined;\n    const cfg = get.call(this.host, \"grok\") as { get?: unknown } | undefined;\n    if (!cfg || typeof cfg.get !== \"function\") return undefined;\n    return cfg as { get<T>(key: string, defaultValue: T): T };\n  }\n\n  private usesPanelTabs(): boolean {\n    return this.grokConfig()?.get<\"panel\" | \"sidebar\">(\"preferredLocation\", \"panel\") === \"panel\";\n  }\n\n  useSessionsSidebar(): boolean {\n    return this.grokConfig()?.get<boolean>(\"sessionsSidebar\", true) ?? true;\n  }\n\n  hideAutoSessions(): boolean {\n    return this.grokConfig()?.get<boolean>(\"hideAutoSessions\", true) ?? false;\n  }\n\n  private webviewFor(session: Session): HostWebview | undefined {\n    if (this.usesPanelTabs()) {\n      return session.panel?.webview\n        ?? (session === this.focused ? this.view?.webview : undefined);\n    }\n    return session === this.focused ? this.view?.webview : undefined;\n  }\n\n  async openPreferred(): Promise<void> {\n    if (this.usesPanelTabs()) this.ensurePanelForSession(this.focused);\n    else await this.host.revealChatView();\n    if (this.useSessionsSidebar()) {\n      try {\n        await this.host.revealChatView();\n      } catch { /* Sessions lives in its own activity-bar view */ }\n    }\n  }\n\n  openPanel(): void {\n    this.ensurePanelForSession(this.focused);\n  }\n\n  async openSidebar(): Promise<void> {\n    await this.host.revealChatView();\n  }\n\n  private postToSessions(message: HostMsg): void {\n    if (message.type !== \"sessions\" && message.type !== \"sessionDot\") return;\n    void this.sessionsView?.webview.postMessage(message);\n  }\n\n  private async onSessionsMessage(msg: WebviewMsg): Promise<void> {\n    switch (msg.type) {\n      case \"sessionsReady\":\n        this.postSessionsList();\n        break;\n      case \"listSessions\":\n        this.postSessionsList({\n          offset: msg.offset,\n          limit: msg.limit,\n          query: msg.query,\n          providerCursor: msg.providerCursor,\n        });\n        break;\n      case \"setHideAutoSessions\":\n        void this.host.getConfiguration(\"grok\").update(\"hideAutoSessions\", !!msg.value);\n        this.postSessionsList();\n        break;\n      case \"resumeSession\":\n        await this.openSession(msg.id);\n        this.revealChat();\n        break;\n      case \"renameSession\":\n        this.renameSession(msg.id, msg.name, \"local\");\n        break;\n      case \"deleteSession\":\n        await this.deleteSession(msg.id, msg.name, \"local\");\n        break;\n      case \"clearAllSessions\":\n        await this.clearAllSessions(this.historyCwdFor(\"local\"), \"local\");\n        break;\n      case \"newSession\":\n        await this.newFocusedSession(\"local\");\n        this.revealChat();\n        break;\n    }\n  }\n\n  private revealChat(): void {\n    if (this.usesPanelTabs()) this.ensurePanelForSession(this.focused);\n    else void this.host.revealChatView?.();\n  }\n\n  private panelTitleFor(session: Session): string {\n    const name = this.sessionDisplayName(session).trim();\n    return name || \"Grok30m\";\n  }\n\n  private updatePanelTitle(session: Session): void {\n    session.panel?.setTitle?.(this.panelTitleFor(session));\n  }\n\n  private ensurePanelForSession(session: Session, title?: string): void {\n    if (!this.usesPanelTabs() || typeof this.host.openEditorWebview !== \"function\") return;\n    if (!this.context?.extensionUri) return;\n    if (session.panel) {\n      session.panel.reveal();\n      this.updatePanelTitle(session);\n      return;\n    }\n    const panel = this.host.openEditorWebview({\n      viewType: GrokSidebar.panelType,\n      title: title ?? this.panelTitleFor(session),\n      localResourceRoots: this.chatLocalResourceRoots(),\n    });\n    if (!panel) return;\n    this.bindChatPanel(panel, session);\n  }\n\n  private claimPanelSession(session: Session): void {\n    if (this.focused === session) return;\n    // The tab the user is in, not a replay. focusSession() clears the webview\n    // and would wipe the composer they are about to paste into.\n    this.focused = session;\n    this.touch(session);\n    this.markRead(session);\n    this.updatePanelTitle(session);\n  }\n\n  private bindChatPanel(panel: HostEditorWebview, session: Session): void {\n    session.panel = panel;\n    // Subscribe before assigning html: a restored or cached editor webview can\n    // run scripts in the same turn, and a lost `ready` leaves Starting forever.\n    panel.onDidChangeViewState?.((active) => {\n      if (active) this.claimPanelSession(session);\n    });\n    panel.webview.onDidReceiveMessage((raw) => {\n      const m = raw as WebviewMsg;\n      // Blur of the tab being left must not steal focus back. Every other\n      // message is from the tab the user is acting in — including paste and send.\n      if (!(m.type === \"composerFocus\" && m.focused === false)) {\n        this.claimPanelSession(session);\n      }\n      if (m.type === \"ready\" && session.client) {\n        this.rehydrateWebviewFromFocused();\n        return;\n      }\n      void this.onMessage(m, \"local\").catch((e) => {\n        const text = (e as Error)?.message ?? String(e);\n        this.host.appendLine(`[webview] ${m.type} failed: ${text}`);\n        void this.host.showErrorMessage(`Grok: ${m.type} failed — ${text}`);\n      });\n    });\n    panel.webview.html = this.getHtml(panel.webview);\n    panel.onDidDispose(() => {\n      if (session.panel === panel) session.panel = undefined;\n    });\n  }\n\n  private getSessionsHtml(webview: HostWebview): string {\n    const nonce = getNonce();\n    const mediaUri = (file: string) =>\n      webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, \"media\", file));\n    return `<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\" />\n<meta http-equiv=\"Content-Security-Policy\"\n      content=\"default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';\" />\n<style>html, body { background: var(--vscode-sideBar-background); }</style>\n<link rel=\"stylesheet\" href=\"${mediaUri(\"sessions.css\")}\" />\n</head>\n<body>\n  <div class=\"sessions-root\">\n    <div class=\"sessions-header\">\n      <span class=\"sessions-title\">Sessions</span>\n      <button id=\"sessions-new-btn\" class=\"sessions-new-btn\" title=\"New session\"></button>\n    </div>\n    <div class=\"sessions-search-wrap\">\n      <input id=\"sessions-search\" class=\"sessions-search\" type=\"text\" placeholder=\"Search sessions…\" />\n    </div>\n    <label class=\"sessions-filter-auto\" title=\"Hide automated sessions\">\n      <input id=\"sessions-hide-auto\" type=\"checkbox\" checked />\n      <span>Hide automated</span>\n    </label>\n    <div id=\"sessions-list\" class=\"sessions-list\"></div>\n    <div id=\"sessions-footer\" class=\"sessions-footer\" hidden>\n      <button id=\"sessions-clear-btn\" class=\"sessions-clear-all\" title=\"Delete all sessions in this workspace's history\"></button>\n    </div>\n  </div>\n  <script nonce=\"${nonce}\" src=\"${mediaUri(\"webview-helpers.js\")}\"></script>\n  <script nonce=\"${nonce}\" src=\"${mediaUri(\"sessions.js\")}\"></script>\n</body>\n</html>`;\n  }\n\n";

function swap(src: string, from: string, to: string, label: string): string {
  if (src.includes(to)) return src;
  const count = src.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`Grok30m overlay anchor ${count === 0 ? "missing" : "not unique"} (${label})`);
  }
  return src.replace(from, to);
}

function whenMissing(src: string, marker: string, from: string, to: string, label: string): string {
  if (src.includes(marker)) return src;
  return swap(src, from, to, label);
}

function rename(src: string, from: string, to: string): string {
  if (!src.includes(from)) return src;
  return src.split(from).join(to);
}

export function applyGrok30mFile(relPath: string, source: string): string {
  switch (relPath) {
    case "README.md":
      return applyReadme(source);
    case "media/chat.js":
      return applyChat(source);
    case "media/settings.js":
      return applySettings(source);
    case "media/webview-helpers.js":
      return applyWebviewHelpers(source);
    case "src/desktop/webview-msg-validate.ts":
      return applyValidate(source);
    case "src/protocol.ts":
      return applyProtocol(source);
    case "src/remote-policy.ts":
      return applyRemotePolicy(source);
    case "src/session.ts":
      return applySession(source);
    case "src/sidebar.ts":
      return applySidebar(source);
    case "test/settings-surface.dom.test.ts":
      return applySettingsTest(source);
    case "test/webview-harness.ts":
      return applyHarness(source);
    case "test/webview-ui.dom.test.ts":
      return applyWebviewUiTest(source);
    default:
      return source;
  }
}

const README_HEAD = `# Grok30m

Fork of [Grok Build for VS Code (Community)](https://github.com/phuryn/grok-build-vscode) with one editor tab per session and a Sessions sidebar. A daily GitHub Action merges the next community release, puts those back, and publishes a vsix.

`;

function applyReadme(src: string): string {
  if (src.startsWith("# Grok30m\n")) return src;
  const keepAt = src.indexOf("Two ways to use");
  if (keepAt < 0) throw new Error("Grok30m overlay anchor missing (README body)");
  return README_HEAD + src.slice(keepAt);
}

function applyChat(src: string): string {
  src = swap(
    src,
    "  historyBtn.innerHTML = ICON.clock;",
    "  if (historyBtn) historyBtn.innerHTML = ICON.clock;",
    "historyBtn.innerHTML",
  );
  src = swap(
    src,
    "  historyBtn.onclick = (e) => { e.stopPropagation(); openHistoryPopover(); };",
    "  if (historyBtn) historyBtn.onclick = (e) => { e.stopPropagation(); openHistoryPopover(); };",
    "historyBtn.onclick",
  );
  return src;
}

const SETTINGS_ROWS = `    {
      id: "aboutCommunityBase",
      category: "about",
      title: "Based on community",
      kind: "status",
      visible: (s, env) => !remoteAbout(s, env) && !!(s && s.communityBase),
      describe: (s) => {
        const base = s && s.communityBase;
        const latest = s && s.communityLatest;
        if (s && s.communityError) {
          return (base || "") + " · couldn't reach GitHub";
        }
        if (s && s.communityBehind && latest) {
          return latest + " is out (this build: " + base + ")";
        }
        if (latest) return latest + " — up to date";
        return base ? (base + " · checking…") : "";
      },
    },
    {
      id: "aboutCommunityReleases",
      category: "about",
      icon: "github",
      title: "Community releases",
      description: "phuryn/grok-build-vscode — the build this fork tracks.",
      kind: "action",
      actionLabel: "Open",
      href: "https://github.com/phuryn/grok-build-vscode/releases",
      visible: (s, env) => !remoteAbout(s, env),
    },
`;

function applySettings(src: string): string {
  src = rename(
    src,
    '(s && s.hostKind === "desktop") ? "Grok Build Desktop" : "Grok Build extension"',
    '(s && s.hostKind === "desktop") ? "Grok Build Desktop" : "Grok30m"',
  );
  src = rename(src, 'title: "This extension"', 'title: "Grok30m"');
  src = whenMissing(
    src,
    'id: "aboutCommunityBase"',
    `      get: (s) => versionLabel(s && s.extVersion),
    },
    {
      id: "aboutGrokCli",`,
    `      get: (s) => versionLabel(s && s.extVersion),
    },
${SETTINGS_ROWS}    {
      id: "aboutGrokCli",`,
    "aboutCommunityBase",
  );
  src = whenMissing(
    src,
    "communityBase: \"\"",
    `      providersChecking: false,
      extVersion: "",
      cliVersion: "",`,
    `      providersChecking: false,
      extVersion: "",
      communityBase: "",
      communityLatest: "",
      communityBehind: false,
      communityError: "",
      cliVersion: "",`,
    "settings communityBase",
  );
  return src;
}

function applyWebviewHelpers(src: string): string {
  return whenMissing(
    src,
    '"sessionsReady"',
    '"listSessions", ',
    '"listSessions", "sessionsReady", "setHideAutoSessions", ',
    "webview-helpers sessionsReady",
  );
}

function applyValidate(src: string): string {
  return whenMissing(
    src,
    'case "sessionsReady":',
    `      break;
    case "listRepoSessions":`,
    `      break;
    case "sessionsReady":
      break;
    case "setHideAutoSessions":
      if (!isBoolean(raw.value)) return null;
      break;
    case "listRepoSessions":`,
    "validate sessionsReady",
  );
}

function applyProtocol(src: string): string {
  if (!src.includes("hideAutoSessions?: boolean")) {
    const re = /(\| \{ type: "sessions";[^\n]*query: string)( \})/;
    const hits = src.match(new RegExp(re.source, "g"));
    if (!hits || hits.length !== 1) {
      throw new Error(`Grok30m overlay anchor ${!hits ? "missing" : "not unique"} (sessions host msg)`);
    }
    src = src.replace(re, "$1; hideAutoSessions?: boolean$2");
  }
  src = whenMissing(
    src,
    '{ type: "sessionsReady" }',
    `  | { type: "listSessions"; offset?: number; limit?: number; providerCursor?: { grokOffset: number; codexHighWater?: { updatedAt: number; id: string } }; query?: string }
  // Preview rows for a repo the client is NOT currently in`,
    `  | { type: "listSessions"; offset?: number; limit?: number; providerCursor?: { grokOffset: number; codexHighWater?: { updatedAt: number; id: string } }; query?: string }
  | { type: "sessionsReady" }
  | { type: "setHideAutoSessions"; value: boolean }
  // Preview rows for a repo the client is NOT currently in`,
    "protocol sessionsReady",
  );
  src = whenMissing(
    src,
    "sessionsReady: true",
    "listSessions: true, ",
    "listSessions: true, sessionsReady: true, setHideAutoSessions: true, ",
    "protocol type map",
  );
  return src;
}

function applyRemotePolicy(src: string): string {
  src = whenMissing(
    src,
    'sessionsReady: "view"',
    `  listSessions: "view",
  // Same read as listSessions, aimed at a repo the client is not currently in`,
    `  listSessions: "view",
  sessionsReady: "view",
  setHideAutoSessions: "full",
  // Same read as listSessions, aimed at a repo the client is not currently in`,
    "remote-policy disposition",
  );
  src = whenMissing(
    src,
    "sessionsReady: false",
    `  listSessions: false,
  listRepoSessions: false,`,
    `  listSessions: false,
  sessionsReady: false,
  setHideAutoSessions: false,
  listRepoSessions: false,`,
    "remote-policy bound session",
  );
  return src;
}

function applySession(src: string): string {
  src = whenMissing(
    src,
    'import type { HostEditorWebview } from "./host";',
    'import { AcpClient } from "./acp";\n',
    'import { AcpClient } from "./acp";\nimport type { HostEditorWebview } from "./host";\n',
    "session panel import",
  );
  src = whenMissing(
    src,
    "panel?: HostEditorWebview;",
    `  /** grok's id for this session (set on session/new or session/load). */
  activeSessionId?: string;

  /**
   * Effective working directory for this session's \`grok agent stdio\` process.`,
    `  /** grok's id for this session (set on session/new or session/load). */
  activeSessionId?: string;

  /** Editor-tab host for this session when \`grok.preferredLocation\` is panel. */
  panel?: HostEditorWebview;

  /**
   * Effective working directory for this session's \`grok agent stdio\` process.`,
    "session panel field",
  );
  return src;
}

function applySidebar(src: string): string {
  src = whenMissing(
    src,
    "shouldHideAutoSession",
    `} from "./sessions";
import {`,
    `} from "./sessions";
import { shouldHideAutoSession } from "./session-tags";
import { COMMUNITY_BASE_VERSION, COMMUNITY_RELEASES_PAGE } from "./community-sync";
import { peekCommunityLag } from "./release-peek";
import {`,
    "sidebar imports",
  );
  src = whenMissing(
    src,
    'sessionsViewId = "grok.sessions"',
    `  private projectsRail?: HostWebviewView;
  /** The session currently shown in the chat — one member of {@link pool}. */`,
    `  private projectsRail?: HostWebviewView;
  /** Dedicated Sessions sidebar (Grok30m). Absent until that view resolves. */
  private sessionsView?: HostWebviewView;
  public static readonly panelType = "grok.panel";
  public static readonly sessionsViewId = "grok.sessions";
  /** The session currently shown in the chat — one member of {@link pool}. */`,
    "sidebar sessions fields",
  );
  src = whenMissing(
    src,
    "private webviewFor(",
    "  private chatLocalResourceRoots(): Uri[] {",
    `${SIDEBAR_TAB_METHODS}  private chatLocalResourceRoots(): Uri[] {`,
    "sidebar tab methods",
  );
  src = swap(
    src,
    `  private postMode(session: Session = this.focused): void {
    const message: HostMsg = { type: "modeChanged", modeId: this.displayMode(session) };
    if (session === this.focused) this.view?.webview.postMessage(message);
    this.sendRemoteSession(session, message);
  }`,
    `  private postMode(session: Session = this.focused): void {
    const message: HostMsg = { type: "modeChanged", modeId: this.displayMode(session) };
    if (session === this.focused) {
      const webview = this.webviewFor(session);
      if (webview) webview.postMessage(message);
    }
    this.sendRemoteSession(session, message);
  }`,
    "postMode",
  );
  src = swap(
    src,
    `      // Trusted session media: stream from disk when the webview can.
      const webview = this.view?.webview;`,
    `      // Trusted session media: stream from disk when the webview can.
      const webview = this.webviewFor(session);`,
    "generated media webview",
  );
  src = whenMissing(
    src,
    'case "sessionsReady":',
    `        this.postSessionsList({ offset: msg.offset, limit: msg.limit, query: msg.query, providerCursor: msg.providerCursor });
        }
        break;
      case "listRepoSessions":`,
    `        this.postSessionsList({ offset: msg.offset, limit: msg.limit, query: msg.query, providerCursor: msg.providerCursor });
        }
        break;
      case "sessionsReady":
        this.postSessionsList();
        break;
      case "setHideAutoSessions":
        void this.host.getConfiguration("grok").update("hideAutoSessions", !!msg.value);
        this.postSessionsList();
        break;
      case "listRepoSessions":`,
    "sidebar sessionsReady",
  );
  src = swap(
    src,
    `    const dots: Record<string, Dot> = {};
    for (const entry of entries) dots[entry.id] = this.dotForId(entry.id);
    const nextOffset = query
      ? offset + entries.length
      : Math.max(offset + entries.length, combinedPage?.providerCursor.grokOffset ?? 0);
    const total = query ? (merged?.length ?? 0) : (grok?.total ?? 0) + adapter.length;
    return {
      type: "sessions",
      entries,
      activeId,
      dots,
      offset,
      total,
      hasMore: query ? nextOffset < total : combinedPage?.hasMore ?? false,
      nextOffset,
      ...(!query && combinedPage ? { providerCursor: combinedPage.providerCursor } : {}),
      query,
    };`,
    `    const dots: Record<string, Dot> = {};
    for (const entry of entries) dots[entry.id] = this.dotForId(entry.id);
    const nextOffset = query
      ? offset + entries.length
      : Math.max(offset + entries.length, combinedPage?.providerCursor.grokOffset ?? 0);
    const total = query ? (merged?.length ?? 0) : (grok?.total ?? 0) + adapter.length;
    const hideAuto = this.hideAutoSessions();
    const visible = hideAuto
      ? entries.filter((e) => e.id === activeId || !shouldHideAutoSession(e.displayName, undefined))
      : entries;
    const visibleDots: Record<string, Dot> = {};
    for (const entry of visible) visibleDots[entry.id] = this.dotForId(entry.id);
    return {
      type: "sessions",
      entries: visible,
      activeId,
      dots: visibleDots,
      offset,
      total: hideAuto ? visible.length : total,
      hasMore: query ? nextOffset < total : combinedPage?.hasMore ?? false,
      nextOffset,
      ...(!query && combinedPage ? { providerCursor: combinedPage.providerCursor } : {}),
      query,
      hideAutoSessions: hideAuto,
    };`,
    "combined sessions hide-auto",
  );
  src = swap(
    src,
    `    const query = (opts?.query ?? "").trim().toLowerCase();
    // Stale per-tab / selected cwds must not scan a closed project's catalog.`,
    `    const query = (opts?.query ?? "").trim().toLowerCase();
    const hideAuto = this.hideAutoSessions();
    // Stale per-tab / selected cwds must not scan a closed project's catalog.`,
    "grok list hideAuto",
  );
  src = swap(
    src,
    `    if (query) {
      // Search needs names for everything, so read (cache-backed) the whole list once, then filter.
      const all = this.readEntriesCachedMulti(index.map((e) => e.id), mtimeById, cwdById, overrides, grokHome, log)
        .filter((e) => e.kind !== "subagent");
      all.sort((a, b) => b.updatedAt - a.updatedAt);
      const matched = all.filter(
        (e) =>
          e.displayName.toLowerCase().includes(query) ||
          (e.worktreeLabel && e.worktreeLabel.toLowerCase().includes(query)),
      );`,
    `    const filterAuto = (entries: SessionListEntry[]) => {
      if (!hideAuto) return entries;
      return entries.filter((e) => e.id === activeId || !shouldHideAutoSession(e.displayName, undefined));
    };
    if (query || hideAuto) {
      // Search and hide-auto need names, so read (cache-backed) the whole list once, then filter.
      const all = this.readEntriesCachedMulti(index.map((e) => e.id), mtimeById, cwdById, overrides, grokHome, log)
        .filter((e) => e.kind !== "subagent");
      all.sort((a, b) => b.updatedAt - a.updatedAt);
      const matched = filterAuto(query
        ? all.filter(
            (e) =>
              e.displayName.toLowerCase().includes(query) ||
              (e.worktreeLabel && e.worktreeLabel.toLowerCase().includes(query)),
          )
        : all);`,
    "grok list filter",
  );
  src = swap(
    src,
    `      hasMore,
      nextOffset,
      query: opts?.query ?? "",
    };`,
    `      hasMore,
      nextOffset,
      query: opts?.query ?? "",
      hideAutoSessions: hideAuto,
    };`,
    "grok list hideAutoSessions field",
  );
  src = swap(
    src,
    `  private rehydrateWebviewFromFocused(): void {
    const session = this.focused;
    const wv = this.view?.webview;`,
    `  private rehydrateWebviewFromFocused(): void {
    const session = this.focused;
    const wv = this.webviewFor(session);`,
    "rehydrate webview",
  );
  src = swap(
    src,
    `  private postChips(session: Session = this.focused): void {
    const remoteMessage: HostMsg = { type: "chips", chips: session.chips };
    if (session === this.focused && this.view) {
      const webview = this.view.webview;
      const localMessage: HostMsg = { type: "chips", chips: this.localPreviewChips(session, webview) };
      void webview.postMessage(localMessage);
    }`,
    `  private postChips(session: Session = this.focused): void {
    const remoteMessage: HostMsg = { type: "chips", chips: session.chips };
    const webview = session === this.focused ? this.webviewFor(session) : undefined;
    if (webview) {
      const localMessage: HostMsg = { type: "chips", chips: this.localPreviewChips(session, webview) };
      void webview.postMessage(localMessage);
    }`,
    "postChips",
  );
  src = swap(
    src,
    `  private post(message: HostMsg): void {
    if (this.focused.suppressContent && GrokSidebar.SUPPRESS_TYPES.has(message.type)) return;
    this.view?.webview.postMessage(message);
    this.mirrorToProjectsRail(message);`,
    `  private post(message: HostMsg): void {
    if (this.focused.suppressContent && GrokSidebar.SUPPRESS_TYPES.has(message.type)) return;
    const chat = this.webviewFor(this.focused);
    if (chat) chat.postMessage(message);
    else if (!this.usesPanelTabs()) this.view?.webview.postMessage(message);
    this.mirrorToProjectsRail(message);`,
    "post",
  );
  src = swap(
    src,
    `  private postLocal(message: HostMsg): void {
    this.postTap?.("local", message);
    this.view?.webview.postMessage(message);
    this.mirrorToProjectsRail(message);
  }`,
    `  private postLocal(message: HostMsg): void {
    this.postTap?.("local", message);
    const chat = this.webviewFor(this.focused);
    if (chat) chat.postMessage(message);
    else if (!this.usesPanelTabs()) this.view?.webview.postMessage(message);
    this.mirrorToProjectsRail(message);
    this.postToSessions(message);
  }`,
    "postLocal",
  );
  src = swap(
    src,
    `    if (session === this.focused) {
      this.postTap?.("local", message);
      const webview = this.view?.webview;
      if (webview) webview.postMessage(this.localizeHistoryMessage(message, webview));
      // Active-session identity for the projects rail (highlight + pin home).
      this.mirrorToProjectsRail(message);
    }`,
    `    if (session === this.focused) {
      this.postTap?.("local", message);
      const webview = this.webviewFor(session);
      if (webview) webview.postMessage(this.localizeHistoryMessage(message, webview));
      // Active-session identity for the projects rail (highlight + pin home).
      this.mirrorToProjectsRail(message);
      this.postToSessions(message);
    }`,
    "emit",
  );
  src = swap(
    src,
    `    if (session !== this.focused) return;
    this.postTap?.("local", message);
    const webview = this.view?.webview;
    if (webview) webview.postMessage(this.localizeHistoryMessage(message, webview));
    this.mirrorToProjectsRail(message);
  }

  /** Desk-targeted, non-replayable delivery for one-shot notices. */`,
    `    if (session !== this.focused) return;
    this.postTap?.("local", message);
    const webview = this.webviewFor(session);
    if (webview) webview.postMessage(this.localizeHistoryMessage(message, webview));
    this.mirrorToProjectsRail(message);
    this.postToSessions(message);
  }

  /** Desk-targeted, non-replayable delivery for one-shot notices. */`,
    "emitLocal",
  );
  src = swap(
    src,
    `    if (session !== this.focused) return;
    this.postTap?.("local", message);
    const webview = this.view?.webview;
    if (webview) webview.postMessage(this.localizeHistoryMessage(message, webview));
    this.mirrorToProjectsRail(message);
  }

  private async replayLoadedHistory(`,
    `    if (session !== this.focused) return;
    this.postTap?.("local", message);
    const webview = this.webviewFor(session);
    if (webview) webview.postMessage(this.localizeHistoryMessage(message, webview));
    this.mirrorToProjectsRail(message);
    this.postToSessions(message);
  }

  private async replayLoadedHistory(`,
    "emitLocalTransient",
  );
  src = swap(
    src,
    `    const wv = this.view?.webview;
    // Both surfaces need it, and the desk has the same gap the browser does —`,
    `    const wv = this.webviewFor(session);
    // Both surfaces need it, and the desk has the same gap the browser does —`,
    "focusSession webview",
  );
  src = swap(
    src,
    `    const message: HostMsg = { type: "sessionDot", id, dot: this.dotForId(id) };
    this.view?.webview.postMessage(message);
    this.mirrorToProjectsRail(message);`,
    `    const message: HostMsg = { type: "sessionDot", id, dot: this.dotForId(id) };
    const chat = this.webviewFor(this.focused);
    if (chat) chat.postMessage(message);
    else if (!this.usesPanelTabs()) this.view?.webview.postMessage(message);
    this.mirrorToProjectsRail(message);`,
    "pushDot",
  );
  src = swap(
    src,
    `    this.postSessionsList();
  }

  private focusRemoteSession(`,
    `    this.postSessionsList();
    this.revealChat();
  }

  private focusRemoteSession(`,
    "reveal after new session",
  );
  src = swap(
    src,
    `    // needs because it has no folder to switch.
    if (this.host.canSwitchWorkspaceFolder) return;`,
    `    // needs because it has no folder to switch.
    this.revealChat();
    if (this.host.canSwitchWorkspaceFolder) return;`,
    "reveal after resume",
  );
  src = applySettingsLag(src);
  src = rename(src, 'title: "Grok Settings"', 'title: "Grok30m Settings"');
  src = rename(src, "<title>Grok Settings</title>", "<title>Grok30m Settings</title>");
  src = rename(src, 'title="Grok Build Desktop"', 'title="Grok30m"');
  src = rename(
    src,
    "<span class=\"wordmark\"><b>Grok</b> <span class=\"dim\">Build</span></span>",
    "<span class=\"wordmark\"><b>Grok</b><span class=\"dim\">30m</span></span>",
  );
  src = whenMissing(
    src,
    'useSessionsSidebar() ? "" :',
    '<button id="history-btn" class="icon-btn" title="Session history"></button>',
    '${this.useSessionsSidebar() ? "" : `<button id="history-btn" class="icon-btn" title="Session history"></button>`}',
    "history button",
  );
  src = swap(
    src,
    '<h2>${isCloudEnvironment() ? "AFK Pilot (Cloud)" : "Grok Build (Community)"}</h2>',
    '<h2>${isCloudEnvironment() ? "AFK Pilot (Cloud)" : "Grok30m"}</h2>',
    "welcome title",
  );
  src = swap(
    src,
    '<p class="welcome-byline muted">by Paweł Huryn (<a href="https://www.productcompass.pm/" class="muted-link">The Product Compass</a>)</p>',
    '<p class="welcome-byline muted">30m fork of Grok Build (Community) — <a href="https://github.com/thirtym/grok30m" class="muted-link">thirtym/grok30m</a></p>',
    "welcome byline",
  );
  return src;
}

function applySettingsLag(src: string): string {
  if (src.includes("refreshCommunityLagOnSettings")) return src;
  src = swap(
    src,
    `      if (category) {
        void this.settingsEditor.webview.postMessage({ type: "settingsCategory", category });
      }
      return;`,
    `      if (category) {
        void this.settingsEditor.webview.postMessage({ type: "settingsCategory", category });
      }
      void this.refreshCommunityLagOnSettings();
      return;`,
    "settings reveal refresh",
  );
  src = swap(
    src,
    `        this.host.appendLine(\`[settings] \${msg.type} failed: \${text}\`);
      });
    });
  }

  private async onSettingsPanelMessage(msg: WebviewMsg): Promise<void> {`,
    `        this.host.appendLine(\`[settings] \${msg.type} failed: \${text}\`);
      });
    });
    void this.refreshCommunityLagOnSettings();
  }

  private async refreshCommunityLagOnSettings(): Promise<void> {
    const panel = this.settingsEditor;
    if (!panel) return;
    const lag = await peekCommunityLag(this.context.extensionVersion);
    if (this.settingsEditor !== panel) return;
    void panel.webview.postMessage({
      type: "communityLagStatus",
      base: lag.base,
      latest: lag.latest || "",
      behind: lag.behind,
      error: lag.error || "",
    });
  }

  private async onSettingsPanelMessage(msg: WebviewMsg): Promise<void> {`,
    "settings lag method",
  );
  src = swap(
    src,
    `        extVersion: this.context.extensionVersion,
        cliVersion: this.providerCliVersions.grok || "",`,
    `        extVersion: this.context.extensionVersion,
        communityBase: COMMUNITY_BASE_VERSION,
        communityLatest: "",
        communityBehind: false,
        communityError: "",
        communityReleasesUrl: COMMUNITY_RELEASES_PAGE,
        cliVersion: this.providerCliVersions.grok || "",`,
    "settings boot community fields",
  );
  src = swap(
    src,
    `          if (msg.current) next.cliVersion = msg.current;
          surface.update(next);
        }
        if (msg.type === "providerState" && Array.isArray(msg.providers)) {`,
    `          if (msg.current) next.cliVersion = msg.current;
          surface.update(next);
        }
        if (msg.type === "communityLagStatus") {
          surface.update({
            communityBase: msg.base || "",
            communityLatest: msg.latest || "",
            communityBehind: !!msg.behind,
            communityError: msg.error || "",
          });
        }
        if (msg.type === "providerState" && Array.isArray(msg.providers)) {`,
    "settings lag message",
  );
  return src;
}

const SETTINGS_TEST = `  it("shows whether this fork is behind community Grok Build", () => {
    const api = loadSettings();
    const row = api.ROWS.find((r: { id: string }) => r.id === "aboutCommunityBase") as {
      describe: (s: Record<string, unknown>) => string;
    };
    expect(row.describe({ communityBase: "4.5.2" })).toBe("4.5.2 · checking…");
    expect(row.describe({ communityBase: "4.5.2", communityLatest: "4.5.2" })).toBe("4.5.2 — up to date");
    expect(row.describe({
      communityBase: "4.5.2",
      communityLatest: "4.6.0",
      communityBehind: true,
    })).toBe("4.6.0 is out (this build: 4.5.2)");
    expect(row.describe({ communityBase: "4.5.2", communityError: "offline" }))
      .toBe("4.5.2 · couldn't reach GitHub");
  });

`;

function applySettingsTest(src: string): string {
  return whenMissing(
    src,
    'r.id === "aboutCommunityBase"',
    '  it("puts the non-affiliation disclaimer only at the bottom of the About page", () => {',
    `${SETTINGS_TEST}  it("puts the non-affiliation disclaimer only at the bottom of the About page", () => {`,
    "settings community test",
  );
}

function applyHarness(src: string): string {
  src = whenMissing(
    src,
    "sessionsSidebar?: boolean",
    `  vscode?: boolean;
  postMessage?:`,
    `  vscode?: boolean;
  /** Grok30m Sessions sidebar: chat HTML has no #history-btn. */
  sessionsSidebar?: boolean;
  postMessage?:`,
    "harness option",
  );
  src = whenMissing(
    src,
    'opts.sessionsSidebar) doc.getElementById("history-btn")',
    `    newBtn?.parentElement?.insertBefore(slot, newBtn.nextSibling);
  }
  // What the relay's chat.html sets before loading chat.js.`,
    `    newBtn?.parentElement?.insertBefore(slot, newBtn.nextSibling);
  }
  if (opts.sessionsSidebar) doc.getElementById("history-btn")?.remove();
  // What the relay's chat.html sets before loading chat.js.`,
    "harness history-btn",
  );
  return src;
}

function applyWebviewUiTest(src: string): string {
  return src
    .replaceAll('expect(text).toContain("This extension")', 'expect(text).toContain("Grok30m")')
    .replaceAll(
      'expect(aboutSurface(h).textContent).toContain("This extension")',
      'expect(aboutSurface(h).textContent).toContain("Grok30m")',
    );
}
