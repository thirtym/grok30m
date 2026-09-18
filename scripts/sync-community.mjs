#!/usr/bin/env node
/**
 * Merge the next community release into grok30m, re-apply the Grok30m
 * manifest (tabs + identity), bump the fork version. CI publishes the vsix.
 *
 *   node scripts/sync-community.mjs --plan     # gh + git files only, no compile
 *   node scripts/sync-community.mjs --apply [--tag v4.6.0]  # needs `npm run compile`
 *
 * Git + gh.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMMUNITY_GITHUB_REPO = "phuryn/grok-build-vscode";
const UPSTREAM_URL = `https://github.com/${COMMUNITY_GITHUB_REPO}.git`;

const argv = process.argv.slice(2);
const args = new Set(argv);
const tagArg = argv.find((a) => a.startsWith("--tag="))?.slice("--tag=".length)
  ?? (argv.includes("--tag") ? argv[argv.indexOf("--tag") + 1] : undefined);
const planOnly = args.has("--plan");
const apply = args.has("--apply");

function parseVer(s) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(s || "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

function cmpVer(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function bumpPatchVersion(version) {
  const tuple = parseVer(version);
  if (!tuple) throw new Error(`unparseable version ${version}`);
  return `${tuple[0]}.${tuple[1]}.${tuple[2] + 1}`;
}

function nextCommunityRelease(baseVersion, releases) {
  const base = parseVer(baseVersion);
  if (!base) return undefined;
  const newer = [];
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const version = String(release.tag_name || release.name || "").replace(/^v/i, "");
    const tuple = parseVer(version);
    if (!tuple || cmpVer(tuple, base) <= 0) continue;
    const raw = release.tag_name || `v${version}`;
    newer.push({
      tag: raw.startsWith("v") ? raw : `v${version}`,
      version,
      tuple,
    });
  }
  newer.sort((a, b) => cmpVer(a.tuple, b.tuple));
  return newer[0] ? { tag: newer[0].tag, version: newer[0].version } : undefined;
}

function readBaseVersion() {
  const src = readFileSync(path.join(root, "src", "community-sync.ts"), "utf8");
  const m = /export const COMMUNITY_BASE_VERSION = "([^"]+)";/.exec(src);
  if (!m) throw new Error("COMMUNITY_BASE_VERSION not found");
  return m[1];
}

function loadApplyModules() {
  const syncJs = path.join(root, "out", "community-sync.js");
  const manifestJs = path.join(root, "out", "grok30m-manifest.js");
  if (!existsSync(syncJs) || !existsSync(manifestJs)) {
    console.error("Run `npm run compile` first (need out/community-sync.js).");
    process.exit(1);
  }
  return {
    ...require(syncJs),
    ...require(manifestJs),
  };
}

function git(gitArgs, opts = {}) {
  return execFileSync("git", gitArgs, { cwd: root, encoding: "utf8", ...opts }).trim();
}

function gh(ghArgs) {
  return execFileSync("gh", ghArgs, { cwd: root, encoding: "utf8" }).trim();
}

function readJson(file) {
  return JSON.parse(readFileSync(path.join(root, file), "utf8"));
}

function communityReleases() {
  const raw = gh([
    "api",
    `repos/${COMMUNITY_GITHUB_REPO}/releases?per_page=50`,
  ]);
  return JSON.parse(raw);
}

function plan(forcedTag) {
  const pkg = readJson("package.json");
  const base = readBaseVersion();
  if (forcedTag) {
    const version = String(forcedTag).replace(/^v/i, "");
    return {
      action: "sync",
      communityTag: forcedTag.startsWith("v") ? forcedTag : `v${version}`,
      communityVersion: version,
      grokVersion: bumpPatchVersion(pkg.version),
      base,
    };
  }
  const next = nextCommunityRelease(base, communityReleases());
  if (!next) {
    return {
      action: "current",
      base,
      grokVersion: pkg.version,
    };
  }
  return {
    action: "sync",
    communityTag: next.tag,
    communityVersion: next.version,
    grokVersion: bumpPatchVersion(pkg.version),
    base,
  };
}

function ensureUpstream() {
  const remotes = git(["remote"]);
  if (!remotes.split("\n").includes("upstream")) {
    git(["remote", "add", "upstream", UPSTREAM_URL]);
  }
}

function conflictedFiles() {
  const out = git(["diff", "--name-only", "--diff-filter=U"], { stdio: ["ignore", "pipe", "pipe"] });
  return out ? out.split("\n").filter(Boolean) : [];
}

function writeManifest(version, applyGrok30mManifest) {
  const pkg = readJson("package.json");
  const next = applyGrok30mManifest(pkg, { version });
  writeFileSync(path.join(root, "package.json"), `${JSON.stringify(next, null, 2)}\n`);
}

function bumpSources(communityVersion, grokVersion, mods) {
  const {
    replaceCommunityBaseVersion,
    replaceCommunityBaseVersionTest,
    prependGrok30mChangelog,
    applyGrok30mManifest,
  } = mods;
  const syncPath = path.join(root, "src", "community-sync.ts");
  writeFileSync(
    syncPath,
    replaceCommunityBaseVersion(readFileSync(syncPath, "utf8"), communityVersion),
  );
  const testPath = path.join(root, "test", "community-sync.test.ts");
  writeFileSync(
    testPath,
    replaceCommunityBaseVersionTest(readFileSync(testPath, "utf8"), communityVersion),
  );
  const logPath = path.join(root, "CHANGELOG-Grok30m.md");
  writeFileSync(
    logPath,
    prependGrok30mChangelog(readFileSync(logPath, "utf8"), grokVersion, communityVersion),
  );
  writeManifest(grokVersion, applyGrok30mManifest);
}

function applySync(decision) {
  if (decision.action !== "sync") {
    console.log(`Already on community ${decision.base}.`);
    return;
  }
  const mods = loadApplyModules();
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "grok30m") {
    console.error(`Switch to branch grok30m first (currently ${branch}).`);
    process.exit(1);
  }
  ensureUpstream();
  git(["fetch", "upstream", `+refs/tags/${decision.communityTag}:refs/tags/${decision.communityTag}`]);
  try {
    git(["merge", "--no-edit", decision.communityTag]);
  } catch {
    const files = conflictedFiles();
    const auto = new Set(["package.json", "package-lock.json"]);
    const leftover = files.filter((f) => !auto.has(f));
    if (leftover.length) {
      try { git(["merge", "--abort"]); } catch { /* still merging */ }
      console.error(`Merge conflicts (not auto-resolved):\n${leftover.join("\n")}`);
      process.exit(2);
    }
    if (files.includes("package.json")) {
      git(["checkout", "--theirs", "package.json"]);
      git(["add", "package.json"]);
    }
    if (files.includes("package-lock.json")) {
      git(["checkout", "--theirs", "package-lock.json"]);
      git(["add", "package-lock.json"]);
    }
    git(["commit", "--no-edit"]);
  }
  bumpSources(decision.communityVersion, decision.grokVersion, mods);
  execFileSync("npm", ["version", decision.grokVersion, "--no-git-tag-version", "--allow-same-version"], {
    cwd: root,
    stdio: "inherit",
  });
  writeManifest(decision.grokVersion, mods.applyGrok30mManifest);
  console.log(`Merged ${decision.communityTag}; Grok30m → ${decision.grokVersion}.`);
}

if (!planOnly && !apply) {
  console.error("Usage: node scripts/sync-community.mjs --plan|--apply [--tag vX.Y.Z]");
  process.exit(1);
}
const decision = plan(tagArg);
if (planOnly) {
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
  process.exit(0);
}
applySync(decision);
