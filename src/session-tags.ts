import { isPrimerSummary, isPrimerText } from "./grok-primer";

/** Automated session kinds shown in the sidebar as `[Auto:<tag>] …`. */
export type AutoTag = "review" | "deploy" | "robot";

export const AUTO_TAG_RE = /^\[Auto:(review|deploy|robot)\]\s*/i;

export function formatAutoTag(tag: AutoTag, title: string): string {
  const base = stripAutoTag((title || "").trim());
  if (!base) return `[Auto:${tag}]`;
  return `[Auto:${tag}] ${base}`;
}

export function stripAutoTag(name: string): string {
  return (name || "").replace(AUTO_TAG_RE, "").trim();
}

export function parseAutoTag(name: string): AutoTag | undefined {
  const m = (name || "").match(AUTO_TAG_RE);
  if (!m) return undefined;
  return m[1].toLowerCase() as AutoTag;
}

export function isAutoTagged(name: string): boolean {
  return AUTO_TAG_RE.test(name || "");
}

export interface ClassifyInput {
  summary?: string;
  /** First real user query (primer stripped). */
  firstQuery?: string;
  agentName?: string;
  /** True when chat history has primer message(s) but zero real user queries. */
  primerOnly?: boolean;
}

const REVIEW_TITLE_RE =
  /\b(pre-?mortem|strict code review|strict code|diff review|code review|red-?team audit|red-?team|cross-?model review|cross-?model|independent review|grok shadow|code diff review|code diff)\b/i;
const REVIEW_QUERY_RE =
  /\b(INDEPENDENT cross-model reviewer|review this DIFF|review the diff|Pre-Mortem Plan Review|\/review\b|code reviewer|second opinion)\b/i;

const DEPLOY_TITLE_RE =
  /\b(observe:deploy|deploy-[a-f0-9]{6,}|production release|autonomous release|release deploy)\b/i;
const DEPLOY_QUERY_RE = /\b(observe:deploy|deploy-[a-f0-9]{6,})\b/i;

const ROBOT_AGENT_RE = /^(general-purpose|explore|plan|cursor-guide|code-reviewer)$/i;

/** Classify an automated session from its title and/or first user message. */
export function classifyAutoTag(inp: ClassifyInput): AutoTag | undefined {
  const summary = stripAutoTag(inp.summary || "");
  const first = (inp.firstQuery || "").trim();
  const agent = (inp.agentName || "").trim();

  // Robot only when chat history confirms primer-only, or the first real query IS the primer.
  // Never infer robot from a primer-derived summary title alone — grok often leaves that title
  // on sessions that already have real user work, and hiding them empties the sidebar.
  if (inp.primerOnly) return "robot";
  if (first && isPrimerText(first) && !summary.replace(/\s+/g, " ")) return "robot";
  if (isPrimerSummary(summary) && first && isPrimerText(first)) return "robot";

  if (DEPLOY_TITLE_RE.test(summary) || DEPLOY_QUERY_RE.test(first)) return "deploy";
  if (REVIEW_TITLE_RE.test(summary) || REVIEW_QUERY_RE.test(first)) return "review";

  if (ROBOT_AGENT_RE.test(agent) && /\bresearch\b/i.test(summary)) return "robot";

  return undefined;
}

/** Resolve the tag for a list entry: stored override → prefix in name → classify. */
export function resolveAutoTag(
  summary: string,
  stored?: AutoTag,
  classify?: ClassifyInput,
): AutoTag | undefined {
  if (stored) return stored;
  const fromName = parseAutoTag(summary);
  if (fromName) return fromName;
  return classify ? classifyAutoTag(classify) : undefined;
}

/** Build the sidebar display name, prefixing automated sessions when tagged. */
export function displayNameWithAutoTag(
  baseName: string,
  tag: AutoTag | undefined,
): string {
  const base = stripAutoTag((baseName || "").trim());
  if (!tag) return base || "Untitled";
  if (isAutoTagged(baseName)) return baseName;
  return formatAutoTag(tag, base);
}

/** Whether a session row should be hidden when automated sessions are filtered out. */
export function shouldHideAutoSession(displayName: string, tag: AutoTag | undefined): boolean {
  return !!tag || isAutoTagged(displayName);
}