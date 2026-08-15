#!/usr/bin/env python3
"""Retroactively tag automated Grok sessions in summary.json.

Mirrors src/session-tags.ts classification. Updates session_summary with an
[Auto:<tag>] prefix so the Grok Build sidebar can filter them out.

Usage:
  tag-sessions.py [--days N] [--cwd PATH] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

AUTO_TAG_RE = re.compile(r"^\[Auto:(review|deploy|robot)\]\s*", re.I)
PRIMER_SUMMARY_RE = re.compile(r"primer", re.I)
PRIMER_CONTEXT_RE = re.compile(r"grok|vs ?code|plan mode|hidden", re.I)
PRIMER_TEXT_RE = re.compile(r"^\s*\[grok-build-vscode primer v\d+\]", re.I)
REVIEW_TITLE_RE = re.compile(
    r"\b(pre-?mortem|strict code review|strict code|diff review|code review|red-?team audit|red-?team|cross-?model review|cross-?model|independent review|grok shadow|code diff review|code diff)\b",
    re.I,
)
REVIEW_QUERY_RE = re.compile(
    r"\b(INDEPENDENT cross-model reviewer|review this DIFF|review the diff|Pre-Mortem Plan Review|/review\b|code reviewer|second opinion)\b",
    re.I,
)
DEPLOY_TITLE_RE = re.compile(
    r"\b(observe:deploy|deploy-[a-f0-9]{6,}|production release|autonomous release|release deploy)\b",
    re.I,
)
DEPLOY_QUERY_RE = re.compile(r"\b(observe:deploy|deploy-[a-f0-9]{6,})\b", re.I)
ROBOT_AGENT_RE = re.compile(r"^(general-purpose|explore|plan|cursor-guide|code-reviewer)$", re.I)
USER_QUERY_RE = re.compile(r"<user_query>([\s\S]*?)(?:</user_query>|$)")


def strip_auto_tag(name: str) -> str:
    return AUTO_TAG_RE.sub("", name or "").strip()


def format_auto_tag(tag: str, title: str) -> str:
    base = strip_auto_tag(title)
    return f"[Auto:{tag}] {base}" if base else f"[Auto:{tag}]"


def is_primer_summary(summary: str) -> bool:
    t = (summary or "").lower()
    return "primer" in t and bool(PRIMER_CONTEXT_RE.search(t))


def is_primer_text(text: str) -> bool:
    return bool(PRIMER_TEXT_RE.match(text or ""))


def extract_user_queries(chat_history: str) -> list[str]:
    out: list[str] = []
    for line in (chat_history or "").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except json.JSONDecodeError:
            continue
        role = o.get("type") or o.get("role")
        if role != "user" or o.get("synthetic_reason"):
            continue
        content = o.get("content", "")
        if isinstance(content, list):
            text = "".join(
                c if isinstance(c, str) else c.get("text", "") for c in content
            )
        else:
            text = str(content)
        text = text.strip()
        if not text or text.startswith("<user_info>") or text.startswith("<system-reminder>"):
            continue
        m = USER_QUERY_RE.search(text)
        out.append((m.group(1) if m else text).strip())
    return out


def classify_auto_tag(
    summary: str,
    first_query: str = "",
    agent_name: str = "",
    primer_only: bool = False,
) -> str | None:
    summary = strip_auto_tag(summary)
    first = (first_query or "").strip()
    agent = (agent_name or "").strip()

    if primer_only:
        return "robot"
    if first and is_primer_text(first) and not summary:
        return "robot"
    if is_primer_summary(summary) and first and is_primer_text(first):
        return "robot"
    if DEPLOY_TITLE_RE.search(summary) or DEPLOY_QUERY_RE.search(first):
        return "deploy"
    if REVIEW_TITLE_RE.search(summary) or REVIEW_QUERY_RE.search(first):
        return "review"
    if ROBOT_AGENT_RE.match(agent) and re.search(r"\bresearch\b", summary, re.I):
        return "robot"
    return None


def sessions_dir(grok_home: Path, cwd: str) -> Path:
    return grok_home / "sessions" / quote(cwd, safe="")


def main() -> int:
    parser = argparse.ArgumentParser(description="Tag automated Grok sessions")
    parser.add_argument("--days", type=float, default=5, help="Only sessions updated in the last N days")
    parser.add_argument("--cwd", default=str(Path.cwd()), help="Workspace cwd encoded in session paths")
    parser.add_argument("--grok-home", default=str(Path.home() / ".grok"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    grok_home = Path(args.grok_home)
    sess_root = sessions_dir(grok_home, args.cwd)
    if not sess_root.is_dir():
        print(f"No sessions dir: {sess_root}", file=sys.stderr)
        return 1

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
    counts: dict[str, int] = {}
    skipped = 0

    for summary_path in sorted(sess_root.glob("*/summary.json")):
        raw = json.loads(summary_path.read_text())
        updated_raw = raw.get("updated_at", "")
        try:
            updated = datetime.fromisoformat(updated_raw.replace("Z", "+00:00"))
        except ValueError:
            continue
        if updated < cutoff:
            continue

        cur = raw.get("session_summary") or raw.get("generated_title") or ""
        if AUTO_TAG_RE.match(cur):
            skipped += 1
            continue

        chat_path = summary_path.parent / "chat_history.jsonl"
        chat = chat_path.read_text() if chat_path.is_file() else ""
        queries = extract_user_queries(chat)
        real = [q for q in queries if not is_primer_text(q)]
        tag = classify_auto_tag(
            cur,
            first_query=real[0] if real else "",
            agent_name=raw.get("agent_name") or "",
            primer_only=any(is_primer_text(q) for q in queries) and not real,
        )
        if not tag:
            continue

        new_summary = format_auto_tag(tag, cur)
        counts[tag] = counts.get(tag, 0) + 1
        sid = raw.get("info", {}).get("id") or summary_path.parent.name
        print(f"{tag:6} {sid[:8]}… {strip_auto_tag(cur)[:70]}")
        if not args.dry_run:
            prev_stat = summary_path.stat()
            raw["session_summary"] = new_summary
            summary_path.write_text(json.dumps(raw, indent=2) + "\n")
            # Preserve mtime so session-history ordering (stat-only index) stays by real activity.
            os.utime(summary_path, (prev_stat.st_atime, prev_stat.st_mtime))

    print(
        f"\nTagged {sum(counts.values())} sessions "
        f"(review={counts.get('review', 0)}, deploy={counts.get('deploy', 0)}, "
        f"robot={counts.get('robot', 0)}); skipped already-tagged={skipped}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())