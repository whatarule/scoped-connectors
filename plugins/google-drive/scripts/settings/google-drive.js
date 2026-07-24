"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CONFIG_PATH_ENV = "GOOGLE_DRIVE_CONFIG_PATH";
const CLIENT_ID_ENV = "GOOGLE_DRIVE_CLIENT_ID";
const ALLOWED_DOMAINS_ENV = "GOOGLE_DRIVE_ALLOWED_DOMAINS";
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".config", "drive-api", "config.json");
const DEFAULT_ALLOWED_DOMAINS = ["compass-e.com"];
const DEFAULT_CLIENT_ID = "479244650378-pumfm4d581o9f8qrbsj0jdjuc9qsuh75.apps.googleusercontent.com";
const FOLDER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function getConfigPath(env = process.env) {
  return env[CONFIG_PATH_ENV] || DEFAULT_CONFIG_PATH;
}

function loadConfigFile(configPath, options = {}) {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    if (options.formatReadError) {
      throw new Error(options.formatReadError(configPath, err));
    }
    throw new Error(`Google Drive config を読み取れません: ${configPath}`);
  }
}

function normalizeDomains(value) {
  if (!value) return [];
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : null;
  if (!list) {
    throw new Error("allowedDomains は配列またはカンマ区切り文字列で指定してください。");
  }
  return list
    .map((domain) => String(domain).trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}

function resolveClientId(parsed, config = {}, env = process.env) {
  for (const value of [
    parsed.clientId,
    env[CLIENT_ID_ENV],
    config.clientId,
    config.client_id,
    DEFAULT_CLIENT_ID,
  ]) {
    const clientId = String(value || "").trim();
    if (clientId) return clientId;
  }
  return "";
}

function resolveAllowedDomains(config = {}, env = process.env) {
  return normalizeDomains(env[ALLOWED_DOMAINS_ENV] || config.allowedDomains || DEFAULT_ALLOWED_DOMAINS);
}

function applyLoginDefaults(parsed, config = {}, env = process.env) {
  return {
    ...parsed,
    clientId: resolveClientId(parsed, config, env),
    allowedDomains: resolveAllowedDomains(config, env),
  };
}

function parseLoginArgs(args, env = process.env, configLoader = loadConfigFile) {
  const configPath = getConfigPath(env);
  const parsed = {
    clientId: "",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--client-id") {
      if (!args[i + 1]) throw new Error("--client-id には OAuth client_id を指定してください。");
      parsed.clientId = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else {
      throw new Error(`不明なオプションです: ${arg}`);
    }
  }

  const options = { ...parsed, configPath };
  if (options.help) return applyLoginDefaults(options, {}, env);
  return applyLoginDefaults(options, configLoader(configPath), env);
}

function normalizeAllowedFolderIds(ids, configPath) {
  if (ids === undefined) {
    return [];
  }
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    throw new Error(`${configPath} の allowedFolderIds はフォルダIDの文字列配列にしてください。`);
  }
  const invalid = ids.filter((id) => !FOLDER_ID_PATTERN.test(id));
  if (invalid.length) {
    throw new Error(
      `${configPath} の allowedFolderIds に不正なIDが含まれています: ${invalid.join(", ")}`
    );
  }
  return ids;
}

function loadReadSettings(configPath = getConfigPath()) {
  const config = loadConfigFile(configPath, {
    formatReadError: (filePath, err) => `${filePath} を JSON として読み込めません: ${err.message}`,
  });
  return {
    configPath,
    allowedFolderIds: normalizeAllowedFolderIds(config.allowedFolderIds, configPath),
  };
}

module.exports = {
  CONFIG_PATH_ENV,
  CLIENT_ID_ENV,
  ALLOWED_DOMAINS_ENV,
  DEFAULT_CONFIG_PATH,
  DEFAULT_ALLOWED_DOMAINS,
  DEFAULT_CLIENT_ID,
  FOLDER_ID_PATTERN,
  getConfigPath,
  loadConfigFile,
  normalizeDomains,
  resolveClientId,
  resolveAllowedDomains,
  applyLoginDefaults,
  parseLoginArgs,
  normalizeAllowedFolderIds,
  loadReadSettings,
};
