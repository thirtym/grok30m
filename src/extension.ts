import * as vscode from "vscode";
import { GrokSidebar } from "./sidebar";
import { GrokSessionsView } from "./sessions-view";
import { runHostMaintenance } from "./host-update";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Grok");
  const sidebar = new GrokSidebar(context, output);
  const sessionsView = new GrokSessionsView(sidebar);

  // Fetch GitHub Releases on this host (computer or SSH remote) and drop
  // leftover community/grok-tabs copies that hide Grok30m's views.
  void runHostMaintenance(context, output);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(GrokSidebar.viewId, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(GrokSessionsView.viewId, sessionsView, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    output,
    { dispose: () => sidebar.dispose() },
    vscode.commands.registerCommand("grok.open", () => sidebar.openPreferred()),
    vscode.commands.registerCommand("grok.panel.open", () => sidebar.openPanel()),
    vscode.commands.registerCommand("grok.sidebar.open", () => sidebar.openSidebar()),
    vscode.commands.registerCommand("grok.newSession", () => sidebar.newSession()),
    vscode.commands.registerCommand("grok.compact", () => {
      vscode.window.showInformationMessage(
        "Type /compact in the composer to compress the conversation.",
      );
    }),
    vscode.commands.registerCommand("grok.pickModel", () => sidebar.pickModel()),
    vscode.commands.registerCommand("grok.toggleMode", () => sidebar.openModePopover()),
    vscode.commands.registerCommand("grok.sendSelection", () =>
      sidebar.insertActiveMention({ selection: true }),
    ),
    vscode.commands.registerCommand(
      "grok.sendFile",
      (uri?: vscode.Uri) => sidebar.insertActiveMention({ uri }),
    ),
    vscode.commands.registerCommand("grok.insertAtMention", () =>
      sidebar.insertActiveMention(),
    ),
    vscode.commands.registerCommand("grok.showLogs", () => output.show()),
    vscode.commands.registerCommand("grok.logout", () => sidebar.logout()),
    vscode.commands.registerCommand("grok.checkForUpdates", () =>
      runHostMaintenance(context, output, { forceCheck: true, notifyIfCurrent: true }),
    ),
    vscode.commands.registerCommand("grok._debugDummyPlan", () => sidebar.debugShowDummyPlan()),
  );
}

export function deactivate(): void {
  // disposables handle cleanup
}