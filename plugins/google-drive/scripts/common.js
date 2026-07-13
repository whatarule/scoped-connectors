"use strict";

const {
  DRIVE_READONLY_SCOPE,
  DRIVE_ACTIVITY_READONLY_SCOPE,
  DRIVE_LABELS_READONLY_SCOPE,
  READONLY_SCOPES,
  missingRequiredScopes,
  assertRequiredScopes,
  getGoogleDriveAccessToken,
} = require("./auth");
const { describeTokenStore } = require("./token-store");

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/";

async function getAccessToken() {
  const token = await getGoogleDriveAccessToken();
  if (token) {
    return { token, source: describeTokenStore() };
  }

  throw new Error(
    [
      "Google Drive token が保存されていません。",
      "google-drive-auth でログインして OS secure store に token を保存してください。",
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

function driveApiErrorReasons(data) {
  const apiError = data && data.error ? data.error : {};
  return Array.isArray(apiError.errors)
    ? [...new Set(apiError.errors.map((err) => err.reason).filter(Boolean))]
    : [];
}

function formatDriveApiError(status, data, fallbackText) {
  const apiError = data && data.error ? data.error : {};
  const message = apiError.message || fallbackText || "unknown error";
  const reasons = driveApiErrorReasons(data);

  const hints = [];
  if (status === 401) {
    hints.push(
      "access token が失効している可能性があります。google-drive-auth status で確認し、必要なら再ログインしてください。"
    );
  }
  if (status === 403 && reasons.includes("insufficientPermissions")) {
    hints.push("google-drive-auth で再ログインして全ての読み取り専用 scope を許可してください。");
  }
  if (status === 403 && /has not been used|disabled/i.test(message)) {
    hints.push("Google Cloud プロジェクトで Google Drive API を有効化してください。");
  }

  const suffix = hints.length ? `\n${hints.join("\n")}` : "";
  const reasonText = reasons.length ? ` reasons=${reasons.join(",")}` : "";
  return `Google Drive API エラー: HTTP ${status}${reasonText}: ${message}${suffix}`;
}

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 300;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function isRetryableError(status, data) {
  if (RETRYABLE_STATUSES.has(status)) return true;
  if (status === 403) {
    const reasons = driveApiErrorReasons(data);
    return reasons.includes("rateLimitExceeded") || reasons.includes("userRateLimitExceeded");
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestDriveResponse(path, params, options, accept) {
  const auth = options.auth || (await getAccessToken());
  const url = buildDriveUrl(path, params);
  const maxRetries = options.maxRetries === undefined ? MAX_RETRIES : options.maxRetries;
  const retryBaseMs = options.retryBaseMs === undefined ? RETRY_BASE_MS : options.retryBaseMs;

  for (let attempt = 0; ; attempt++) {
    if (attempt > 0) await sleep(retryBaseMs * 2 ** (attempt - 1));

    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        Accept: accept,
      },
    });
    if (response.ok) return { response, auth };

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_err) {
        data = null;
      }
    }
    const error = new Error(formatDriveApiError(response.status, data, text));
    error.status = response.status;
    if (attempt >= maxRetries || !isRetryableError(response.status, data)) {
      throw error;
    }
  }
}

async function fetchDriveApi(path, params = {}, options = {}) {
  const { response, auth } = await requestDriveResponse(path, params, options, "application/json");
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_err) {
      data = null;
    }
  }
  return { data, tokenSource: auth.source };
}

// alt=media / export のバイナリ・テキスト本文取得用
async function fetchDriveApiRaw(path, params = {}, options = {}) {
  const { response, auth } = await requestDriveResponse(path, params, options, "*/*");
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || "",
    tokenSource: auth.source,
  };
}

module.exports = {
  DRIVE_READONLY_SCOPE,
  DRIVE_ACTIVITY_READONLY_SCOPE,
  DRIVE_LABELS_READONLY_SCOPE,
  READONLY_SCOPES,
  missingRequiredScopes,
  assertRequiredScopes,
  getAccessToken,
  buildDriveUrl,
  formatDriveApiError,
  isRetryableError,
  fetchDriveApi,
  fetchDriveApiRaw,
};
