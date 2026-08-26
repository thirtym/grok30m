import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";

const root = path.resolve(__dirname, "..");

describe("Grok30m identity", () => {
  const sidebar = readFileSync(path.join(root, "src", "sidebar.ts"), "utf8");
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    name: string;
    publisher: string;
    displayName: string;
    contributes: {
      configuration: { properties: Record<string, { default?: unknown }> };
      viewsContainers?: Record<string, unknown>;
    };
  };

  it("welcome names Grok30m and links the 30m fork", () => {
    expect(sidebar).toContain("<h2>Grok30m</h2>");
    expect(sidebar).toContain("30m fork of Grok Build (Community)");
    expect(sidebar).toContain("https://github.com/thirtym/grok30m");
    expect(sidebar).not.toContain("by Paweł Huryn");
  });

  it("is the grok30m publisher, not the community marketplace id", () => {
    expect(pkg.name).toBe("grok30m");
    expect(pkg.publisher).toBe("grok30m");
    expect(pkg.displayName).toBe("Grok30m");
  });

  it("keeps editor-tab chat, Sessions sidebar, and hide-automation", () => {
    const props = pkg.contributes.configuration.properties;
    expect(props["grok.preferredLocation"].default).toBe("panel");
    expect(props["grok.sessionsSidebar"].default).toBe(true);
    expect(props["grok.hideAutoSessions"].default).toBe(true);
    expect(pkg.contributes.viewsContainers).toEqual(
      expect.objectContaining({ activitybar: expect.any(Array) }),
    );
    expect(pkg.contributes.viewsContainers).not.toHaveProperty("secondarySidebar");
  });
});
