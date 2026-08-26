import * as vscode from "vscode";
import type { GrokSidebar } from "./sidebar";

export class GrokSessionsView implements vscode.WebviewViewProvider {
  public static readonly viewId = "grok.sessions";

  constructor(private readonly host: GrokSidebar) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.host.attachSessionsView(view);
  }
}