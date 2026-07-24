"use strict";

const http = require("node:http");
const {
  READONLY_SCOPES,
  TOKEN_RECORD_VERSION,
} = require("./auth");
const {
  describeTokenStore,
  writeTokenRecord,
} = require("./token-store");
const {
  validateGrantedScopes,
  verifyAllowedGoogleAccount,
} = require("./policy/google-login");
const {
  CLIENT_ID_ENV,
  DEFAULT_ALLOWED_DOMAINS,
  DEFAULT_CLIENT_ID,
  DEFAULT_CONFIG_PATH,
  loadConfigFile,
  normalizeDomains,
  resolveClientId,
  applyLoginDefaults,
  parseLoginArgs,
} = require("./settings/google-drive");
const { promptHiddenInput } = require("./secret-input");
const {
  base64Url,
  createPkcePair,
  createState,
} = require("./_shared/oauth-pkce");
const { validateAuthorizationCallback } = require("./_shared/oauth-callback");
const { postFormForJson } = require("./_shared/oauth-http");

const AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const DRIVE_ABOUT_URI = "https://www.googleapis.com/drive/v3/about";
// 共有 OAuth client(compass-e.com の内部アプリ)。client_id は公開識別子として同梱する。
// client secret はディスク(config・JSON・環境変数)に置かず、login 時の対話入力で受け取って
// Token Record として OS secure store にのみ保存する(refresh は record の値を使う)。
const USAGE = [
  "使い方: oauth-login.js [--client-id id]",
  "",
  "Google OAuth PKCE でログインして token を OS secure store に保存します。",
  "既定では同梱の共有 client_id(compass-e.com の内部アプリ)を使います。",
  "client secret は login 時に対話入力で受け取ります(値は社内の秘密情報共有先から取得)。ファイルや環境変数には置きません。",
  `別 client を使う場合は ${DEFAULT_CONFIG_PATH} の clientId、${CLIENT_ID_ENV}、または --client-id で指定できます。`,
  `token 保存前にアカウントのメールドメインを allowedDomains と照合します(既定: ${DEFAULT_ALLOWED_DOMAINS.join(", ")})。`,
  `allowedDomains は ${DEFAULT_CONFIG_PATH} または GOOGLE_DRIVE_ALLOWED_DOMAINS で上書きできます。`,
  "",
].join("\n");

const applyDefaults = applyLoginDefaults;
const parseArgs = parseLoginArgs;

function validateOptions(options) {
  if (!options.allowedDomains || options.allowedDomains.length === 0) {
    throw new Error(
      `許可ドメインが必要です。${options.configPath} の allowedDomains または GOOGLE_DRIVE_ALLOWED_DOMAINS を指定してください。`
    );
  }
}

function normalizeOAuthClient(client) {
  const clientId = String((client && client.client_id) || "").trim();
  if (!clientId) {
    throw new Error("OAuth client_id が必要です。");
  }
  return {
    client_id: clientId,
    client_secret: String((client && client.client_secret) || "").trim(),
  };
}

async function resolveOAuthClient(options, promptImpl = promptHiddenInput) {
  const clientId = options.clientId;
  const clientSecret = await promptImpl(
    "client secret を入力してください(表示されません。空 Enter で secret なし): "
  );
  if (!clientSecret && clientId === DEFAULT_CLIENT_ID) {
    throw new Error(
      "同梱の共有 client_id は token exchange に client secret が必要です。社内の秘密情報共有先から値を取得して入力してください。"
    );
  }
  return normalizeOAuthClient({
    client_id: clientId,
    client_secret: clientSecret,
  });
}

function formatTokenEndpointError(message) {
  const text = String(message || "unknown error");
  if (/client_secret/i.test(text) && /missing|required|invalid/i.test(text)) {
    return [
      `Google token 取得に失敗しました: ${text}`,
      "この OAuth Client ID は token exchange に client_secret を要求しています。",
      "login をやり直し、正しい client secret を入力してください(値は社内の秘密情報共有先から取得)。",
    ].join("\n");
  }
  return `Google token 取得に失敗しました: ${text}`;
}

function createCallbackServer() {
  return new Promise((resolve, reject) => {
    const state = createState();
    const server = http.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
      resolve({ server, state, redirectUri });
    });
  });
}

async function waitForAuthorization(client) {
  const { server, state, redirectUri } = await createCallbackServer();
  const pkce = createPkcePair();
  const authUrl = new URL(AUTH_URI);
  authUrl.searchParams.set("client_id", client.client_id);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", READONLY_SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "false");
  authUrl.searchParams.set("code_challenge", pkce.challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  process.stdout.write(
    [
      "次の URL をブラウザで開いて Google Drive の参照専用権限を許可してください:",
      authUrl.toString(),
      "",
    ].join("\n")
  );

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("認可待ちがタイムアウトしました。"));
    }, 10 * 60 * 1000);

    server.on("request", (req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      clearTimeout(timeout);
      let authorizedCode;
      try {
        authorizedCode = validateAuthorizationCallback({
          error: url.searchParams.get("error"),
          code: url.searchParams.get("code"),
          returnedState: url.searchParams.get("state"),
          expectedState: state,
        });
      } catch (err) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(err.responseBody || "Invalid authorization response. You can close this tab.");
        server.close();
        reject(err);
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Google Drive authorization completed. You can close this tab.");
      server.close();
      resolve({ code: authorizedCode, redirectUri, codeVerifier: pkce.verifier });
    });
  });
}

async function exchangeCodeForToken(client, authorization, fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: client.client_id,
    code: authorization.code,
    code_verifier: authorization.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: authorization.redirectUri,
  });
  if (client.client_secret) {
    body.set("client_secret", client.client_secret);
  }

  const { response, data } = await postFormForJson(TOKEN_URI, body, fetchImpl);
  if (!response.ok) {
    const message = data.error_description || data.error || `HTTP ${response.status || "unknown"}`;
    throw new Error(formatTokenEndpointError(message));
  }
  if (!data.access_token) {
    throw new Error("Google token response に access_token が含まれていません。");
  }
  if (!data.refresh_token) {
    throw new Error("refresh_token が返りませんでした。再実行して同意画面で許可してください。");
  }
  return data;
}

async function fetchDriveAboutWithToken(accessToken, fetchImpl = fetch) {
  const url = new URL(DRIVE_ABOUT_URI);
  url.searchParams.set("fields", "user(displayName,emailAddress)");
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (data.error && data.error.message) || `HTTP ${response.status || "unknown"}`;
    throw new Error(`Google Drive about.get が失敗しました: ${message}`);
  }
  return data;
}

async function verifyTokenAuthorization(options, tokenResponse, fetchImpl = fetch) {
  const about = await fetchDriveAboutWithToken(tokenResponse.access_token, fetchImpl);
  const user = (about && about.user) || {};
  return verifyAllowedGoogleAccount(user, options.allowedDomains);
}

function buildTokenRecord(client, data, now = Date.now(), verification = {}) {
  const scope = String((data && data.scope) || "").trim();
  if (!scope) {
    throw new Error("Google token response に scope が含まれていません。");
  }
  return {
    version: TOKEN_RECORD_VERSION,
    client_id: client.client_id,
    client_secret: client.client_secret || "",
    user_email: verification.user_email || "",
    user_name: verification.user_name || "",
    scope,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_in ? now + data.expires_in * 1000 : 0,
    token_type: data.token_type || "Bearer",
    token_uri: TOKEN_URI,
  };
}

async function login(options) {
  validateOptions(options);
  const client = await resolveOAuthClient(options, options.promptForClientSecret);
  const authorization = await waitForAuthorization(client);
  const tokenResponse = await exchangeCodeForToken(client, authorization);
  validateGrantedScopes(tokenResponse);
  const verification = await verifyTokenAuthorization(options, tokenResponse);
  const record = buildTokenRecord(client, tokenResponse, Date.now(), verification);
  await writeTokenRecord(record);
  return {
    store: describeTokenStore(),
    email: record.user_email,
    user: record.user_name || record.user_email,
    scope: record.scope,
  };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(USAGE);
      return;
    }
  } catch (err) {
    process.stderr.write(`エラー: ${err.message}\n${USAGE}`);
    process.exit(1);
  }

  try {
    const result = await login(options);
    process.stdout.write("Google Drive token を保存しました。\n");
    process.stdout.write(`store: ${result.store}\n`);
    process.stdout.write(`email: ${result.email}\n`);
    process.stdout.write(`scope: ${result.scope}\n`);
  } catch (err) {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  AUTH_URI,
  TOKEN_URI,
  DRIVE_ABOUT_URI,
  CLIENT_ID_ENV,
  DEFAULT_ALLOWED_DOMAINS,
  DEFAULT_CLIENT_ID,
  DEFAULT_CONFIG_PATH,
  USAGE,
  loadConfigFile,
  normalizeDomains,
  resolveClientId,
  applyDefaults,
  parseArgs,
  validateOptions,
  normalizeOAuthClient,
  promptHiddenInput,
  resolveOAuthClient,
  formatTokenEndpointError,
  validateGrantedScopes,
  base64Url,
  createPkcePair,
  validateAuthorizationCallback,
  exchangeCodeForToken,
  fetchDriveAboutWithToken,
  verifyTokenAuthorization,
  buildTokenRecord,
  login,
};
