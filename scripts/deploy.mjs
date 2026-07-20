#!/usr/bin/env node
/**
 * One-command deploy: git add → commit → push → Firebase Firestore rules/indexes.
 *
 * Usage:
 *   npm run deploy -- "fix task filters"
 *   npm run deploy -- --firebase-only
 *   npm run deploy -- --git-only "update UI"
 */

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

const flags = {
  firebaseOnly: args.includes("--firebase-only"),
  gitOnly: args.includes("--git-only"),
  help: args.includes("--help") || args.includes("-h"),
};

const messageParts = args.filter(
  (a) => !a.startsWith("--") && a !== "-m",
);
const messageFlagIndex = args.indexOf("-m");
if (messageFlagIndex !== -1 && args[messageFlagIndex + 1]) {
  messageParts.push(args[messageFlagIndex + 1]);
}

const commitMessage =
  messageParts.join(" ").trim() ||
  `deploy: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

function log(type, text) {
  const styles = {
    info: "\x1b[36m",
    ok: "\x1b[32m",
    warn: "\x1b[33m",
    err: "\x1b[31m",
    step: "\x1b[35m",
    reset: "\x1b[0m",
  };
  const prefix = {
    info: "ℹ",
    ok: "✓",
    warn: "⚠",
    err: "✗",
    step: "▶",
  };
  console.log(`${styles[type]}${prefix[type]} ${text}${styles.reset}`);
}

function run(label, command, commandArgs, { optional = false, input } = {}) {
  log("step", label);

  const result = spawnSync(command, commandArgs, {
    stdio: input != null ? ["pipe", "inherit", "inherit"] : "inherit",
    input,
    shell: false,
  });

  if (result.status !== 0) {
    if (optional) {
      log("warn", `${label} — skipped (nothing to do)`);
      return false;
    }
    log("err", `${label} — failed (exit ${result.status ?? 1})`);
    process.exit(result.status || 1);
  }

  log("ok", `${label} — success`);
  return true;
}

function runCommit(label, message) {
  log("step", label);

  const result = spawnSync("git", ["commit", "-F", "-"], {
    input: message,
    stdio: ["pipe", "inherit", "inherit"],
    shell: false,
  });

  if (result.status !== 0) {
    log("err", `${label} — failed (exit ${result.status ?? 1})`);
    process.exit(result.status || 1);
  }

  log("ok", `${label} — success`);
  return true;
}

function runFirebaseDeploy(label) {
  log("step", label);

  const deployArgs = "deploy --only firestore:rules,firestore:indexes";
  const result =
    process.platform === "win32"
      ? spawnSync(`firebase ${deployArgs}`, { stdio: "inherit", shell: true })
      : spawnSync("firebase", deployArgs.split(" "), { stdio: "inherit", shell: false });

  if (result.error) {
    log("err", `${label} — ${result.error.message}`);
    log("warn", "Install Firebase CLI: npm install -g firebase-tools");
    process.exit(1);
  }

  if (result.status !== 0) {
    log("err", `${label} — failed (exit ${result.status ?? 1})`);
    process.exit(result.status || 1);
  }

  log("ok", `${label} — success`);
  return true;
}

function capture(command, commandArgs) {
  return spawnSync(command, commandArgs, {
    encoding: "utf8",
    shell: false,
  });
}

function hasWorkingTreeChanges() {
  const result = capture("git", ["status", "--porcelain"]);
  if (result.status !== 0) {
    log("err", "Could not read git status. Is this a git repository?");
    process.exit(1);
  }
  return Boolean(result.stdout.trim());
}

function currentBranch() {
  const result = capture("git", ["branch", "--show-current"]);
  if (result.status !== 0 || !result.stdout.trim()) {
    log("err", "Could not detect current git branch.");
    process.exit(1);
  }
  return result.stdout.trim();
}

function printHelp() {
  console.log(`
District 7 — deploy script

Runs, in order:
  1. git add -A
  2. git commit (skipped if no changes)
  3. git push origin <current-branch>  (Vercel auto-deploys from GitHub push)
  4. firebase deploy --only firestore:rules,firestore:indexes

Usage:
  npm run deploy -- "your commit message"
  npm run deploy -- -m "your commit message"
  npm run deploy                              # auto message: deploy: YYYY-MM-DD HH:mm

Flags:
  --firebase-only   Deploy Firestore rules/indexes only (no git)
  --git-only        Commit and push only (no Firebase)
  --help, -h        Show this help
`);
}

if (flags.help) {
  printHelp();
  process.exit(0);
}

if (flags.firebaseOnly && flags.gitOnly) {
  log("err", "Use either --firebase-only or --git-only, not both.");
  process.exit(1);
}

console.log("");
log("info", "District 7 deploy starting…");
console.log("");

const branch = currentBranch();
log("info", `Branch: ${branch}`);
if (!flags.firebaseOnly) {
  log("info", `Commit message: "${commitMessage}"`);
}
console.log("");

const totalSteps = flags.firebaseOnly ? 1 : flags.gitOnly ? 3 : 4;
let step = 0;

if (!flags.firebaseOnly) {
  step += 1;
  console.log(`\x1b[90m── Step ${step}/${totalSteps} ──\x1b[0m`);
  run("Stage all changes", "git", ["add", "-A"]);

  step += 1;
  console.log(`\n\x1b[90m── Step ${step}/${totalSteps} ──\x1b[0m`);
  if (hasWorkingTreeChanges()) {
    runCommit("Commit changes", commitMessage);
  } else {
    log("warn", "Commit — skipped (no changes to commit)");
  }

  step += 1;
  console.log(`\n\x1b[90m── Step ${step}/${totalSteps} ──\x1b[0m`);
  run(`Push to origin/${branch}`, "git", ["push", "-u", "origin", branch]);
  log("info", "GitHub push complete — Vercel will build & deploy the app if connected.");
}

if (!flags.gitOnly) {
  step += 1;
  console.log(`\n\x1b[90m── Step ${step}/${totalSteps} ──\x1b[0m`);
  runFirebaseDeploy("Deploy Firestore rules & indexes");
}

console.log("");
log("ok", "Deploy finished successfully!");
console.log("");
