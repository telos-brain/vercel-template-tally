#!/usr/bin/env node
/**
 * Local install for this template.
 *
 * Runs on `npm install` (npm prepare lifecycle) and `npm run prepare`.
 * Skip with CI=1 or TEL_SKIP_PREPARE=1.
 * TEL_COMPOSE=1 (Compose stack-profile init): skip global Brain CLI install
 * and use node_modules/@telos.ready/brain.
 *
 * Prints README prerequisites, then starts Supabase and Brain, writes env
 * keys, and runs `npm run db:push`. After this finishes, fill
 * ANTHROPIC_API_KEY, VOYAGE_API_KEY, and any remaining MY_APP_* values in
 * brain/.env.local, then `brain deploy --env local --instance local-brain`
 * (Compose init: `docker compose --profile stack run --rm init ./scripts/compose-deploy.sh`).
 * Optional: OPENROUTER_API_KEY, AZURE_OPENAI_*, LOCAL_LLM_1_BASE_URL,
 * DEFAULT_LLM_MODEL (BRA210).
 * BRAIN_API_KEY is copied from `brain start` (status box and brain.lock
 * local.apiKey) into .env and brain/.env.local. If start cannot re-print the
 * key (instance already in the Docker volume) and neither env file has a real
 * value, prepare runs `brain stop --project-id <compose> --reset` and starts
 * again so a new key can be issued.
 */

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readComposeProjectId, readLocalLockApiKey, resolveBrainCli } from "./brain-cli.mjs";
import { keepIfSet, upsertEnvFile } from "./env-file.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appEnvPath = join(root, ".env");
const appEnvExamplePath = join(root, ".env.example");
const brainDir = join(root, "brain");
const brainEnvPath = join(brainDir, ".env.local");
const brainEnvExamplePath = join(brainDir, ".env.example");

const colorEnabled = (() => {
  if (process.env.FORCE_COLOR === "0") {
    return false;
  }
  if (process.env.FORCE_COLOR) {
    return true;
  }
  if (process.env.NO_COLOR || process.env.TERM === "dumb") {
    return false;
  }
  return Boolean(process.stdout.isTTY);
})();

const s = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  magenta: "\x1b[35m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
};

let stepIndex = 0;

main().catch((error) => {
  fail(`prepare failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});

async function main() {
  const skipReason = getSkipReason();
  if (skipReason) {
    warn(`Skipping local stack prepare (${skipReason}).`);
    return;
  }

  printBanner();
  printPrerequisites();

  requireOnPath("supabase", "Install the Supabase CLI: brew install supabase/tap/supabase");
  requireDocker();

  step("Starting Supabase");
  // From Compose init, health checks hit 127.0.0.1 inside the container.
  // compose-init.sh proxies those ports to the host; --ignore-health-check
  // avoids a race before the published port is reachable.
  run("supabase", isComposeInit() ? ["start", "--ignore-health-check"] : ["start"], {
    cwd: root,
  });

  if (isComposeInit()) {
    step("Waiting for Postgres");
    await waitForPostgres();
  }

  step("Writing Supabase keys into .env");
  ensureCopied(appEnvExamplePath, appEnvPath);
  upsertEnvFile(appEnvPath, readSupabaseEnv());

  if (shouldInstallAppDeps()) {
    step("Installing npm dependencies");
    run("npm", ["install", "--ignore-scripts"], { cwd: root });
  } else {
    note("npm install already in progress — skipping nested install");
  }

  if (isComposeInit()) {
    step("Using package Brain CLI (TEL_COMPOSE)");
    if (!resolveBrainCli(root)) {
      throw new Error(
        "Brain CLI package not found in node_modules. Recreate the volume and rebuild: `docker compose --profile stack down -v && docker compose build`.",
      );
    }
    note("Skipping global `npm install -g @telos.ready/brain` — using node_modules.");
  } else {
    step("Installing @telos.ready/brain globally");
    run("npm", ["install", "-g", pinnedBrainCliPackage()]);
    requireOnPath(
      "brain",
      "Global Brain CLI was installed but is not on PATH. Open a new terminal and re-run npm run prepare.",
    );
  }

  step("Generating shared tool API key");
  const toolApiKey = resolveToolApiKey();
  upsertEnvFile(appEnvPath, {
    TOOL_API_KEY: toolApiKey,
    BRAIN_URL: keepIfSet(readEnvValue(appEnvPath, "BRAIN_URL")) ?? "http://127.0.0.1:60061",
  });

  step("Starting Brain");
  let startOutput = "";
  try {
    startOutput = await runBrainAndCapture(["start"], { cwd: brainDir });
  } catch (error) {
    const captured = commandOutput(error);
    if (isComposeInit() && isExpectedBrainAlreadyUp(captured) && (await isBrainReachable())) {
      warn("brain start reported the instance already exists and the API is reachable — continuing.");
      startOutput = captured;
    } else {
      throw error;
    }
  }

  // Let `brain start` create `.env.local` when it is missing so it can seed
  // the well-known TELOS_* local keys. Only fall back to the example if the
  // file still is not there, then write the shared tool handshake and the
  // execution API key announced at start (status box + brain.lock local.apiKey).
  ensureBrainEnvFile();

  let { announcedBrainApiKey, existingAppBrainApiKey, existingBrainEnvApiKey, brainApiKey } =
    resolveBrainApiKeys(startOutput);

  // Fresh checkout with a leftover Docker volume: createBrain 409s, lock gets
  // `(already created — …)`, and the key cannot be retrieved. Reset only when
  // no real key exists in lock, stdout, or either env file.
  if (!brainApiKey) {
    startOutput = await resetLocalBrainVolumeAndRestart();
    ensureBrainEnvFile();
    ({ announcedBrainApiKey, existingAppBrainApiKey, existingBrainEnvApiKey, brainApiKey } =
      resolveBrainApiKeys(startOutput));
  }

  upsertEnvFile(brainEnvPath, {
    MY_APP_API_KEY: toolApiKey,
    MY_APP_API_URL:
      keepIfSet(readEnvValue(brainEnvPath, "MY_APP_API_URL")) ??
      "http://host.docker.internal:3000",
    ...collectOptionalLlmEnv(),
    ...(shouldWriteBrainApiKey(existingBrainEnvApiKey, announcedBrainApiKey)
      ? { BRAIN_API_KEY: brainApiKey }
      : {}),
  });

  if (brainApiKey && shouldWriteBrainApiKey(existingAppBrainApiKey, announcedBrainApiKey)) {
    upsertEnvFile(appEnvPath, { BRAIN_API_KEY: brainApiKey });
  }

  if (brainApiKey) {
    ok("BRAIN_API_KEY is set in .env and brain/.env.local");
  } else {
    warn(
      "BRAIN_API_KEY was not announced. The execution key is shown only once at create. Reset the local volume and start again: `brain stop --project-id <compose-from-brain-status> --reset`, then `npm run prepare`.",
    );
  }

  step("Pushing database schema");
  run("npm", ["run", "db:push"], { cwd: root });

  printDone(brainApiKey);
}

function printBanner() {
  printBox(`${s.bold}${s.brightMagenta}`, [
    { text: "TELOS", style: `${s.bold}${s.brightMagenta}` },
    { text: "Preparing local Supabase + Brain", style: `${s.bold}${s.brightCyan}` },
  ]);
}

function printPrerequisites() {
  heading("Prerequisites", "see README.md");
  bullet("Node.js 25+ (see .nvmrc)", `this shell: ${process.version}`);
  bullet("Docker Desktop", "or Engine + Compose on Linux, or equivalent like OrbStack");
  bullet("Supabase CLI", "brew install supabase/tap/supabase");
  hint("https://supabase.com/docs/guides/local-development/cli/getting-started");
  bullet("A Clerk account", "optional locally; required for stage/prod");
  bullet("An Anthropic API key", "workflows pin Anthropic unless DEFAULT_LLM_MODEL is set");
  bullet("A Voyage API key", "optional at deploy; embeddings skipped if unset");
  hint("Optional: OpenRouter / OpenAI / xAI / Azure keys, or LOCAL_LLM_1_BASE_URL for Ollama (BRA106 §8).");
  hint("Add Anthropic and Voyage keys in brain/.env.local before the 'brain deploy' step.");
  console.log("");
}

function printDone(brainApiKey) {
  printBox(`${s.bold}${s.brightGreen}`, [
    { text: "Local stack is up. Schema is applied.", style: `${s.bold}${s.brightGreen}` },
  ]);

  heading("Still required in brain/.env.local");
  note("This script does not set these:");
  bullet(paint(`${s.bold}${s.brightMagenta}`, "ANTHROPIC_API_KEY"));
  bullet(paint(`${s.bold}${s.brightMagenta}`, "VOYAGE_API_KEY"));
  bullet("optional OPENROUTER_API_KEY / AZURE_OPENAI_* / DEFAULT_LLM_MODEL / LOCAL_LLM_1_BASE_URL");
  bullet("any other MY_APP_* values you need");
  hint("MY_APP_API_KEY was generated; MY_APP_API_URL defaults to http://host.docker.internal:3000");

  heading("Last step");
  note("Add those keys, then run:");
  if (isComposeInit()) {
    printCommand("docker", ["compose", "--profile", "stack", "run", "--rm", "init", "./scripts/compose-deploy.sh"], {
      cwd: root,
    });
    note("That wrapper proxies 127.0.0.1 to the host, then deploys from this repo (not /app).");
    note("The app container starts after this init job exits.");
  } else {
    printCommand("brain", ["deploy", "--env", "local", "--instance", "local-brain"], { cwd: brainDir });
    note("Then start the app:");
    printCommand("npm", ["run", "dev"]);
  }
  const brainUrl =
    keepIfSet(readEnvValue(appEnvPath, "BRAIN_URL")) ?? "http://127.0.0.1:60061";
  hint("App:   http://localhost:3000");
  hint(`Brain: ${brainUrl}  (admin UI, no sign-in)`);

  heading("Try it");
  note("Open Chat and add transactions — paste samples/transactions.csv");

  heading("Hosted (optional)");
  note("To deploy on Vercel and Telos Hosted (https://go.telosbrain.com):");
  hint("see docs/hosted-deploy.md");

  console.log("");
  ok("App .env TOOL_API_KEY and brain/.env.local MY_APP_API_KEY now match.");
  if (brainApiKey) {
    ok("App .env BRAIN_API_KEY and brain/.env.local BRAIN_API_KEY now match.");
  }
  console.log("");
}

function isComposeInit() {
  return truthy(process.env.TEL_COMPOSE);
}

async function isBrainReachable() {
  try {
    const response = await fetch("http://127.0.0.1:60061/api/health", {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Only ignore a failed `brain start` when the CLI said the instance is already
 * there (409 / already created). A reachable /api/health alone is not enough.
 *
 * @param {string} text
 */
function isExpectedBrainAlreadyUp(text) {
  const normalized = String(text).replace(/\u001b\[[0-9;]*m/g, "");
  return (
    /\b409\b/.test(normalized) ||
    /already created/i.test(normalized) ||
    /already exists/i.test(normalized) ||
    /already running/i.test(normalized)
  );
}

/**
 * @param {unknown} error
 */
function commandOutput(error) {
  if (error && typeof error === "object" && "output" in error && typeof error.output === "string") {
    return error.output;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Compose init uses `supabase start --ignore-health-check` so CLI probes can
 * pass through socat before the published port is up. Wait for Postgres
 * before `supabase status` / `db:push`.
 */
async function waitForPostgres() {
  const timeoutMs = 120_000;
  const intervalMs = 2_000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const status = tryReadSupabaseStatus();
    const dbUrl = typeof status?.DB_URL === "string" ? status.DB_URL : "";
    const { host, port } = postgresHostPort(dbUrl);
    if (await canConnect(host, port)) {
      ok(`Postgres is accepting connections at ${host}:${port}`);
      return;
    }
    await sleep(intervalMs);
  }

  throw new Error(
    "Postgres did not become reachable after supabase start --ignore-health-check. Check Docker and port 54322.",
  );
}

/**
 * @returns {Record<string, unknown> | undefined}
 */
function tryReadSupabaseStatus() {
  try {
    const raw = execFileSync("supabase", ["status", "-o", "json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return parseJsonObject(raw);
  } catch {
    return undefined;
  }
}

/**
 * @param {string} dbUrl
 * @returns {{ host: string, port: number }}
 */
function postgresHostPort(dbUrl) {
  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      const port = Number(parsed.port);
      if (parsed.hostname && Number.isFinite(port) && port > 0) {
        return { host: parsed.hostname, port };
      }
    } catch {
      // fall through to the template default
    }
  }
  return { host: "127.0.0.1", port: 54322 };
}

/**
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs]
 */
function canConnect(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(timeoutMs);
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getSkipReason() {
  if (truthy(process.env.CI) || truthy(process.env.TEL_SKIP_PREPARE)) {
    return process.env.TEL_SKIP_PREPARE ? "TEL_SKIP_PREPARE" : "CI";
  }

  const command = process.env.npm_command;
  if (command === "ci" || command === "pack" || command === "publish" || command === "rebuild") {
    return `npm ${command}`;
  }

  return null;
}

function shouldInstallAppDeps() {
  return process.env.npm_command !== "install";
}

function readSupabaseEnv() {
  const raw = execFileSync("supabase", ["status", "-o", "json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const status = parseJsonObject(raw);
  const required = {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY,
    POSTGRES_URL: status.DB_URL,
  };

  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      throw new Error(`supabase status did not include a value for ${key}`);
    }
  }

  return required;
}

function resolveToolApiKey() {
  const existing = keepIfSet(readEnvValue(appEnvPath, "TOOL_API_KEY"));
  if (existing) {
    note("Reusing existing TOOL_API_KEY");
    return existing;
  }

  return generateApiKey();
}

function ensureBrainEnvFile() {
  if (!existsSync(brainEnvPath)) {
    ensureCopied(brainEnvExamplePath, brainEnvPath);
  }
}

/**
 * Optional LLM credentials from the current shell. Blank values are skipped
 * so prepare does not wipe a line already in brain/.env.local.
 *
 * @returns {Record<string, string>}
 */
function collectOptionalLlmEnv() {
  /** @type {Record<string, string>} */
  const updates = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      key === "OPENAI_API_KEY" ||
      key === "XAI_API_KEY" ||
      key === "OPENROUTER_API_KEY" ||
      key === "AZURE_OPENAI_API_KEY" ||
      key === "AZURE_OPENAI_ENDPOINT" ||
      key === "AZURE_OPENAI_API_VERSION" ||
      key === "DEFAULT_LLM_MODEL" ||
      /^LOCAL_LLM_\d+_(BASE_URL|API_KEY)$/.test(key)
    ) {
      const kept = keepIfSet(value);
      if (kept) {
        updates[key] = kept;
      }
    }
  }
  return updates;
}

function resolveBrainApiKeys(startOutput) {
  const announcedBrainApiKey =
    keepIfSet(readLocalLockApiKey(brainDir)) ?? keepIfSet(parseAnnouncedBrainApiKey(startOutput));
  const existingAppBrainApiKey = keepIfSet(readEnvValue(appEnvPath, "BRAIN_API_KEY"));
  const existingBrainEnvApiKey = keepIfSet(readEnvValue(brainEnvPath, "BRAIN_API_KEY"));
  return {
    announcedBrainApiKey,
    existingAppBrainApiKey,
    existingBrainEnvApiKey,
    brainApiKey: announcedBrainApiKey ?? existingBrainEnvApiKey ?? existingAppBrainApiKey,
  };
}

async function resetLocalBrainVolumeAndRestart() {
  const composeProject = readComposeProjectId(brainDir);
  if (!composeProject) {
    warn("Could not determine Compose project id; skipping Brain volume reset.");
    return "";
  }

  warn("No BRAIN_API_KEY found — resetting local Brain volume and restarting...");
  try {
    runBrain(["stop", "--project-id", composeProject, "--reset"], { cwd: brainDir });
  } catch (error) {
    warn(
      `brain stop --reset failed (${error instanceof Error ? error.message : error}). Continuing without a new key.`,
    );
    return "";
  }

  return runBrainAndCapture(["start"], { cwd: brainDir });
}

function generateApiKey() {
  try {
    return execFileSync("openssl", ["rand", "-hex", "32"], { encoding: "utf8" }).trim();
  } catch {
    return randomBytes(32).toString("hex");
  }
}

function pinnedBrainCliPackage() {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const version = pkg.devDependencies?.["@telos.ready/brain"];
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("package.json is missing devDependency @telos.ready/brain");
  }
  return `@telos.ready/brain@${version.replace(/^[~^]/, "")}`;
}

function shouldWriteBrainApiKey(existing, announced) {
  return Boolean(announced || !existing);
}

function parseAnnouncedBrainApiKey(output) {
  const text = String(output).replace(/\u001b\[[0-9;]*m/g, "");
  const boxMatch = text.match(/Brain API Key\s*[│|]\s*(\S+)/i);
  if (boxMatch?.[1]) {
    return boxMatch[1].replace(/[│|]+$/g, "").trim();
  }

  const onceMatch = text.match(/Save this API key now[^\n]*\n\s+(\S+)/i);
  return onceMatch?.[1]?.trim();
}

function readEnvValue(filePath, key) {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const match = readFileSync(filePath, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) {
    return undefined;
  }

  return stripQuotes(match[1].replace(/\r$/, "").trim());
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function ensureCopied(from, to) {
  if (!existsSync(to)) {
    if (!existsSync(from)) {
      throw new Error(`Missing ${from}`);
    }
    copyFileSync(from, to);
  }
}

function parseJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("supabase status did not return JSON");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function requireOnPath(binary, hint) {
  const result = spawnSync(binary, ["--version"], { stdio: "ignore" });
  if (result.error || result.status !== 0) {
    throw new Error(`${binary} is not available. ${hint}`);
  }
}

function requireDocker() {
  requireOnPath("docker", "Open Docker Desktop (or install Docker Engine).");
  const info = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (info.error || info.status !== 0) {
    throw new Error("Docker is installed but the daemon is not running. Open Docker Desktop and retry.");
  }
}

function requireBrainCli() {
  const brain = resolveBrainCli(root);
  if (!brain) {
    throw new Error("Brain CLI not found. Run npm install, then retry.");
  }
  return brain;
}

function runBrain(args, options = {}) {
  const brain = requireBrainCli();
  run(brain.command, [...brain.extraArgs, ...args], { ...options, display: brain.display });
}

function runBrainAndCapture(args, options = {}) {
  const brain = requireBrainCli();
  return runAndCapture(brain.command, [...brain.extraArgs, ...args], { ...options, display: brain.display });
}

function run(command, args, options = {}) {
  printCommand(command, args, options);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd ?? root,
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  }
}

function runAndCapture(command, args, options = {}) {
  printCommand(command, args, options);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: process.env,
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
      process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        /** @type {Error & { output: string }} */
        const error = new Error(`${command} ${args.join(" ")} exited ${code}`);
        error.output = output;
        reject(error);
        return;
      }
      resolve(output);
    });
  });
}

function printBox(borderStyle, lines) {
  const width = 56;
  const top = `┏${"━".repeat(width)}┓`;
  const bottom = `┗${"━".repeat(width)}┛`;
  const pad = (text) => `┃  ${text}${" ".repeat(Math.max(0, width - 2 - text.length))}┃`;

  console.log("");
  console.log(paint(borderStyle, top));
  for (const line of lines) {
    console.log(paint(line.style, pad(line.text)));
  }
  console.log(paint(borderStyle, bottom));
}

function paint(style, text) {
  if (!colorEnabled) {
    return String(text);
  }
  return `${style}${text}\x1b[0m`;
}

function heading(text, hintText) {
  const suffix = hintText ? ` ${paint(s.dim, `(${hintText})`)}` : "";
  console.log("");
  console.log(paint(`${s.bold}${s.brightCyan}`, `▸ ${text}`) + suffix);
}

function step(label) {
  stepIndex += 1;
  const n = paint(`${s.bold}${s.brightMagenta}`, String(stepIndex).padStart(2, "0"));
  console.log("");
  console.log(`${n}  ${paint(`${s.bold}${s.brightCyan}`, label)}`);
}

function printCommand(command, args = [], options = {}) {
  const shownCommand = options.display ?? command;
  const shownArgs = options.display && command === process.execPath ? args.slice(1) : args;
  const rendered = `$ ${[shownCommand, ...shownArgs].join(" ")}`;
  const cwd = options.cwd ?? root;
  const rel = relative(root, cwd);
  const location = rel && rel !== "." ? paint(s.dim, `  (in ${rel}/)`) : "";
  console.log(`  ${paint(`${s.bold}${s.brightYellow}`, rendered)}${location}`);
}

function bullet(text, detail) {
  const mark = paint(`${s.bold}${s.magenta}`, "•");
  const extra = detail ? paint(s.dim, ` — ${detail}`) : "";
  console.log(`  ${mark} ${text}${extra}`);
}

function hint(text) {
  console.log(`    ${paint(s.dim, text)}`);
}

function note(text) {
  console.log(`  ${paint(s.dim, text)}`);
}

function ok(text) {
  console.log(`  ${paint(`${s.bold}${s.brightGreen}`, "✓")} ${text}`);
}

function warn(text) {
  console.log(`  ${paint(`${s.bold}${s.brightYellow}`, "!")} ${text}`);
}

function fail(text) {
  console.error(`\n  ${paint(`${s.bold}${s.brightRed}`, "✖")} ${text}`);
}

function truthy(value) {
  return value === "1" || value === "true" || value === "yes";
}
