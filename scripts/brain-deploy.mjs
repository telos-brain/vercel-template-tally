#!/usr/bin/env node
/**
 * Deploy brain/ to Telos Hosted (go.telosbrain.com).
 *
 * Used from the Vercel build (`npm run build` when VERCEL=1) and from
 * `npm run brain:deploy`. Skip with BRAIN_DEPLOY=0.
 *
 * The CLI only uploads variables declared in brain/.env.<env>. This script
 * copies .env.example to that file so key names exist, then process env
 * (Vercel secrets) override placeholder values. BRAIN_INSTANCE is passed as
 * --instance only — it must not be written into the env file.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keepIfSet, upsertEnvFile } from "./env-file.mjs";
import { resolveBrainCli } from "./brain-cli.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const brainDir = join(root, "brain");
const exampleEnvPath = join(brainDir, ".env.example");
const composePath = join(brainDir, "brain-compose.yml");
const deployComposePath = join(brainDir, "brain-compose.deploy.yml");

const HOSTED_API_URL = "https://go.telosbrain.com";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

try {
  main();
} catch (error) {
  console.error(`\nbrain:deploy failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

function main() {
  if (isSkip()) {
    console.log("brain:deploy skipped (BRAIN_DEPLOY=0).");
    return;
  }

  const deployEnv = resolveDeployEnv();
  const orgApiKey = keepIfSet(process.env.TELOS_BRAIN_ORG_API_KEY) ?? keepIfSet(process.env.TELOS_ORG_API_KEY);
  if (!orgApiKey) {
    throwFail(
      "TELOS_BRAIN_ORG_API_KEY is required to deploy to Telos Hosted. Mint one at https://go.telosbrain.com, or set BRAIN_DEPLOY=0 to skip.",
    );
  }

  const instance = resolveInstance();
  const apiUrl = keepIfSet(process.env.TELOS_BRAIN_API_URL) ?? keepIfSet(process.env.TELOS_API_URL) ?? HOSTED_API_URL;
  const anthropicKey = keepIfSet(process.env.ANTHROPIC_API_KEY);
  const voyageKey = keepIfSet(process.env.VOYAGE_API_KEY);
  const toolApiKey = keepIfSet(process.env.MY_APP_API_KEY) ?? keepIfSet(process.env.TOOL_API_KEY);
  const brainApiKey = keepIfSet(process.env.BRAIN_API_KEY);
  const appUrl = resolveAppUrl();
  console.log(`MY_APP_API_URL=${appUrl}`);

  if (!anthropicKey) {
    throwFail("ANTHROPIC_API_KEY is required for hosted Brain workflows.");
  }
  if (!voyageKey) {
    throwFail("VOYAGE_API_KEY is required (this brain uses voyage-3-lite embeddings).");
  }
  if (!toolApiKey) {
    throwFail("TOOL_API_KEY (or MY_APP_API_KEY) is required for Brain → app tool callbacks.");
  }
  if (!existsSync(exampleEnvPath)) {
    throwFail(`Missing ${exampleEnvPath}`);
  }
  if (!existsSync(composePath)) {
    throwFail(`Missing ${composePath}`);
  }

  const brain = resolveBrainCli(root);
  if (!brain) {
    throwFail("Missing @telos.ready/brain. Run npm install, then retry.");
  }

  const envFilePath = join(brainDir, deployEnv === "prod" ? ".env.prod" : ".env.stage");
  copyFileSync(exampleEnvPath, envFilePath);
  upsertEnvFile(envFilePath, {
    TELOS_BRAIN_ORG_API_KEY: orgApiKey,
    TELOS_BRAIN_API_URL: apiUrl,
    ANTHROPIC_API_KEY: anthropicKey,
    VOYAGE_API_KEY: voyageKey,
    MY_APP_API_KEY: toolApiKey,
    MY_APP_API_URL: appUrl,
    BRAIN_API_KEY: brainApiKey ?? "",
  });

  const callbackHosts = collectCallbackHosts(appUrl);
  writeFileSync(deployComposePath, mergeCallbackDomains(readFileSync(composePath, "utf8"), callbackHosts));

  const childEnv = {
    ...process.env,
    TELOS_BRAIN_ORG_API_KEY: orgApiKey,
    TELOS_BRAIN_API_URL: apiUrl,
    ANTHROPIC_API_KEY: anthropicKey,
    VOYAGE_API_KEY: voyageKey,
    MY_APP_API_KEY: toolApiKey,
    MY_APP_API_URL: appUrl,
  };
  if (brainApiKey) {
    childEnv.BRAIN_API_KEY = brainApiKey;
  } else {
    delete childEnv.BRAIN_API_KEY;
    console.log("BRAIN_API_KEY is unset or still a placeholder — first hosted deploy will print a new execution key.");
  }

  console.log(`brain:deploy env=${deployEnv} instance=${instance} api=${apiUrl}`);
  if (callbackHosts.length > 0) {
    console.log(`allowed-callback-domains += ${callbackHosts.join(", ")}`);
  }

  run(brain.command, [...brain.extraArgs, "deploy", deployComposePath, "--env", deployEnv, "--instance", instance], {
    cwd: brainDir,
    env: childEnv,
  });
}

function isSkip() {
  const value = process.env.BRAIN_DEPLOY;
  return value === "0" || value === "false" || value === "no";
}

function resolveDeployEnv() {
  const explicit = keepIfSet(process.env.BRAIN_DEPLOY_ENV);
  if (explicit === "prod" || explicit === "stage" || explicit === "dev" || explicit === "local") {
    return explicit;
  }

  if (process.env.VERCEL_ENV === "production") {
    return "prod";
  }

  return "stage";
}

function resolveInstance() {
  const explicit = keepIfSet(process.env.BRAIN_INSTANCE);
  if (explicit) {
    return assertInstanceName(explicit);
  }

  const project = keepIfSet(process.env.VERCEL_PROJECT_NAME);
  if (!project) {
    throwFail("BRAIN_INSTANCE is required when VERCEL_PROJECT_NAME is unset (3–63 chars, lowercase letters, digits, hyphens).");
  }

  return assertInstanceName(slugInstance(`${project}-${instanceSuffix()}`));
}

function instanceSuffix() {
  if (process.env.VERCEL_ENV === "production") {
    return "prod";
  }
  if (process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development") {
    return "preview";
  }
  return resolveDeployEnv() === "prod" ? "prod" : "preview";
}

function slugInstance(value) {
  let slug = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length > 63) {
    slug = slug.slice(0, 63).replace(/-+$/g, "");
  }

  return slug;
}

function assertInstanceName(name) {
  if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$/.test(name)) {
    throwFail(
      `BRAIN_INSTANCE "${name}" is invalid. Use 3–63 chars: lowercase letters, digits, internal hyphens only.`,
    );
  }
  return name;
}

function resolveAppUrl() {
  const explicit = keepIfSet(process.env.MY_APP_API_URL);
  if (explicit && !isLocalAppUrl(explicit)) {
    return withHttps(explicit);
  }
  if (explicit) {
    console.log(
      `Ignoring MY_APP_API_URL=${explicit} — Telos Hosted cannot call Docker/loopback. Using the public Vercel/site URL.`,
    );
  }

  if (process.env.VERCEL_ENV === "production") {
    const productionHost = keepIfSet(process.env.VERCEL_PROJECT_PRODUCTION_URL);
    if (productionHost && !isLocalAppUrl(productionHost)) {
      return withHttps(productionHost);
    }
  }

  const vercelUrl = keepIfSet(process.env.VERCEL_URL);
  if (vercelUrl && !isLocalAppUrl(vercelUrl)) {
    return withHttps(vercelUrl);
  }

  const site = keepIfSet(process.env.NEXT_PUBLIC_SITE_URL);
  if (site && isPublicHttpsHost(site)) {
    return withHttps(site);
  }

  throwFail(
    "Hosted MY_APP_API_URL must be the public https:// app URL (not host.docker.internal). Set MY_APP_API_URL, or deploy on Vercel so VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL is available.",
  );
}

function isLocalAppUrl(value) {
  const host = hostnameFrom(value);
  return Boolean(host && LOCAL_HOSTS.has(host));
}

function isPublicHttpsHost(value) {
  try {
    const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`);
    if (url.protocol !== "https:") {
      return false;
    }
    return !LOCAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function collectCallbackHosts(appUrl) {
  const hosts = [];
  for (const value of [
    appUrl,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.BRAIN_CALLBACK_DOMAIN,
  ]) {
    const host = hostnameFrom(value);
    if (host && !LOCAL_HOSTS.has(host) && !hosts.includes(host)) {
      hosts.push(host);
    }
  }
  return hosts;
}

function hostnameFrom(value) {
  const trimmed = keepIfSet(value);
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function withHttps(value) {
  if (/^https:\/\//i.test(value)) {
    return value;
  }
  if (/^http:\/\//i.test(value)) {
    if (isLocalAppUrl(value)) {
      return value;
    }
    return value.replace(/^http:\/\//i, "https://");
  }
  return `https://${value}`;
}

function mergeCallbackDomains(source, extraHosts) {
  if (extraHosts.length === 0) {
    return source;
  }

  const lines = source.split("\n");
  let listStart = -1;
  let listEnd = -1;
  const existing = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (listStart === -1) {
      if (/^allowed-callback-domains:\s*$/.test(lines[i])) {
        listStart = i + 1;
      }
      continue;
    }

    const item = lines[i].match(/^\s+-\s+(\S+)\s*$/);
    if (item) {
      existing.push(item[1]);
      listEnd = i + 1;
      continue;
    }

    listEnd = i;
    break;
  }

  const merged = [...existing];
  for (const host of extraHosts) {
    if (!merged.includes(host)) {
      merged.push(host);
    }
  }

  const block = merged.map((host) => `  - ${host}`);

  if (listStart === -1) {
    const suffix = `allowed-callback-domains:\n${block.join("\n")}\n`;
    return source.endsWith("\n") ? `${source}${suffix}` : `${source}\n${suffix}`;
  }

  if (listEnd === -1) {
    listEnd = listStart;
  }

  return [...lines.slice(0, listStart), ...block, ...lines.slice(listEnd)].join("\n");
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd,
    env: options.env,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throwFail(`${command} ${args.join(" ")} exited ${result.status}`);
  }
}

function throwFail(message) {
  console.error(`\nbrain:deploy failed: ${message}`);
  process.exit(1);
}
