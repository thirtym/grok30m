// GitHub release peeks used by About and Check for Updates.
// No vscode — sidebar must stay loadable in a plain Node / Electron host.
import {
  COMMUNITY_BASE_VERSION,
  COMMUNITY_RELEASES_LATEST,
  communityLagStatusText,
  decideCommunityLag,
} from "./community-sync";
import { httpsGetJson } from "./http-get";
import {
  GROK30M_GITHUB_REPO,
  GROK30M_RELEASES_LATEST,
  GithubRelease,
  decideExtensionUpdate,
} from "./self-update";

export type ExtensionPeek = {
  latest?: string;
  updateAvailable: boolean;
  error?: string;
};

export type CommunityPeek = {
  base: string;
  latest?: string;
  behind: boolean;
  status: string;
  error?: string;
};

function userAgent(version: string): Record<string, string> {
  return {
    "User-Agent": `Grok30m/${version} (+https://github.com/${GROK30M_GITHUB_REPO})`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function fetchLatest(url: string, version: string): Promise<GithubRelease> {
  return httpsGetJson<GithubRelease>(url, userAgent(version));
}

/** Status for the About panel — does not install. */
export async function peekExtensionUpdate(currentVersion: string): Promise<ExtensionPeek> {
  try {
    const release = await fetchLatest(GROK30M_RELEASES_LATEST, currentVersion);
    const decision = decideExtensionUpdate(currentVersion, release);
    if (decision.action === "update") {
      return { latest: decision.latest, updateAvailable: true };
    }
    if (decision.action === "current") {
      return { latest: decision.latest, updateAvailable: false };
    }
    return { latest: "latest" in decision ? decision.latest : undefined, updateAvailable: false };
  } catch (e) {
    return { updateAvailable: false, error: (e as Error).message };
  }
}

/** Status for About — community release vs the tag this fork last merged. */
export async function peekCommunityLag(version: string): Promise<CommunityPeek> {
  try {
    const release = await fetchLatest(COMMUNITY_RELEASES_LATEST, version);
    const decision = decideCommunityLag(COMMUNITY_BASE_VERSION, release);
    return {
      base: COMMUNITY_BASE_VERSION,
      latest: "latest" in decision ? decision.latest : undefined,
      behind: decision.action === "behind",
      status: communityLagStatusText(decision),
    };
  } catch (e) {
    return {
      base: COMMUNITY_BASE_VERSION,
      behind: false,
      status: "Could not reach community releases.",
      error: (e as Error).message,
    };
  }
}
