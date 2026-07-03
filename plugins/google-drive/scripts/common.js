"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const TOKEN_ENV = "GOOGLE_DRIVE_ACCESS_TOKEN";
const TOKEN_PATH_ENV = "GOOGLE_DRIVE_TOKEN_PATH";
const CLIENT_SECRET_ENV = "GOOGLE_DRIVE_CLIENT_SECRET";
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DRIVE_ACTIVITY_READONLY_SCOPE =
  "https://www.googleapis.com/auth/drive.activity.readonly";
const DRIVE_LABELS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/drive.labels.readonly";
const READONLY_SCOPES = [
  DRIVE_READONLY_SCOPE,
  DRIVE_ACTIVITY_READONLY_SCOPE,
  DRIVE_LABELS_READONLY_SCOPE,
];
const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".config", "drive-api");
const DEFAULT_CLIENT_SECRET_PATH = path.join(DEFAULT_CONFIG_DIR, "client_secret.json");
const DEFAULT_TOKEN_PATH = path.join(DEFAULT_CONFIG_DIR, "token.json");

function readAccessTokenFromEnv() {
  const token = process.env[TOKEN_ENV];
  if (!token || !token.trim()) return null;
  return { token: token.trim(), source: TOKEN_ENV };
}

function getTokenPath() {
  return process.env[TOKEN_PATH_ENV] || DEFAULT_TOKEN_PATH;
}

function getClientSecretPath() {
  return process.env[CLIENT_SECRET_ENV] || DEFAULT_CLIENT_SECRET_PATH;
}

function readTokenFile(tokenPath = getTokenPath()) {
  if (!fs.existsSync(tokenPath)) return null;
  return JSON.parse(fs.readFileSync(tokenPath, "utf8"));
}

function writeTokenFile(token, tokenPath = getTokenPath()) {
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(tokenPath, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(tokenPath, 0o600);
}

function hasUsableAccessToken(token) {
  if (!token || !token.access_token) return false;
  const expiryDate = Number(token.expiry_date || 0);
  return !expiryDate || expiryDate > Date.now() + 60000;
}

function missingRequiredScopes(scopeText) {
  const granted = new Set(String(scopeText || "").split(/\s+/).filter(Boolean));
  return READONLY_SCOPES.filter((scope) => !granted.has(scope));
}

function assertRequiredScopes(token, tokenPath = getTokenPath()) {
  const missing = missingRequiredScopes(token && token.scope);
  if (!missing.length) return;
  throw new Error(
    [
      `${tokenPath} の OAuth scope が不足しています。`,
      "Drive のファイル・Activity・Labels をすべて読み取り専用で参照するには再ログインしてください。",
      "不足 scope:",
      ...missing.map((scope) => `- ${scope}`),
      `node plugins/google-drive/scripts/oauth-login.js --client-secret ${getClientSecretPath()}`,
    ].join("\n")
  );
}

async function refreshAccessToken(storedToken, tokenPath = getTokenPath()) {
  if (!storedToken || !storedToken.refresh_token) {
    throw new Error("refresh_token が token file にありません。再ログインしてください。");
  }
  if (!storedToken.client_id) {
    throw new Error("client_id が token file にありません。再ログインしてください。");
  }

  const body = new URLSearchParams({
    client_id: storedToken.client_id,
    refresh_token: storedToken.refresh_token,
    grant_type: "refresh_token",
  });
  if (storedToken.client_secret) {
    body.set("client_secret", storedToken.client_secret);
  }

  const response = await fetch(TOKEN_URI, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error_description || data.error || "unknown error";
    throw new Error(`access token の更新に失敗しました: ${message}`);
  }

  const nextToken = {
    ...storedToken,
    access_token: data.access_token,
    token_type: data.token_type || storedToken.token_type || "Bearer",
    scope: data.scope || storedToken.scope,
    expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : 0,
  };
  assertRequiredScopes(nextToken, tokenPath);
  writeTokenFile(nextToken, tokenPath);
  return nextToken;
}

async function getAccessToken() {
  const fromEnv = readAccessTokenFromEnv();
  if (fromEnv) return fromEnv;

  const tokenPath = getTokenPath();
  const storedToken = readTokenFile(tokenPath);
  if (hasUsableAccessToken(storedToken)) {
    assertRequiredScopes(storedToken, tokenPath);
    return { token: storedToken.access_token, source: tokenPath };
  }
  if (storedToken) {
    const refreshedToken = await refreshAccessToken(storedToken, tokenPath);
    return { token: refreshedToken.access_token, source: tokenPath };
  }

  throw new Error(
    [
      `${TOKEN_ENV} が設定されていません。`,
      `${tokenPath} も見つかりません。`,
      "Drive の読み取り専用権限でログインするには次を実行してください:",
      `node plugins/google-drive/scripts/oauth-login.js --client-secret ${getClientSecretPath()}`,
    ].join("\n")
  );
}

function buildDriveUrl(path, params = {}) {
  const url = new URL(path.replace(/^\/+/, ""), DRIVE_API_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function formatDriveApiError(status, data, fallbackText) {
  const apiError = data && data.error ? data.error : {};
  const message = apiError.message || fallbackText || "unknown error";
  const reasons = Array.isArray(apiError.errors)
    ? [...new Set(apiError.errors.map((err) => err.reason).filter(Boolean))]
    : [];

  const hints = [];
  if (status === 401) {
    hints.push("access token が失効している可能性があります。再取得してから実行してください。");
  }
  if (status === 403 && reasons.includes("insufficientPermissions")) {
    hints.push(`${READONLY_SCOPES.join(" ")} scope を含めて再認証してください。`);
  }
  if (status === 403 && /has not been used|disabled/i.test(message)) {
    hints.push("Google Cloud プロジェクトで Google Drive API を有効化してください。");
  }

  const suffix = hints.length ? `\n${hints.join("\n")}` : "";
  const reasonText = reasons.length ? ` reasons=${reasons.join(",")}` : "";
  return `Google Drive API エラー: HTTP ${status}${reasonText}: ${message}${suffix}`;
}

async function fetchDriveApi(path, params = {}, options = {}) {
  const auth = options.auth || await getAccessToken();
  const url = buildDriveUrl(path, params);
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_err) {
      data = null;
    }
  }

  if (!response.ok) {
    throw new Error(formatDriveApiError(response.status, data, text));
  }

  return { data, tokenSource: auth.source };
}

module.exports = {
  TOKEN_ENV,
  TOKEN_PATH_ENV,
  CLIENT_SECRET_ENV,
  DRIVE_READONLY_SCOPE,
  DRIVE_ACTIVITY_READONLY_SCOPE,
  DRIVE_LABELS_READONLY_SCOPE,
  READONLY_SCOPES,
  DEFAULT_CLIENT_SECRET_PATH,
  DEFAULT_TOKEN_PATH,
  getTokenPath,
  getClientSecretPath,
  readTokenFile,
  writeTokenFile,
  hasUsableAccessToken,
  missingRequiredScopes,
  assertRequiredScopes,
  refreshAccessToken,
  getAccessToken,
  buildDriveUrl,
  formatDriveApiError,
  fetchDriveApi,
};
