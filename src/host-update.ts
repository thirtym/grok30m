// VS Code/Cursor glue for Grok30m self-update + conflicting-extension cleanup.
// Runs on whichever host the window is attached to (this computer, or an SSH
// remote). Fetches https://github.com/thirtym/grok30m/releases/latest.
import * as vscode from "vscode";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import {
  GROK30M_RELEASES_LATEST,
  GithubRelease,
  LAST_CHECK_STATE_KEY,
  conflictsToRemove,
  decideExtensionUpdate,
  shouldCheckForUpdate,
} from "./self-update";
import {
  COMMUNITY_BASE_VERSION,
  COMMUNITY_NOTICE_STATE_KEY,
  COMMUNITY_RELEASES_PAGE,
  communityPeekStatusText,
  shouldNoticeCommunityLag,
} from "./community-sync";
import { peekCommunityLag, peekExtensionUpdate } from "./release-peek";
import { httpsDownloadFile, httpsGetJson } from "./http-get";

export { peekCommunityLag, peekExtensionUpdate };

export interface HostUpdateOptions {
  /** Ignore the 6h throttle (gear → Check, or the command palette). */
  forceCheck?: boolean;
  /** Toast "already up to date" when nothing to install. Off for silent startup. */
  notifyIfCurrent?: boolean;
}

function userAgent(version: string): Record<string, string> {
  return {
    "User-Agent": `Grok30m/${version} (+https://github.com/thirtym/grok30m)`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function whereAmI(): string {
  return vscode.env.remoteName ? `this remote (${vscode.env.remoteName})` : "this computer";
}

function installedIds(): string[] {
  return vscode.extensions.all.map((e) => e.id);
}

async function uninstallConflicts(output: vscode.OutputChannel): Promise<string[]> {
  const toRemove = conflictsToRemove(installedIds());
  const removed: string[] = [];
  for (const id of toRemove) {
    try {
      await vscode.commands.executeCommand("workbench.extensions.uninstallExtension", id);
      removed.push(id);
      output.appendLine(`Uninstalled conflicting extension ${id}`);
    } catch (e) {
      output.appendLine(`Could not uninstall ${id}: ${(e as Error).message}`);
    }
  }
  if (removed.length) {
    const labels = removed
      .map((id) => (id.toLowerCase().includes("pawel") ? "community Grok" : id))
      .join(", ");
    void vscode.window.showInformationMessage(
      `Removed ${labels} so it doesn't fight Grok30m on ${whereAmI()}.`,
    );
  }
  return removed;
}

async function fetchLatest(version: string): Promise<GithubRelease> {
  return httpsGetJson<GithubRelease>(GROK30M_RELEASES_LATEST, userAgent(version));
}

async function maybeNoticeCommunityLag(
  context: vscode.ExtensionContext,
  peek: Awaited<ReturnType<typeof peekCommunityLag>>,
  opts: HostUpdateOptions,
): Promise<void> {
  if (!peek.behind || !peek.latest) return;
  const noticed = context.globalState.get<string>(COMMUNITY_NOTICE_STATE_KEY);
  if (!opts.notifyIfCurrent && !shouldNoticeCommunityLag(noticed, peek.latest)) return;
  await context.globalState.update(COMMUNITY_NOTICE_STATE_KEY, peek.latest);
  const pick = await vscode.window.showInformationMessage(
    communityPeekStatusText(peek),
    "Open community release",
  );
  if (pick === "Open community release") {
    await vscode.env.openExternal(vscode.Uri.parse(COMMUNITY_RELEASES_PAGE));
  }
}

function withCommunityLine(grokLine: string, peek: Awaited<ReturnType<typeof peekCommunityLag>>): string {
  return `${grokLine} ${communityPeekStatusText(peek)}`.trim();
}

async function notifyCheckResult(
  context: vscode.ExtensionContext,
  text: string,
  peek: Awaited<ReturnType<typeof peekCommunityLag>>,
  warning = false,
): Promise<void> {
  if (peek.behind && peek.latest) {
    await context.globalState.update(COMMUNITY_NOTICE_STATE_KEY, peek.latest);
  }
  const actions = peek.behind ? (["Open community release"] as const) : [];
  const pick = warning
    ? await vscode.window.showWarningMessage(text, ...actions)
    : await vscode.window.showInformationMessage(text, ...actions);
  if (pick === "Open community release") {
    await vscode.env.openExternal(vscode.Uri.parse(COMMUNITY_RELEASES_PAGE));
  }
}

async function installVsix(filePath: string): Promise<void> {
  try {
    await vscode.commands.executeCommand(
      "workbench.extensions.installExtension",
      vscode.Uri.file(filePath),
    );
    return;
  } catch {
    // Cursor/VS Code SSH remotes sometimes refuse the command; the CLI on this
    // host (including ~/.cursor-server/bin/*/bin/remote-cli/cursor) still works.
  }
  const clis = ["cursor", "code", "cursor-insiders", "code-insiders"];
  let lastErr: Error | undefined;
  for (const cli of clis) {
    try {
      await execFileAsync(cli, ["--install-extension", filePath, "--force"], { timeout: 120_000 });
      return;
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw lastErr ?? new Error(`Could not install ${filePath}`);
}

/**
 * Silent on startup (throttled). Command palette / About uses forceCheck.
 * Never throws — activate() must stay alive if GitHub is down.
 */
export async function runHostMaintenance(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  opts: HostUpdateOptions = {},
): Promise<void> {
  try {
    await uninstallConflicts(output);

    const currentVersion = String((context.extension.packageJSON as { version?: string }).version ?? "");
    const cfg = vscode.workspace.getConfiguration("grok");
    const autoUpdate = cfg.get<boolean>("autoUpdate", true);

    const lastCheck = context.globalState.get<number>(LAST_CHECK_STATE_KEY);
    const now = Date.now();
    const due = opts.forceCheck || shouldCheckForUpdate(lastCheck, now);
    const community: CommunityPeek = due
      ? await peekCommunityLag(currentVersion)
      : { base: COMMUNITY_BASE_VERSION, behind: false, status: "" };
    if (due) {
      await context.globalState.update(LAST_CHECK_STATE_KEY, now);
      output.appendLine(
        community.error
          ? `Community lag check failed: ${community.error}`
          : `Community lag check: ${community.behind ? "behind" : "current"} (merged ${community.base}${community.latest ? `, latest ${community.latest}` : ""})`,
      );
      if (!opts.notifyIfCurrent) {
        await maybeNoticeCommunityLag(context, community, opts);
      }
    }
    if (!autoUpdate && !opts.forceCheck) return;
    if (!due) return;

    let release: GithubRelease;
    try {
      release = await fetchLatest(currentVersion);
    } catch (e) {
      const msg = (e as Error).message;
      output.appendLine(`Grok30m update check failed: ${msg}`);
      if (opts.notifyIfCurrent) {
        await notifyCheckResult(
          context,
          withCommunityLine(`Couldn't check Grok30m updates: ${msg}`, community),
          community,
          true,
        );
      }
      return;
    }

    const decision = decideExtensionUpdate(currentVersion, release);
    output.appendLine(`Grok30m update check: ${decision.action} (installed ${currentVersion})`);

    if (decision.action === "current") {
      if (opts.notifyIfCurrent) {
        await notifyCheckResult(
          context,
          withCommunityLine(`Grok30m ${currentVersion} is current on ${whereAmI()}.`, community),
          community,
        );
      }
      return;
    }
    if (decision.action !== "update") {
      if (opts.notifyIfCurrent) {
        await notifyCheckResult(
          context,
          withCommunityLine(`Grok30m ${currentVersion} — no newer GitHub release to install.`, community),
          community,
        );
      }
      return;
    }

    if (!autoUpdate && opts.forceCheck) {
      const pick = await vscode.window.showInformationMessage(
        `Grok30m ${decision.latest} is on GitHub. Install on ${whereAmI()}?`,
        "Install",
        "Not now",
      );
      if (pick !== "Install") return;
    }

    const dest = path.join(os.tmpdir(), "grok30m-update", decision.asset.name);
    output.appendLine(`Downloading ${decision.asset.browser_download_url}`);
    await httpsDownloadFile(decision.asset.browser_download_url, dest, userAgent(currentVersion));
    await installVsix(dest);
    output.appendLine(`Installed Grok30m ${decision.latest} on ${whereAmI()}`);

    const pick = await vscode.window.showInformationMessage(
      `Grok30m ${decision.latest} is installed on ${whereAmI()}. Reload to use it.`,
      "Reload",
    );
    if (pick === "Reload") {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
  } catch (e) {
    output.appendLine(`Grok30m update failed: ${(e as Error).message}`);
    if (opts.notifyIfCurrent) {
      void vscode.window.showWarningMessage(`Grok30m update failed: ${(e as Error).message}`);
    }
  }
}

