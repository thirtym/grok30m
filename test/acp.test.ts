import { describe, it, expect, vi } from "vitest";
import { AcpClient, buildGrokAgentArgs } from "../src/acp";

// Unit tests for AcpClient internals that don't need a real subprocess. We
// stand up the client with a fake writable proc and drive `request`/`onLine`
// directly.
function clientWithFakeProc(): { client: AcpClient; written: string[] } {
  const client = new AcpClient({ cliPath: "x", cwd: "/", log: () => {} });
  const written: string[] = [];
  (client as any).proc = {
    killed: false,
    stdin: { writable: true, write: (s: string) => written.push(s) },
  };
  return { client, written };
}

describe("AcpClient.request timer lifecycle", () => {
  it("clears the per-request timeout when the response arrives (no leaked timer)", async () => {
    vi.useFakeTimers();
    try {
      const { client } = clientWithFakeProc();
      const before = vi.getTimerCount();

      const p = (client as any).request("session/set_mode", { modeId: "plan" }); // id = 1
      expect(vi.getTimerCount()).toBe(before + 1); // timeout armed

      (client as any).onLine(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }));
      await p;

      expect(vi.getTimerCount()).toBe(before); // timeout cleared on response
    } finally {
      vi.useRealTimers();
    }
  });
});

// #3/#4 (thanks @shugav for the crash report): the startup crash was the bogus
// `max` value, not reasoningEffort itself — grok accepts none|minimal|low|medium|
// high|xhigh, and the flag must precede the `stdio` subcommand.
describe("buildGrokAgentArgs", () => {
  it("starts ACP sessions with the stdio subcommand when no effort is set", () => {
    expect(buildGrokAgentArgs()).toEqual(["agent", "stdio"]);
  });

  it("forwards a valid effort as --reasoning-effort before the stdio subcommand", () => {
    expect(buildGrokAgentArgs("high")).toEqual(["agent", "--reasoning-effort", "high", "stdio"]);
    expect(buildGrokAgentArgs("none")).toEqual(["agent", "--reasoning-effort", "none", "stdio"]);
    expect(buildGrokAgentArgs("xhigh")).toEqual(["agent", "--reasoning-effort", "xhigh", "stdio"]);
  });
});

// Regression (2026-07-11): `grok.defaultModel` had been persisted as "grok-build",
// an id grok later dropped from its catalog (now grok-4.5 / grok-composer-2.5-fast).
// newSession() called session/set_model with it unconditionally, grok answered
// -32602 "Invalid params: unknown model id", and that rejection propagated out of
// session start — killing the CLI (exit 143) and showing "Failed to start Grok:
// Invalid params". A stale *preference* must never take the session down.
describe("newSession with a model id grok no longer offers", () => {
  const catalog = {
    currentModelId: "grok-4.5",
    availableModels: [{ modelId: "grok-4.5", name: "Grok 4.5" }, { modelId: "grok-composer-2.5-fast", name: "Composer" }],
  };

  it("does not send session/set_model for an id outside the catalog, and still opens the session", async () => {
    const { client, written } = clientWithFakeProc();
    const p = client.newSession("grok-build"); // id = 1 -> session/new
    (client as any).onLine(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { sessionId: "s1", models: catalog } }));

    const res = await p; // must resolve, not reject
    expect(res.sessionId).toBe("s1");
    expect(written.some((w) => w.includes("session/set_model"))).toBe(false);
    expect(client.currentModelId).toBe("grok-4.5"); // grok's own model stands
  });

  it("emits modelUnavailable so the UI can tell the user the setting is stale", async () => {
    const { client } = clientWithFakeProc();
    const seen: any[] = [];
    client.on("modelUnavailable", (v) => seen.push(v));

    const p = client.newSession("grok-build");
    (client as any).onLine(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { sessionId: "s1", models: catalog } }));
    await p;

    expect(seen).toEqual([{ requested: "grok-build", current: "grok-4.5" }]);
  });

  it("still sends session/set_model for an id grok DOES offer", async () => {
    const { client, written } = clientWithFakeProc();
    const p = client.newSession("grok-composer-2.5-fast");
    (client as any).onLine(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { sessionId: "s1", models: catalog } }));
    // set_model goes out as id 2; answer it so newSession can resolve.
    await vi.waitFor(() => expect(written.some((w) => w.includes("session/set_model"))).toBe(true));
    (client as any).onLine(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { _meta: { model: { Ok: "grok-composer-2.5-fast" } } } }));

    await p;
    expect(client.currentModelId).toBe("grok-composer-2.5-fast");
  });
});
