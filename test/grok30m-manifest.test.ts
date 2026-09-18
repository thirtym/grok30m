import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import { applyGrok30mManifest, grok30mCommandTitle } from "../src/grok30m-manifest";

const root = path.resolve(__dirname, "..");

describe("applyGrok30mManifest", () => {
  const community = {
    name: "grok-vscode-phuryn",
    displayName: "Grok Build (Community)",
    publisher: "PawelHuryn",
    version: "4.6.0",
    description: "community",
    activationEvents: ["onStartupFinished"],
    contributes: {
      viewsContainers: {
        activitybar: [{ id: "grokPrimary", title: "Grok", icon: "resources/grok-icon.svg" }],
        secondarySidebar: [{ id: "grokSidebar", title: "Grok", icon: "resources/grok-icon.svg" }],
      },
      views: {
        grokSidebar: [{ type: "webview", id: "grok.chat", name: "Grok" }],
        grokProjects: [{ type: "webview", id: "grok.projects", name: "Projects" }],
      },
      commands: [{ command: "grok.open", title: "Grok: Open" }],
      configuration: {
        title: "Grok",
        properties: { "grok.foo": { type: "boolean", default: true } },
      },
    },
  };

  it("turns a community manifest into editor-tab Grok30m without dropping community settings", () => {
    const next = applyGrok30mManifest(community, { version: "2.1.1" });
    expect(next.name).toBe("grok30m");
    expect(next.publisher).toBe("grok30m");
    expect(next.version).toBe("2.1.1");
    const contributes = next.contributes as {
      viewsContainers: Record<string, { title: string }[]>;
      views: Record<string, { id: string; when?: string }[]>;
      commands: { command: string; title: string }[];
      configuration: { title: string; properties: Record<string, { default?: unknown }> };
    };
    expect(contributes.viewsContainers.activitybar[0].title).toBe("Grok30m");
    expect(contributes.views.grokSidebar[0].when).toContain("preferredLocation");
    expect(contributes.views.grokPrimary.some((v) => v.id === "grok.sessions")).toBe(true);
    expect(contributes.commands.some((c) => c.command === "grok.panel.open")).toBe(true);
    expect(contributes.commands.find((c) => c.command === "grok.open")?.title).toBe("Grok30m: Open");
    expect(contributes.configuration.properties["grok.foo"]).toEqual({ type: "boolean", default: true });
    expect(contributes.configuration.properties["grok.preferredLocation"].default).toBe("panel");
    expect(next.activationEvents).toContain("onWebviewPanel:grok.panel");
  });

  it("is safe to re-apply to the current Grok30m package.json", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as Record<string, unknown>;
    const next = applyGrok30mManifest(pkg, { version: "2.1.0" });
    const contributes = next.contributes as {
      configuration: { properties: Record<string, { default?: unknown }> };
      commands: { command: string }[];
    };
    expect(next.publisher).toBe("grok30m");
    expect(contributes.configuration.properties["grok.preferredLocation"].default).toBe("panel");
    expect(contributes.commands.filter((c) => c.command === "grok.panel.open")).toHaveLength(1);
  });
});

describe("grok30mCommandTitle", () => {
  it("retitles community Grok commands and leaves AFK Pilot / Grok30m alone", () => {
    expect(grok30mCommandTitle("Grok: Open")).toBe("Grok30m: Open");
    expect(grok30mCommandTitle("Add Selection to Grok")).toBe("Add Selection to Grok30m");
    expect(grok30mCommandTitle("Grok30m: Open")).toBe("Grok30m: Open");
    expect(grok30mCommandTitle("AFK Pilot: Link this device")).toBe("AFK Pilot: Link this device");
  });
});
