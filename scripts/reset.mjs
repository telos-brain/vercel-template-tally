#!/usr/bin/env node
/**
 * Tear down this repo's local Docker stack.
 *
 * Stops Brain with --reset (removes the SQL volume), this project's Supabase
 * without a backup, and this repo's optional Compose app/init. Does not
 * touch other Compose projects.
 *
 * After this, run `npm run prepare` (or `npm install`) to start clean.
 * Optional Compose app/init: `docker compose --profile stack up -d`.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readComposeProjectId, resolveBrainCli } from "./brain-cli.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const brainDir = join(root, "brain");

main();

function main() {
  console.log("Resetting local Brain + Supabase for this repo…");

  const brain = stopBrain();
  const supabase = stopSupabase();
  const compose = stopCompose();

  printSummary(brain, supabase, compose);
  console.log("Start again with: npm run prepare");
  console.log("Or: docker compose --profile stack up -d");

  if (brain.status === "failed" || supabase.status === "failed" || compose.status === "failed") {
    process.exit(1);
  }
}

/**
 * @returns {{ status: "wiped" | "already-stopped" | "skipped" | "failed", reason?: string }}
 */
function stopBrain() {
  const composeProject = readComposeProjectId(brainDir);
  if (!composeProject) {
    console.log("  Could not determine Brain Compose project id — skipping brain stop.");
    return { status: "skipped", reason: "no Compose project id" };
  }

  const brain = resolveBrainCli(root);
  if (!brain) {
    console.log("  brain CLI not found — skipping brain stop. Install with npm run prepare.");
    return { status: "skipped", reason: "brain CLI not found" };
  }

  return runOptional(brain.command, [...brain.extraArgs, "stop", "--project-id", composeProject, "--reset"], {
    cwd: brainDir,
    display: brain.display,
    successStatus: "wiped",
  });
}

/**
 * @returns {{ status: "stopped" | "already-stopped" | "skipped" | "failed", reason?: string }}
 */
function stopSupabase() {
  return runOptional("supabase", ["stop", "--no-backup"], { cwd: root, successStatus: "stopped" });
}

/**
 * Stops this repo's optional app/init Compose project (TEL1276). Does not
 * pass `-v` (named `app_node_modules` is kept). Brain SQL is a different
 * Compose project and is still torn down by `brain stop --reset`.
 *
 * @returns {{ status: "stopped" | "already-stopped" | "skipped" | "failed", reason?: string }}
 */
function stopCompose() {
  return runOptional("docker", ["compose", "--profile", "stack", "down", "--remove-orphans"], {
    cwd: root,
    successStatus: "stopped",
  });
}

/**
 * @param {{ status: string, reason?: string }} brain
 * @param {{ status: string, reason?: string }} supabase
 * @param {{ status: string, reason?: string }} compose
 */
function printSummary(brain, supabase, compose) {
  const supabaseOk = supabase.status === "stopped" || supabase.status === "already-stopped";
  const composeOk = compose.status === "stopped" || compose.status === "already-stopped" || compose.status === "skipped";

  if (brain.status === "wiped" && supabaseOk && composeOk) {
    console.log("Done. Local Brain volume is gone and this project's Supabase and Compose app are stopped.");
    return;
  }

  if ((brain.status === "already-stopped" || brain.status === "wiped") && supabaseOk && composeOk) {
    console.log("Done. Brain, this project's Supabase, and the Compose app are stopped (Brain volume was already gone).");
    return;
  }

  console.log("Reset finished with skips or errors.");
  if (brain.status === "skipped" || brain.status === "failed") {
    console.log(`  Brain: ${brain.reason ?? brain.status}`);
  }
  if (supabase.status === "skipped" || supabase.status === "failed") {
    console.log(`  Supabase: ${supabase.reason ?? supabase.status}`);
  }
  if (compose.status === "skipped" || compose.status === "failed") {
    console.log(`  Compose: ${compose.reason ?? compose.status}`);
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, display?: string, successStatus: "wiped" | "stopped" }} options
 * @returns {{ status: "wiped" | "stopped" | "already-stopped" | "skipped" | "failed", reason?: string }}
 */
function runOptional(command, args, options) {
  const label = options.display ?? command;
  const labelArgs = command === process.execPath ? args.slice(1) : args;
  console.log(`  $ ${label} ${labelArgs.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd,
    env: process.env,
  });

  if (result.error) {
    console.log(`  ${label} is not available (${result.error.message}). Skipping.`);
    return { status: "skipped", reason: result.error.message };
  }
  if (result.status === 0) {
    return { status: options.successStatus };
  }

  console.log(`  ${label} exited ${result.status} (already stopped is OK).`);
  return { status: "already-stopped" };
}
