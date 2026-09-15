import { describe, it, expect } from "vitest";
import {
  COMMUNITY_BASE_VERSION,
  COMMUNITY_GITHUB_REPO,
  communityLagStatusText,
  communityPeekStatusText,
  decideCommunityLag,
  releaseTagVersion,
  shouldNoticeCommunityLag,
} from "../src/community-sync";

describe("community lag", () => {
  it("records the community tag this tree merged", () => {
    expect(COMMUNITY_BASE_VERSION).toBe("4.5.2");
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
