import { describe, it, expect } from "vitest";
import {
  classifyAutoTag,
  displayNameWithAutoTag,
  formatAutoTag,
  isAutoTagged,
  parseAutoTag,
  resolveAutoTag,
  shouldHideAutoSession,
  stripAutoTag,
} from "../src/session-tags";

describe("formatAutoTag / strip / parse", () => {
  it("round-trips a tag prefix", () => {
    expect(formatAutoTag("review", "Strict Code Review: foo")).toBe("[Auto:review] Strict Code Review: foo");
    expect(parseAutoTag("[Auto:deploy] Observe:deploy-abc123")).toBe("deploy");
    expect(stripAutoTag("[Auto:robot] Grok Build Primer")).toBe("Grok Build Primer");
    expect(isAutoTagged("[Auto:review] x")).toBe(true);
    expect(isAutoTagged("Normal session")).toBe(false);
  });
});

describe("classifyAutoTag", () => {
  it("tags review sessions from title or prompt", () => {
    expect(classifyAutoTag({ summary: "Strict Code Review: gate_canary.sh" })).toBe("review");
    expect(classifyAutoTag({ summary: "Pre-Mortem Review: foo plan" })).toBe("review");
    expect(
      classifyAutoTag({
        summary: "Update defaults",
        firstQuery: "You are an INDEPENDENT cross-model reviewer of a code DIFF",
      }),
    ).toBe("review");
  });

  it("tags deploy observe sessions", () => {
    expect(classifyAutoTag({ summary: "Code Review observe:deploy-5725d7d7" })).toBe("deploy");
    expect(classifyAutoTag({ summary: "Fix bug", firstQuery: "observe:deploy-abc12345 review this" })).toBe(
      "deploy",
    );
  });

  it("tags primer-only and research robot sessions", () => {
    expect(
      classifyAutoTag({
        summary: "Grok Build VSCode Primer v4 Plan Mode",
        primerOnly: true,
      }),
    ).toBe("robot");
    expect(
      classifyAutoTag({
        summary: "Research how new crons are registered",
        agentName: "general-purpose",
      }),
    ).toBe("robot");
  });

  it("does not tag real work sessions that merely mention review", () => {
    expect(classifyAutoTag({ summary: "Fix the login bug after review feedback" })).toBe(undefined);
    expect(
      classifyAutoTag({
        summary: "Grok Build VSCode Primer v4 Plan Mode Instructions",
        firstQuery: "deploy p3",
      }),
    ).toBe(undefined);
  });

  it("does not tag robot from a primer-derived summary title without chat history", () => {
    expect(classifyAutoTag({ summary: "Grok Build VSCode Primer v4 Plan Mode" })).toBe(undefined);
  });
});

describe("resolveAutoTag + displayNameWithAutoTag", () => {
  it("prefers stored tag, then prefix, then classify", () => {
    expect(resolveAutoTag("foo", "deploy")).toBe("deploy");
    expect(resolveAutoTag("[Auto:review] Bar")).toBe("review");
    expect(resolveAutoTag("Strict Code Review: x", undefined, { summary: "Strict Code Review: x" })).toBe(
      "review",
    );
  });

  it("prefixes display names for automated sessions", () => {
    expect(displayNameWithAutoTag("Strict Code Review: x", "review")).toBe(
      "[Auto:review] Strict Code Review: x",
    );
    expect(displayNameWithAutoTag("[Auto:review] Already tagged", "review")).toBe(
      "[Auto:review] Already tagged",
    );
  });
});

describe("shouldHideAutoSession", () => {
  it("hides tagged sessions when filter is on", () => {
    expect(shouldHideAutoSession("[Auto:review] x", "review")).toBe(true);
    expect(shouldHideAutoSession("Normal work", undefined)).toBe(false);
  });
});