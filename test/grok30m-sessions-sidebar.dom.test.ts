import { describe, it, expect } from "vitest";
import { bootWebview } from "./webview-harness";

/**
 * Grok30m's default HTML omits #history-btn (Sessions lives in its own
 * sidebar). Community chat.js used to assign to that node on boot, which
 * threw before `ready` and left the editor tab stuck on Starting.
 */
describe("Grok30m Sessions sidebar chat boot", () => {
  it("posts ready and paints composer chrome when history-btn is absent", () => {
    const seen: { type: string }[] = [];
    const { doc } = bootWebview({
      ready: false,
      sessionsSidebar: true,
      postMessage: (m) => { seen.push(m); },
    });
    expect(doc.getElementById("history-btn")).toBeNull();
    expect(seen.some((m) => m.type === "ready")).toBe(true);
    expect(doc.getElementById("add-btn")?.innerHTML).toContain("svg");
    expect(doc.getElementById("send-btn")?.innerHTML).toContain("svg");
    expect(doc.getElementById("new-btn")?.innerHTML).toContain("svg");
  });
});
