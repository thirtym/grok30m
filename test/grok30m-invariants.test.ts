import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";

const root = path.resolve(__dirname, "..");

/**
 * These must stay green after every community merge. A textually clean merge
 * that drops editor-tab chat is how 2.0.1 shipped; this file is the tripwire.
 */
describe("Grok30m session tabs (fork invariants)", () => {
  const sidebar = readFileSync(path.join(root, "src", "sidebar.ts"), "utf8");
  const session = readFileSync(path.join(root, "src", "session.ts"), "utf8");
  const host = readFileSync(path.join(root, "src", "host.ts"), "utf8");
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    name: string;
    publisher: string;
    activationEvents?: string[];
    contributes: {
      views?: Record<string, { id: string }[]>;
      commands?: { command: string }[];
      configuration: { properties: Record<string, { default?: unknown }> };
    };
  };

  it("defaults chat to an editor tab per session", () => {
    expect(pkg.contributes.configuration.properties["grok.preferredLocation"].default).toBe("panel");
    expect(pkg.activationEvents).toContain("onWebviewPanel:grok.panel");
    expect(pkg.contributes.commands?.some((c) => c.command === "grok.panel.open")).toBe(true);
  });

  it("routes host posts to the session's editor tab", () => {
    expect(sidebar).toContain("private webviewFor(session");
    expect(sidebar).toContain("ensurePanelForSession");
    expect(sidebar).toContain("bindChatPanel");
    const start = sidebar.indexOf("private post(message: HostMsg)");
    const end = sidebar.indexOf("private postGrokUpdateStatus", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = sidebar.slice(start, end);
    expect(body).toContain("webviewFor");
    expect(body).toMatch(/if \(chat\) chat\.postMessage\(message\)/);
  });

  it("chat.js does not assume the in-tab history button exists", () => {
    const chat = readFileSync(path.join(root, "media", "chat.js"), "utf8");
    expect(sidebar).toContain('this.useSessionsSidebar() ? "" : `<button id="history-btn"');
    expect(chat).toMatch(/if \(historyBtn\) historyBtn\.innerHTML/);
    expect(chat).toMatch(/if \(historyBtn\) historyBtn\.onclick/);
  });

  it("keeps a per-session editor webview on Session and Host", () => {
    expect(session).toMatch(/panel\?: HostEditorWebview/);
    expect(host).toContain("openEditorWebview");
  });

  it("stays grok30m so GitHub-release self-update can find this install", () => {
    expect(pkg.name).toBe("grok30m");
    expect(pkg.publisher).toBe("grok30m");
    expect(pkg.contributes.configuration.properties["grok.autoUpdate"].default).toBe(true);
  });
});
