"use strict";

const {
  readTokenRecord,
  writeTokenRecord,
} = require("./token-store");

const TOKEN_URI = "https://slack.com/api/oauth.v2.user.access";
const DEFAULT_REFRESH_WINDOW_MS = 5 * 60 * 1000;

function tokenExpiresSoon(record, now = Date.now(), refreshWindowMs = DEFAULT_REFRESH_WINDOW_MS) {
  if (!record || !record.expires_at) return false;
  const expiresAt = Number(record.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return false;
  return expiresAt <= now + refreshWindowMs;
}

function hasUsableAccessToken(record, now = Date.now(), refreshWindowMs = DEFAULT_REFRESH_WINDOW_MS) {
  return Boolean(record && record.access_token && !tokenExpiresSoon(record, now, refreshWindowMs));
}

function isRefreshRaceError(err) {
  return Boolean(err && ["invalid_refresh_token", "token_expired"].includes(err.slackError));
}

function buildRefreshBody(record) {
  if (!record || !record.client_id) {
    throw new Error("Slack token record に client_id がありません。slack-auth で再ログインしてください。");
  }
  if (!record.refresh_token) {
    throw new Error("Slack refresh token が見つかりません。slack-auth で再ログインしてください。");
  }

  return new URLSearchParams({
    client_id: record.client_id,
    grant_type: "refresh_token",
    refresh_token: record.refresh_token,
  });
}

function buildRefreshedTokenRecord(record, data, now = Date.now()) {
  if (!data.access_token) {
    throw new Error("Slack refresh response に access_token が含まれていません。");
  }
  if (!data.refresh_token) {
    throw new Error("Slack refresh response に refresh_token が含まれていません。");
  }

  return {
    ...record,
    scope: data.scope || record.scope || "",
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_in ? now + data.expires_in * 1000 : 0,
    token_type: data.token_type || record.token_type || "user",
  };
}

async function refreshTokenRecord(record, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const writeRecord = options.writeTokenRecord || writeTokenRecord;
  const now = options.now ?? Date.now();
  const body = buildRefreshBody(record);

  const response = await fetchImpl(TOKEN_URI, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const slackError = data.error || "unknown_error";
    const err = new Error(`Slack token refresh に失敗しました: ${slackError}`);
    err.slackError = slackError;
    err.status = response.status;
    throw err;
  }

  const refreshed = buildRefreshedTokenRecord(record, data, now);
  await writeRecord(refreshed);
  return refreshed;
}

function recordChanged(previous, next) {
  if (!previous || !next) return false;
  return previous.access_token !== next.access_token || previous.refresh_token !== next.refresh_token;
}

async function reloadFreshTokenAfterRefreshRace(previousRecord, options = {}) {
  const readRecord = options.readTokenRecord || readTokenRecord;
  const now = options.now ?? Date.now();
  const refreshWindowMs = options.refreshWindowMs ?? DEFAULT_REFRESH_WINDOW_MS;
  const nextRecord = await readRecord();
  if (recordChanged(previousRecord, nextRecord) && hasUsableAccessToken(nextRecord, now, refreshWindowMs)) {
    return nextRecord.access_token;
  }
  return "";
}

async function getSlackAccessToken(options = {}) {
  const readRecord = options.readTokenRecord || readTokenRecord;
  const now = options.now ?? Date.now();
  const refreshWindowMs = options.refreshWindowMs ?? DEFAULT_REFRESH_WINDOW_MS;
  const record = await readRecord();
  if (!record || !record.access_token) return "";
  if (!record.expires_at && !record.refresh_token) {
    throw new Error("Slack token record に有効期限と refresh token がありません。slack-auth で再ログインしてください。");
  }
  if (!tokenExpiresSoon(record, now, refreshWindowMs)) return record.access_token;

  try {
    const refreshed = await refreshTokenRecord(record, options);
    return refreshed.access_token;
  } catch (err) {
    if (isRefreshRaceError(err)) {
      const reloadedToken = await reloadFreshTokenAfterRefreshRace(record, options);
      if (reloadedToken) return reloadedToken;
    }
    throw err;
  }
}

module.exports = {
  TOKEN_URI,
  DEFAULT_REFRESH_WINDOW_MS,
  tokenExpiresSoon,
  hasUsableAccessToken,
  isRefreshRaceError,
  buildRefreshBody,
  buildRefreshedTokenRecord,
  refreshTokenRecord,
  reloadFreshTokenAfterRefreshRace,
  getSlackAccessToken,
};
