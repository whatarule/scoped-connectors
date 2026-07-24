"use strict";

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

function recordChanged(previous, next) {
  if (!previous || !next) return false;
  return previous.access_token !== next.access_token || previous.refresh_token !== next.refresh_token;
}

async function reloadFreshTokenAfterRefreshRace(previousRecord, options = {}) {
  const readRecord = options.readTokenRecord;
  if (!readRecord) {
    throw new Error("readTokenRecord is required");
  }
  const now = options.now ?? Date.now();
  const refreshWindowMs = options.refreshWindowMs ?? DEFAULT_REFRESH_WINDOW_MS;
  const nextRecord = await readRecord();
  if (recordChanged(previousRecord, nextRecord) && hasUsableAccessToken(nextRecord, now, refreshWindowMs)) {
    return nextRecord.access_token;
  }
  return "";
}

module.exports = {
  DEFAULT_REFRESH_WINDOW_MS,
  tokenExpiresSoon,
  hasUsableAccessToken,
  recordChanged,
  reloadFreshTokenAfterRefreshRace,
};
