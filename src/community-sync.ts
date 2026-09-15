// Pure "are we behind community?" policy. GitHub fetch lives in release-peek.
// Compares the community release this fork last merged, never Grok30m's 2.x.
import { parseGrokVersion, compareVersionTuple } from "./cli-locator";
import type { GithubRelease } from "./self-update";

/** Community repo this fork tracks. */
export const COMMUNITY_GITHUB_REPO = "phuryn/grok-build-vscode";
export const COMMUNITY_RELEASES_LATEST =
  `https://api.github.com/repos/${COMMUNITY_GITHUB_REPO}/releases/latest`;
export const COMMUNITY_RELEASES_PAGE =
  `https://github.com/${COMMUNITY_GITHUB_REPO}/releases`;

/**
 * Community tag last merged into Grok30m. Bump this in the same change that
 * merges `upstream` — About and the startup notice both read it.
 */
export const COMMUNITY_BASE_VERSION = "4.5.2";

export const COMMUNITY_NOTICE_STATE_KEY = "grok30m.communityBehindNoticed";

export type CommunityLagDecision =
  | { action: "current"; base: string; latest: string }
  | { action: "behind"; base: string; latest: string }
  | { action: "skip-prerelease"; latest: string }
  | { action: "skip-draft"; latest: string }
  | { action: "unparseable"; base: string; latest: string };

export function releaseTagVersion(release: GithubRelease): string {
  return (release.tag_name || release.name || "").replace(/^v/i, "");
}

export function decideCommunityLag(
  baseVersion: string,
  release: GithubRelease,
): CommunityLagDecision {
  const latest = releaseTagVersion(release);
  if (release.draft) return { action: "skip-draft", latest };
  if (release.prerelease) return { action: "skip-prerelease", latest };
  const base = parseGrokVersion(baseVersion);
  const next = parseGrokVersion(latest);
  if (!base || !next) return { action: "unparseable", base: baseVersion, latest };
  if (compareVersionTuple(next, base) > 0) {
    return { action: "behind", base: baseVersion, latest };
  }
  return { action: "current", base: baseVersion, latest };
}

/** One startup notice per community latest we have already mentioned. */
export function shouldNoticeCommunityLag(
  noticedLatest: string | undefined,
  latest: string,
): boolean {
  const noticed = (noticedLatest || "").replace(/^v/i, "");
  const current = (latest || "").replace(/^v/i, "");
  if (!current) return false;
  return noticed !== current;
}

export function communityLagStatusText(decision: CommunityLagDecision): string {
  if (decision.action === "behind") {
    return `Community ${decision.latest} is out — this build merged ${decision.base}.`;
  }
  if (decision.action === "current") {
    return `Community ${decision.latest} — up to date.`;
  }
  if (decision.action === "unparseable") {
    return `Community latest is ${decision.latest || "unknown"}.`;
  }
  return `Community ${decision.latest} is a pre-release.`;
}

/** About / Check-for-Updates line from a live peek (or a failed fetch). */
export function communityPeekStatusText(peek: {
  behind: boolean;
  base: string;
  latest?: string;
  error?: string;
}): string {
  if (peek.error && !peek.latest) return "Couldn't check community releases.";
  if (peek.behind && peek.latest) {
    return `Community ${peek.latest} is out — this build merged ${peek.base}.`;
  }
  if (peek.latest) return `Community ${peek.latest} — up to date.`;
  return `Merged community ${peek.base}.`;
}
