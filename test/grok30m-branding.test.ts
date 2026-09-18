import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { describe, it, expect } from "vitest";

const root = path.resolve(__dirname, "..");

describe("Grok30m identity", () => {
  const sidebar = readFileSync(path.join(root, "src", "sidebar.ts"), "utf8");
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    name: string;
    publisher: string;
    displayName: string;
    activationEvents?: string[];
    extensionKind?: string[];
    contributes: {
      configuration: { title?: string; properties: Record<string, { default?: unknown }> };
      viewsContainers?: Record<string, { title: string }[]>;
      commands?: { command: string; title: string }[];
    };
  };

  it("desk posts reach the editor tab, not only the hidden sidebar chat", () => {
    const start = sidebar.indexOf("private post(message: HostMsg)");
    const end = sidebar.indexOf("private postGrokUpdateStatus", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = sidebar.slice(start, end);
    expect(body).toContain("webviewFor");
    expect(body).toMatch(/if \(chat\) chat\.postMessage\(message\)/);
  });

  it("welcome names Grok30m and links the 30m fork", () => {
    expect(sidebar).toContain('"Grok30m"');
    expect(sidebar).toContain("30m fork of Grok Build (Community)");
    expect(sidebar).toContain("https://github.com/thirtym/grok30m");
    expect(sidebar).not.toContain("by Paweł Huryn");
  });

  it("is the grok30m publisher, not the community marketplace id", () => {
    expect(pkg.name).toBe("grok30m");
    expect(pkg.publisher).toBe("grok30m");
    expect(pkg.displayName).toBe("Grok30m");
  });

  it("chrome says Grok30m so it cannot be mistaken for community Grok Build", () => {
    expect(pkg.contributes.configuration.title).toBe("Grok30m");
    const containers = pkg.contributes.viewsContainers as Record<string, { title: string }[]>;
    for (const group of Object.values(containers)) {
      for (const view of group) expect(view.title).toBe("Grok30m");
    }
    for (const cmd of pkg.contributes.commands ?? []) {
      if (cmd.command === "grok.linkRemote" || cmd.command === "grok.unlinkRemote") continue;
      expect(cmd.title, cmd.command).toMatch(/Grok30m/);
    }
    const settings = readFileSync(path.join(root, "media", "settings.js"), "utf8");
    expect(settings).toContain('title: "Grok30m"');
    expect(settings).not.toContain('title: "This extension"');
    expect(settings).not.toContain("Community Grok Build");
    expect(sidebar).toContain("Grok30m Settings");
    expect(sidebar).not.toContain("title: \"Grok Settings\"");
  });

  it("keeps editor-tab chat, Sessions sidebar, and hide-automation", () => {
    const props = pkg.contributes.configuration.properties;
    expect(props["grok.preferredLocation"].default).toBe("panel");
    expect(props["grok.sessionsSidebar"].default).toBe(true);
    expect(props["grok.hideAutoSessions"].default).toBe(true);
    expect(pkg.contributes.viewsContainers).toEqual(
      expect.objectContaining({ activitybar: expect.any(Array) }),
    );
    expect(pkg.contributes.views.grokPrimary?.some((v: { id: string }) => v.id === "grok.sessions")).toBe(true);
  });

  it("activates on startup so GitHub-release updates run on every host, including SSH remotes", () => {
    expect(pkg.activationEvents).toContain("onStartupFinished");
    expect(pkg.extensionKind).toEqual(["workspace"]);
    expect(pkg.contributes.configuration.properties["grok.autoUpdate"].default).toBe(true);
    expect(pkg.contributes.commands?.some((c) => c.command === "grok.checkForUpdates")).toBe(true);
  });
});

describe("Grok30m bootstrap", () => {
  const bootstrap = readFileSync(path.join(root, "scripts", "bootstrap.sh"), "utf8");

  it("bash can parse bootstrap.sh", () => {
    execFileSync("bash", ["-n", path.join(root, "scripts", "bootstrap.sh")]);
  });

  it("installs from GitHub Releases onto Cursor, VS Code, and cursor-server remotes", () => {
    expect(bootstrap).toContain('API="https://api.github.com/repos/${REPO}/releases/latest"');
    expect(bootstrap).toContain('REPO="thirtym/grok30m"');
    expect(bootstrap).toContain("cursor");
    expect(bootstrap).toContain(".cursor-server/bin");
    expect(bootstrap).toContain("*/bin/remote-cli/cursor");
    expect(bootstrap).toContain("grok30m.grok30m");
    expect(bootstrap).toContain("PawelHuryn.grok-vscode-phuryn");
    expect(bootstrap).toContain("paul-local.grok-tabs");
  });
});
