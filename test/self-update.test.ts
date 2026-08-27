import { describe, it, expect } from "vitest";
import {
  CONFLICTING_EXTENSION_IDS,
  GROK30M_EXTENSION_ID,
  GROK30M_GITHUB_REPO,
  GROK30M_RELEASES_LATEST,
  UPDATE_CHECK_INTERVAL_MS,
  conflictsToRemove,
  decideExtensionUpdate,
  isNewerVersion,
  pickVsixAsset,
  shouldCheckForUpdate,
  type GithubRelease,
} from "../src/self-update";

const vsix = (name: string) => ({
  name,
  browser_download_url: `https://github.com/${GROK30M_GITHUB_REPO}/releases/download/v2.0.3/${name}`,
});

describe("isNewerVersion", () => {
  it("treats 2.0.3 as newer than the retracted 2.0.1 and the restored 2.0.2", () => {
    expect(isNewerVersion("2.0.1", "2.0.3")).toBe(true);
    expect(isNewerVersion("2.0.2", "2.0.3")).toBe(true);
    expect(isNewerVersion("1.5.7", "2.0.3")).toBe(true);
  });

  it("is false when already on latest or newer", () => {
    expect(isNewerVersion("2.0.3", "2.0.3")).toBe(false);
    expect(isNewerVersion("v2.0.3", "2.0.3")).toBe(false);
    expect(isNewerVersion("2.0.4", "2.0.3")).toBe(false);
  });
});

describe("shouldCheckForUpdate", () => {
  const interval = UPDATE_CHECK_INTERVAL_MS;
  it("checks on a fresh install (no prior timestamp)", () => {
    expect(shouldCheckForUpdate(undefined, 1_000_000, interval)).toBe(true);
  });
  it("skips inside the interval and checks once it elapses", () => {
    const last = 1_000_000;
    expect(shouldCheckForUpdate(last, last + interval - 1, interval)).toBe(false);
    expect(shouldCheckForUpdate(last, last + interval, interval)).toBe(true);
  });
});

describe("pickVsixAsset", () => {
  it("prefers grok30m-*.vsix over the community package name", () => {
    const picked = pickVsixAsset([
      vsix("grok-vscode-phuryn-3.18.0.vsix"),
      vsix("grok30m-2.0.3.vsix"),
      { name: "source.zip", browser_download_url: "https://example/source.zip" },
    ]);
    expect(picked?.name).toBe("grok30m-2.0.3.vsix");
  });

  it("returns undefined when the release has no vsix", () => {
    expect(pickVsixAsset([{ name: "notes.md", browser_download_url: "https://x" }])).toBeUndefined();
    expect(pickVsixAsset(undefined)).toBeUndefined();
  });
});

describe("decideExtensionUpdate", () => {
  const release = (over: Partial<GithubRelease> = {}): GithubRelease => ({
    tag_name: "v2.0.3",
    draft: false,
    prerelease: false,
    assets: [vsix("grok30m-2.0.3.vsix")],
    ...over,
  });

  it("updates an older install to the GitHub vsix", () => {
    const d = decideExtensionUpdate("2.0.1", release());
    expect(d).toEqual({
      action: "update",
      current: "2.0.1",
      latest: "2.0.3",
      asset: vsix("grok30m-2.0.3.vsix"),
    });
  });

  it("is current when the installed version matches latest", () => {
    expect(decideExtensionUpdate("2.0.3", release()).action).toBe("current");
  });

  it("ignores drafts and prereleases so a retracted build cannot roll forward", () => {
    expect(decideExtensionUpdate("2.0.2", release({ draft: true })).action).toBe("skip-draft");
    expect(decideExtensionUpdate("2.0.2", release({ prerelease: true })).action).toBe("skip-prerelease");
  });

  it("does not install when GitHub has no grok30m vsix attached", () => {
    expect(decideExtensionUpdate("2.0.2", release({ assets: [] })).action).toBe("no-asset");
  });
});

describe("conflictsToRemove", () => {
  it("removes the community marketplace extension and the grok-tabs workaround", () => {
    expect(conflictsToRemove([
      GROK30M_EXTENSION_ID,
      "PawelHuryn.grok-vscode-phuryn",
      "paul-local.grok-tabs",
      "paul-local.codex-tabs",
    ])).toEqual([...CONFLICTING_EXTENSION_IDS]);
  });

  it("is case-insensitive and ignores unrelated extensions", () => {
    expect(conflictsToRemove(["pawelhuryn.grok-vscode-phuryn", "openai.chatgpt"])).toEqual([
      "PawelHuryn.grok-vscode-phuryn",
    ]);
    expect(conflictsToRemove(["openai.chatgpt"])).toEqual([]);
  });
});

describe("central feed", () => {
  it("points at the public thirtym/grok30m latest release", () => {
    expect(GROK30M_RELEASES_LATEST).toBe(
      "https://api.github.com/repos/thirtym/grok30m/releases/latest",
    );
    expect(GROK30M_EXTENSION_ID).toBe("grok30m.grok30m");
  });
});
