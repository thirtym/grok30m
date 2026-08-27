// Pure Grok30m update policy. The host (VS Code/Cursor, local or SSH remote)
// fetches GitHub Releases and installs the vsix; this file only decides *whether*
// and *which* asset. Unit-tested; no network, no vscode.
import { parseGrokVersion, compareVersionTuple } from "./cli-locator";

export const GROK30M_GITHUB_REPO = "thirtym/grok30m";
export const GROK30M_RELEASES_LATEST = `https://api.github.com/repos/${GROK30M_GITHUB_REPO}/releases/latest`;
export const GROK30M_EXTENSION_ID = "grok30m.grok30m";

/** Other extensions that steal Grok30m's keybinding / hide its views. */
export const CONFLICTING_EXTENSION_IDS = [
  "PawelHuryn.grok-vscode-phuryn",
  "paul-local.grok-tabs",
] as const;

/** How often a silent startup check hits GitHub. Manual "Check for Updates" bypasses this. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const LAST_CHECK_STATE_KEY = "grok30m.lastUpdateCheckMs";

export interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface GithubRelease {
  tag_name: string;
  name?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GithubReleaseAsset[];
}

export type UpdateDecision =
  | { action: "current"; current: string; latest: string }
  | { action: "update"; current: string; latest: string; asset: GithubReleaseAsset }
  | { action: "skip-prerelease"; latest: string }
  | { action: "skip-draft"; latest: string }
  | { action: "no-asset"; latest: string }
  | { action: "unparseable"; current: string; latest: string };

export function isNewerVersion(current: string, latest: string): boolean {
  const a = parseGrokVersion(current);
  const b = parseGrokVersion(latest);
  if (!a || !b) return false;
  return compareVersionTuple(b, a) > 0;
}

export function shouldCheckForUpdate(
  lastCheckMs: number | undefined,
  nowMs: number,
  intervalMs: number = UPDATE_CHECK_INTERVAL_MS,
): boolean {
  if (lastCheckMs == null || !Number.isFinite(lastCheckMs) || lastCheckMs <= 0) return true;
  return nowMs - lastCheckMs >= intervalMs;
}

/** Prefer `grok30m-*.vsix`; fall back to any `.vsix` that isn't the community package. */
export function pickVsixAsset(assets: GithubReleaseAsset[] | undefined): GithubReleaseAsset | undefined {
  const list = assets ?? [];
  const grok30m = list.find((a) => /^grok30m-.*\.vsix$/i.test(a.name) && a.browser_download_url);
  if (grok30m) return grok30m;
  return list.find(
    (a) =>
      /\.vsix$/i.test(a.name) &&
      a.browser_download_url &&
      !/grok-vscode-phuryn/i.test(a.name),
  );
}

export function decideExtensionUpdate(currentVersion: string, release: GithubRelease): UpdateDecision {
  const latest = (release.tag_name || release.name || "").replace(/^v/i, "");
  if (release.draft) return { action: "skip-draft", latest };
  if (release.prerelease) return { action: "skip-prerelease", latest };
  const asset = pickVsixAsset(release.assets);
  if (!asset) return { action: "no-asset", latest };
  const current = parseGrokVersion(currentVersion);
  const next = parseGrokVersion(latest);
  if (!current || !next) return { action: "unparseable", current: currentVersion, latest };
  if (compareVersionTuple(next, current) <= 0) {
    return { action: "current", current: currentVersion, latest };
  }
  return { action: "update", current: currentVersion, latest, asset };
}

export function conflictsToRemove(installedIds: readonly string[]): string[] {
  const have = new Set(installedIds.map((id) => id.toLowerCase()));
  return CONFLICTING_EXTENSION_IDS.filter((id) => have.has(id.toLowerCase()));
}
