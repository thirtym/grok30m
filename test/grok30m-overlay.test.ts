import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GROK30M_OVERLAY_PATHS,
  SIDEBAR_TAB_METHODS,
  applyGrok30mFile,
} from "../src/grok30m-overlay";

const root = path.resolve(__dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function show(tag: string, rel: string): string | undefined {
  try {
    return execFileSync("git", ["show", `${tag}:${rel}`], { cwd: root, encoding: "utf8" });
  } catch {
    return undefined;
  }
}

describe("Grok30m overlay", () => {
  it("is idempotent on the current tree", () => {
    for (const rel of GROK30M_OVERLAY_PATHS) {
      const src = read(rel);
      expect(applyGrok30mFile(rel, src), rel).toBe(src);
    }
  });

  it("sidebar method block matches the live tab implementation", () => {
    const sidebar = read("src/sidebar.ts");
    const start = sidebar.indexOf("  attachSessionsView(");
    const end = sidebar.indexOf("  private chatLocalResourceRoots(");
    expect(sidebar.slice(start, end)).toBe(SIDEBAR_TAB_METHODS);
  });

  it("restamps a community README even when the title changes", () => {
    const src = "# GUI for Grok Build & Muse Code\n\nTwo ways to use the same agent UI.\n";
    const stamped = applyGrok30mFile("README.md", src);
    expect(stamped.startsWith("# Grok30m\n")).toBe(true);
    expect(stamped).toContain("Two ways to use");
    expect(applyGrok30mFile("README.md", stamped)).toBe(stamped);
  });

  it("puts session-tab tokens back onto community 4.11.1", () => {
    const tag = "v4.11.1";
    const sidebar = show(tag, "src/sidebar.ts");
    if (sidebar === undefined) return;
    const stamped = applyGrok30mFile("src/sidebar.ts", sidebar);
    expect(stamped).toContain("private webviewFor(");
    expect(stamped).toContain("claimPanelSession");
    expect(stamped).toContain('m.type === "composerFocus" && m.focused === false');
    expect(stamped).toContain("useSessionsSidebar()");
    expect(stamped).toContain("setRepoIcon");
    expect(applyGrok30mFile("src/sidebar.ts", stamped)).toBe(stamped);

    for (const rel of GROK30M_OVERLAY_PATHS) {
      const theirs = show(tag, rel);
      if (theirs === undefined) continue;
      const once = applyGrok30mFile(rel, theirs);
      expect(applyGrok30mFile(rel, once), rel).toBe(once);
    }

    const protocol = applyGrok30mFile("src/protocol.ts", show(tag, "src/protocol.ts")!);
    expect(protocol).toContain('{ type: "sessionsReady" }');
    expect(protocol).toContain("setHideAutoSessions: true");
    expect(protocol).toContain("hideAutoSessions?: boolean");
    expect(protocol).toContain("setRepoIcon");

    const helpers = applyGrok30mFile("media/webview-helpers.js", show(tag, "media/webview-helpers.js")!);
    expect(helpers).toContain('"sessionsReady", "setHideAutoSessions"');
    expect(helpers).toContain('"setRepoIcon"');

    const chat = applyGrok30mFile("media/chat.js", show(tag, "media/chat.js")!);
    expect(chat).toContain("if (historyBtn) historyBtn.innerHTML");
    expect(chat).toContain("if (historyBtn) historyBtn.onclick");
  });
});
