"use strict";

const {
  USAGE: LOGIN_USAGE,
  fetchDriveAboutWithToken,
  login: oauthLogin,
  parseArgs: parseLoginArgs,
} = require("./oauth-login");
const { getGoogleDriveAccessToken } = require("./auth");
const {
  deleteTokenRecord,
  describeTokenStore,
  readTokenRecord,
} = require("./token-store");

const LOGIN_OPTIONS_USAGE = LOGIN_USAGE.replace(
  "使い方: oauth-login.js ",
  "使い方: google-drive-auth [login] "
);

const USAGE = [
  "使い方: google-drive-auth [login|status|clear] [options]",
  "",
  "引数なし、または login: Google OAuth PKCE でログインして token を OS secure store に保存します。",
  "status: 保存済み token record の有無を確認し、about.get で live 状態を確認します。token 値は表示しません。",
  "clear: OS secure store から保存済み Google Drive token record を削除します。",
  "",
  "login options:",
  LOGIN_OPTIONS_USAGE.trimEnd(),
  "",
].join("\n");

const COMMANDS = new Set(["login", "status", "clear"]);

function parseAuthArgs(args) {
  if (args.length === 0) {
    return { command: "login", rest: [] };
  }

  const [first, ...rest] = args;
  if (first === "--help" || first === "-h") {
    return { command: "help", rest: [] };
  }
  if (COMMANDS.has(first)) {
    return { command: first, rest };
  }
  if (first.startsWith("-")) {
    return { command: "login", rest: args };
  }
  throw new Error(`不明なサブコマンドです: ${first}`);
}

function formatExpiresAt(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toISOString();
}

function summarizeRecord(record, storeDescription) {
  return {
    exists: true,
    store: storeDescription,
    user: record.user_name || record.user_email || "unknown",
    email: record.user_email || "unknown",
    scope: record.scope || "unknown",
    expiresAt: formatExpiresAt(record.expires_at),
    liveCheck: "",
  };
}

function applyLiveAbout(status, about = {}) {
  const user = about.user || {};
  return {
    ...status,
    user: user.displayName || status.user,
    email: user.emailAddress || status.email,
    liveCheck: "about.get ok",
  };
}

async function getStatus(options = {}) {
  const readRecord = options.readTokenRecord || readTokenRecord;
  const describeStore = options.describeTokenStore || describeTokenStore;
  const getAccessToken = options.getGoogleDriveAccessToken || getGoogleDriveAccessToken;
  const fetchAboutWithToken = options.fetchDriveAboutWithToken || fetchDriveAboutWithToken;
  const tokenStoreOptions = options.tokenStoreOptions || {};
  const storeDescription = describeStore(tokenStoreOptions);
  const record = await readRecord(tokenStoreOptions);
  if (!record) {
    return { exists: false, store: storeDescription };
  }

  const accessToken = await getAccessToken(options.accessTokenOptions || {});
  if (!accessToken) {
    throw new Error(
      "Google Drive token record は保存されていますが access token を確認できません。google-drive-auth で再ログインしてください。"
    );
  }
  const about = await fetchAboutWithToken(accessToken);
  const latestRecord = (await readRecord(tokenStoreOptions)) || record;
  return applyLiveAbout(summarizeRecord(latestRecord, storeDescription), about);
}

function formatStatus(status) {
  if (!status.exists) {
    return `Google Drive token は保存されていません。\nstore: ${status.store}\n`;
  }
  return [
    "Google Drive token は保存されています。",
    `store: ${status.store}`,
    status.liveCheck ? `live_check: ${status.liveCheck}` : "",
    `user: ${status.user}`,
    `email: ${status.email}`,
    `scope: ${status.scope}`,
    `expires_at: ${status.expiresAt}`,
    "",
  ].join("\n");
}

async function clearToken(options = {}) {
  const deleteRecord = options.deleteTokenRecord || deleteTokenRecord;
  const describeStore = options.describeTokenStore || describeTokenStore;
  const tokenStoreOptions = options.tokenStoreOptions || {};
  const storeDescription = describeStore(tokenStoreOptions);
  const result = await deleteRecord(tokenStoreOptions);
  return {
    deleted: Boolean(result && result.deleted),
    store: storeDescription,
  };
}

function formatClearResult(result) {
  const suffix = [
    "Google 側の token revoke は行いません。",
    "無効化するには https://myaccount.google.com/permissions からアクセス権を削除してください。",
  ].join("\n");
  if (result.deleted) {
    return `Google Drive token record を OS secure store から削除しました。\nstore: ${result.store}\n${suffix}\n`;
  }
  return `Google Drive token record は保存されていませんでした。\nstore: ${result.store}\n${suffix}\n`;
}

async function runLogin(args, options = {}) {
  const parseArgs = options.parseLoginArgs || parseLoginArgs;
  const login = options.oauthLogin || oauthLogin;
  const loginUsage = options.loginUsage || LOGIN_OPTIONS_USAGE;
  const parsed = parseArgs(args);
  if (parsed.help) {
    return loginUsage;
  }

  const result = await login(parsed);
  return [
    "Google Drive token を保存しました。",
    `store: ${result.store}`,
    `user: ${result.user}`,
    `email: ${result.email}`,
    `scope: ${result.scope}`,
    "",
  ].join("\n");
}

async function runAuth(args, options = {}) {
  const parsed = parseAuthArgs(args);
  if (parsed.command === "help") {
    return USAGE;
  }
  if (parsed.command === "login") {
    return runLogin(parsed.rest, options);
  }
  if (parsed.command === "status") {
    if (parsed.rest.length > 0) {
      throw new Error("status に引数は指定できません。");
    }
    return formatStatus(await getStatus(options));
  }
  if (parsed.command === "clear") {
    if (parsed.rest.length > 0) {
      throw new Error(`${parsed.command} に引数は指定できません。`);
    }
    return formatClearResult(await clearToken(options));
  }
  throw new Error(`未対応のサブコマンドです: ${parsed.command}`);
}

async function main() {
  try {
    const output = await runAuth(process.argv.slice(2));
    process.stdout.write(output);
  } catch (err) {
    process.stderr.write(`エラー: ${err.message}\n${USAGE}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  USAGE,
  parseAuthArgs,
  formatExpiresAt,
  summarizeRecord,
  applyLiveAbout,
  getStatus,
  formatStatus,
  clearToken,
  formatClearResult,
  runLogin,
  runAuth,
};
