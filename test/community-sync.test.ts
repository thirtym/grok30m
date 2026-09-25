import { describe, it, expect } from "vitest";
import {
  COMMUNITY_BASE_VERSION,
  COMMUNITY_GITHUB_REPO,
  bumpPatchVersion,
  communityLagStatusText,
  communityPeekStatusText,
  decideCommunityLag,
  nextCommunityRelease,
  prependGrok30mChangelog,
  releaseTagVersion,
  replaceCommunityBaseVersion,
  shouldNoticeCommunityLag,
} from "../src/community-sync";

describe("community lag", () => {
  it("records the community tag this tree merged", () => {
    expect(COMMUNITY_BASE_VERSION).toBe("4.10.0");
    expect(COMMUNITY_GITHUB_REPO).toBe("phuryn/grok-build-vscode");
  });

  it("is current when latest equals the merged base", () => {
    const d = decideCommunityLag("4.5.2", { tag_name: "v4.5.2" });
    expect(d).toEqual({ action: "current", base: "4.5.2", latest: "4.5.2" });
    expect(communityLagStatusText(d)).toBe("Community 4.5.2 — up to date.");
  });

  it("is behind when community shipped a newer tag", () => {
    const d = decideCommunityLag("4.5.2", { tag_name: "v4.6.0" });
    expect(d).toEqual({ action: "behind", base: "4.5.2", latest: "4.6.0" });
    expect(communityLagStatusText(d)).toMatch(/4\.6\.0/);
    expect(communityLagStatusText(d)).toMatch(/4\.5\.2/);
  });

  it("is current when latest is older than the merged base", () => {
    expect(decideCommunityLag("4.5.2", { tag_name: "v4.5.1" }).action).toBe("current");
  });

  it("skips drafts and prereleases", () => {
    expect(decideCommunityLag("4.5.2", { tag_name: "v4.6.0", draft: true }).action).toBe("skip-draft");
    expect(decideCommunityLag("4.5.2", { tag_name: "v4.6.0-rc.1", prerelease: true }).action)
      .toBe("skip-prerelease");
  });

  it("notices each new community latest once", () => {
    expect(shouldNoticeCommunityLag(undefined, "4.6.0")).toBe(true);
    expect(shouldNoticeCommunityLag("4.6.0", "4.6.0")).toBe(false);
    expect(shouldNoticeCommunityLag("v4.6.0", "4.6.0")).toBe(false);
    expect(shouldNoticeCommunityLag("4.6.0", "4.6.1")).toBe(true);
  });

  it("strips a leading v from the release tag", () => {
    expect(releaseTagVersion({ tag_name: "v4.5.2" })).toBe("4.5.2");
  });

  it("formats a live peek for About and Check for Updates", () => {
    expect(communityPeekStatusText({ behind: false, base: "4.5.2", latest: "4.5.2" }))
      .toBe("Community 4.5.2 — up to date.");
    expect(communityPeekStatusText({ behind: true, base: "4.5.2", latest: "4.6.0" }))
      .toBe("Community 4.6.0 is out — this build merged 4.5.2.");
    expect(communityPeekStatusText({ behind: false, base: "4.5.2", error: "offline" }))
      .toBe("Couldn't check community releases.");
  });
});

describe("next community release (one tag at a time)", () => {
  const releases = [
    { tag_name: "v4.9.0" },
    { tag_name: "v4.6.0" },
    { tag_name: "v4.6.1" },
    { tag_name: "v4.7.0", prerelease: true },
    { tag_name: "v4.5.2" },
  ];

  it("picks the oldest published tag newer than the merged base", () => {
    expect(nextCommunityRelease("4.5.2", releases)).toEqual({
      tag: "v4.6.0",
      version: "4.6.0",
    });
    expect(nextCommunityRelease("4.6.0", releases)?.version).toBe("4.6.1");
    expect(nextCommunityRelease("4.9.0", releases)).toBeUndefined();
  });

  it("skips drafts", () => {
    expect(nextCommunityRelease("4.5.2", [{ tag_name: "v4.6.0", draft: true }])).toBeUndefined();
  });
});

describe("auto-sync file rewrites", () => {
  it("bumps the Grok30m patch, not the community version", () => {
    expect(bumpPatchVersion("2.1.0")).toBe("2.1.1");
  });

  it("rewrites COMMUNITY_BASE_VERSION in place", () => {
    const src = 'export const COMMUNITY_BASE_VERSION = "4.5.2";\n';
    expect(replaceCommunityBaseVersion(src, "4.6.0")).toBe(
      'export const COMMUNITY_BASE_VERSION = "4.6.0";\n',
    );
  });

  it("inserts a changelog section above the previous release", () => {
    const md = "# Grok30m changelog\n\nintro\n\n## 2.1.0\n\n- old\n";
    const next = prependGrok30mChangelog(md, "2.1.1", "4.6.0");
    expect(next).toContain("## 2.1.1");
    expect(next).toContain("Merge community 4.6.0");
    expect(next.indexOf("## 2.1.1")).toBeLessThan(next.indexOf("## 2.1.0"));
  });
});
