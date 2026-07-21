"use strict";

const {
  readTokenRecord,
  writeTokenRecord,
} = require("./token-store");
const {
  DEFAULT_REFRESH_WINDOW_MS,
  tokenExpiresSoon,
  hasUsableAccessToken,
  recordChanged,
  reloadFreshTokenAfterRefreshRace: reloadFreshTokenAfterRefreshRaceBase,
} = require("./_shared/token-refresh");
const { postFormForJson } = require("./_shared/oauth-http");

const TOKEN_URI = "https://oauth2.googleapis.com/token";

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
const TOKEN_RECORD_VERSION = 1;

function parseGrantedScopes(scopeText) {
  return [...new Set(String(scopeText || "").split(/\s+/).filter(Boolean))];
}

function analyzeGrantedScopes(scopeText) {
  const grantedScopes = parseGrantedScopes(scopeText);
  const granted = new Set(grantedScopes);
  const allowed = new Set(READONLY_SCOPES);
  return {
    missing: READONLY_SCOPES.filter((scope) => !granted.has(scope)),
    unexpected: grantedScopes.filter((scope) => !allowed.has(scope)),
  };
}

function missingRequiredScopes(scopeText) {
  return analyzeGrantedScopes(scopeText).missing;
}

function unexpectedGrantedScopes(scopeText) {
  return analyzeGrantedScopes(scopeText).unexpected;
}

function assertSupportedTokenRecordVersion(record) {
  const version = record && record.version;
  if (version === TOKEN_RECORD_VERSION) return;
  throw new Error(
    `保存された Google Drive token record の version が未対応です。対応 version: ${TOKEN_RECORD_VERSION}。google-drive-auth で再ログインしてください。`
  );
}

function assertRequiredScopes(record) {
  const scopeText = record && record.scope;
  const { missing, unexpected } = analyzeGrantedScopes(scopeText);
  if (!missing.length && !unexpected.length) return;
  const lines = [
    "保存された Google Drive token の OAuth scope が許可された読み取り専用 scope と一致しません。",
    "Drive のファイル・Activity・Labels をすべて読み取り専用で参照するには google-drive-auth で再ログインしてください。",
  ];
  if (missing.length) {
    lines.push("不足 scope:", ...missing.map((scope) => `- ${scope}`));
  }
  if (unexpected.length) {
    lines.push("許可されていない scope:", ...unexpected.map((scope) => `- ${scope}`));
  }
  throw new Error(lines.join("\n"));
}

function isRefreshReauthError(err) {
  return Boolean(err && err.googleError === "invalid_grant");
}

function buildRefreshReauthError(err) {
  const googleError = err && err.googleError ? err.googleError : "unknown_error";
  const reauthError = new Error(
    [
      `Google Drive refresh token が期限切れまたは無効です: ${googleError}。google-drive-auth で再ログインしてください。`,
      "(OAuth 同意画面がテストステータスの場合、refresh token は 7 日で失効します)",
    ].join("\n")
  );
  reauthError.googleError = googleError;
  if (err && err.status) reauthError.status = err.status;
  return reauthError;
}

function buildRefreshBody(record) {
  if (!record || !record.client_id) {
    throw new Error("Google Drive token record に client_id がありません。google-drive-auth で再ログインしてください。");
  }
  assertSupportedTokenRecordVersion(record);
  if (!record.refresh_token) {
    throw new Error("Google Drive refresh token が見つかりません。google-drive-auth で再ログインしてください。");
  }

  const body = new URLSearchParams({
    client_id: record.client_id,
    grant_type: "refresh_token",
    refresh_token: record.refresh_token,
  });
  // client_secret は login 時の対話入力で Token Record にのみ保存される。record にある場合だけ送る。
  if (record.client_secret) {
    body.set("client_secret", record.client_secret);
  }
  return body;
}

function buildRefreshedTokenRecord(record, data, now = Date.now()) {
  if (!data.access_token) {
    throw new Error("Google refresh response に access_token が含まれていません。");
  }

  return {
    ...record,
    scope: data.scope || record.scope || "",
    access_token: data.access_token,
    // Google は refresh で refresh_token を返さないのが正常。既存値を維持する
    refresh_token: data.refresh_token || record.refresh_token,
    expires_at: data.expires_in ? now + data.expires_in * 1000 : 0,
    token_type: data.token_type || record.token_type || "Bearer",
  };
}

async function refreshTokenRecord(record, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const writeRecord = options.writeTokenRecord || writeTokenRecord;
  const now = options.now ?? Date.now();
  const body = buildRefreshBody(record);

  const { response, data } = await postFormForJson(TOKEN_URI, body, fetchImpl);
  if (!response.ok) {
    const googleError = data.error || "unknown_error";
    const err = new Error(`Google Drive token refresh に失敗しました: ${googleError}`);
    err.googleError = googleError;
    err.status = response.status;
    throw err;
  }

  const refreshed = buildRefreshedTokenRecord(record, data, now);
  assertRequiredScopes(refreshed);
  await writeRecord(refreshed);
  return refreshed;
}

async function reloadFreshTokenAfterRefreshRace(previousRecord, options = {}) {
  const readRecord = options.readTokenRecord || readTokenRecord;
  return reloadFreshTokenAfterRefreshRaceBase(previousRecord, {
    ...options,
    readTokenRecord: readRecord,
  });
}

async function getGoogleDriveAccessToken(options = {}) {
  const readRecord = options.readTokenRecord || readTokenRecord;
  const now = options.now ?? Date.now();
  const refreshWindowMs = options.refreshWindowMs ?? DEFAULT_REFRESH_WINDOW_MS;
  const record = await readRecord();
  if (!record || !record.access_token) return "";
  assertSupportedTokenRecordVersion(record);
  if (!record.expires_at && !record.refresh_token) {
    throw new Error("Google Drive token record に有効期限と refresh token がありません。google-drive-auth で再ログインしてください。");
  }
  if (!tokenExpiresSoon(record, now, refreshWindowMs)) {
    assertRequiredScopes(record);
    return record.access_token;
  }

  try {
    const refreshed = await refreshTokenRecord(record, options);
    return refreshed.access_token;
  } catch (err) {
    if (isRefreshReauthError(err)) {
      const reloadedToken = await reloadFreshTokenAfterRefreshRace(record, options);
      if (reloadedToken) return reloadedToken;
      throw buildRefreshReauthError(err);
    }
    throw err;
  }
}

module.exports = {
  TOKEN_URI,
  TOKEN_RECORD_VERSION,
  DEFAULT_REFRESH_WINDOW_MS,
  DRIVE_READONLY_SCOPE,
  DRIVE_ACTIVITY_READONLY_SCOPE,
  DRIVE_LABELS_READONLY_SCOPE,
  READONLY_SCOPES,
  missingRequiredScopes,
  unexpectedGrantedScopes,
  assertSupportedTokenRecordVersion,
  assertRequiredScopes,
  tokenExpiresSoon,
  hasUsableAccessToken,
  isRefreshReauthError,
  buildRefreshReauthError,
  buildRefreshBody,
  buildRefreshedTokenRecord,
  refreshTokenRecord,
  reloadFreshTokenAfterRefreshRace,
  getGoogleDriveAccessToken,
};
