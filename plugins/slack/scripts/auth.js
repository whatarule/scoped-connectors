"use strict";

const {
  readTokenRecord,
  writeTokenRecord,
} = require("./token-store");
const {
  DEFAULT_REFRESH_WINDOW_MS,
  tokenExpiresSoon,
  hasUsableAccessToken,
  reloadFreshTokenAfterRefreshRace: reloadFreshTokenAfterRefreshRaceBase,
} = require("./_shared/token/refresh");
const { postFormForJson } = require("./_shared/oauth/http");

const TOKEN_URI = "https://slack.com/api/oauth.v2.user.access";

function isRefreshRaceError(err) {
  return Boolean(err && ["invalid_refresh_token", "token_expired"].includes(err.slackError));
}

function buildRefreshReauthError(err) {
  const slackError = err && err.slackError ? err.slackError : "unknown_error";
  const reauthError = new Error(
    `Slack refresh token が期限切れまたは無効です: ${slackError}。slack-auth で再ログインしてください。`
  );
  reauthError.slackError = slackError;
  if (err && err.status) reauthError.status = err.status;
  return reauthError;
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

  const { response, data } = await postFormForJson(TOKEN_URI, body, fetchImpl);
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

async function reloadFreshTokenAfterRefreshRace(previousRecord, options = {}) {
  const readRecord = options.readTokenRecord || readTokenRecord;
  return reloadFreshTokenAfterRefreshRaceBase(previousRecord, {
    ...options,
    readTokenRecord: readRecord,
  });
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
      throw buildRefreshReauthError(err);
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
  buildRefreshReauthError,
  buildRefreshBody,
  buildRefreshedTokenRecord,
  refreshTokenRecord,
  reloadFreshTokenAfterRefreshRace,
  getSlackAccessToken,
};
