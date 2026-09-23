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
 * Community tag last merged into Grok30m. The auto-sync Action rewrites this
 * in the same commit that merges the tag.
 */
export const COMMUNITY_BASE_VERSION = "4.6.1";

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

export type CommunityReleaseRef = Pick<GithubRelease, "tag_name" | "name" | "draft" | "prerelease">;

/** Oldest published community tag newer than `baseVersion`. One step per sync. */
export function nextCommunityRelease(
  baseVersion: string,
  releases: CommunityReleaseRef[],
): { tag: string; version: string } | undefined {
  const base = parseGrokVersion(baseVersion);
  if (!base) return undefined;
  const newer: { tag: string; version: string; tuple: [number, number, number] }[] = [];
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const version = releaseTagVersion(release);
    const tuple = parseGrokVersion(version);
    if (!tuple) continue;
    if (compareVersionTuple(tuple, base) <= 0) continue;
    const tag = (release.tag_name || `v${version}`).startsWith("v")
      ? (release.tag_name || `v${version}`)
      : `v${version}`;
    newer.push({ tag, version, tuple });
  }
  newer.sort((a, b) => compareVersionTuple(a.tuple, b.tuple));
  const next = newer[0];
  return next ? { tag: next.tag, version: next.version } : undefined;
}

export function bumpPatchVersion(version: string): string {
  const tuple = parseGrokVersion(version);
  if (!tuple) throw new Error(`unparseable version ${version}`);
  return `${tuple[0]}.${tuple[1]}.${tuple[2] + 1}`;
}

export function replaceCommunityBaseVersion(source: string, next: string): string {
  const updated = source.replace(
    /export const COMMUNITY_BASE_VERSION = "[^"]+";/,
    `export const COMMUNITY_BASE_VERSION = "${next}";`,
  );
  if (updated === source) {
    throw new Error("COMMUNITY_BASE_VERSION assignment not found");
  }
  return updated;
}

export function replaceCommunityBaseVersionTest(source: string, next: string): string {
  const updated = source.replace(
    /expect\(COMMUNITY_BASE_VERSION\)\.toBe\("[^"]+"\);/,
    `expect(COMMUNITY_BASE_VERSION).toBe("${next}");`,
  );
  if (updated === source) {
    throw new Error("COMMUNITY_BASE_VERSION test assertion not found");
  }
  return updated;
}

export function prependGrok30mChangelog(
  existing: string,
  grokVersion: string,
  communityVersion: string,
): string {
  const section =
    `## ${grokVersion}\n\n` +
    `- **Merge community ${communityVersion}** (auto-sync).\n` +
    `- **Grok30m UX kept:** editor-tab chat, Sessions sidebar, hide automated sessions.\n\n`;
  const idx = existing.search(/\n## /);
  if (idx === -1) return section + existing;
  return existing.slice(0, idx + 1) + section + existing.slice(idx + 1);
}
