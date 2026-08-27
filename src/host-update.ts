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
import { httpsDownloadFile, httpsGetJson } from "./http-get";

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
    if (!autoUpdate && !opts.forceCheck) return;

    const lastCheck = context.globalState.get<number>(LAST_CHECK_STATE_KEY);
    const now = Date.now();
    if (!opts.forceCheck && !shouldCheckForUpdate(lastCheck, now)) return;

    await context.globalState.update(LAST_CHECK_STATE_KEY, now);

    let release: GithubRelease;
    try {
      release = await fetchLatest(currentVersion);
    } catch (e) {
      const msg = (e as Error).message;
      output.appendLine(`Grok30m update check failed: ${msg}`);
      if (opts.notifyIfCurrent) {
        void vscode.window.showWarningMessage(`Couldn't check Grok30m updates: ${msg}`);
      }
      return;
    }

    const decision = decideExtensionUpdate(currentVersion, release);
    output.appendLine(`Grok30m update check: ${decision.action} (installed ${currentVersion})`);

    if (decision.action === "current") {
      if (opts.notifyIfCurrent) {
        void vscode.window.showInformationMessage(
          `Grok30m ${currentVersion} is current on ${whereAmI()}.`,
        );
      }
      return;
    }
    if (decision.action !== "update") {
      if (opts.notifyIfCurrent) {
        void vscode.window.showInformationMessage(
          `Grok30m ${currentVersion} — no newer GitHub release to install.`,
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

/** Status for the About panel — does not install. */
export async function peekExtensionUpdate(
  currentVersion: string,
): Promise<{ latest?: string; updateAvailable: boolean; error?: string }> {
  try {
    const release = await fetchLatest(currentVersion);
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


