import type { HostWebviewView } from "./host";
import type { GrokSidebar } from "./sidebar";

export class GrokSessionsView {
  public static readonly viewId = "grok.sessions";

  constructor(private readonly host: GrokSidebar) {}

  resolveWebviewView(view: HostWebviewView): void {
    this.host.attachSessionsView(view);
  }
}
