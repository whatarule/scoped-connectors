"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const {
  DEFAULT_CLIENT_SECRET_PATH,
  DEFAULT_TOKEN_PATH,
  READONLY_SCOPES,
  writeTokenFile,
} = require("./common");

const AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const USAGE =
  "使い方: oauth-login.js [--client-secret path] [--token-path path]\n";

function parseArgs(args) {
  const options = {
    clientSecretPath: process.env.GOOGLE_DRIVE_CLIENT_SECRET || DEFAULT_CLIENT_SECRET_PATH,
    tokenPath: process.env.GOOGLE_DRIVE_TOKEN_PATH || DEFAULT_TOKEN_PATH,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--client-secret") {
      if (!args[i + 1]) throw new Error("--client-secret には JSON path を指定してください。");
      options.clientSecretPath = args[++i];
    } else if (arg === "--token-path") {
      if (!args[i + 1]) throw new Error("--token-path には保存先 path を指定してください。");
      options.tokenPath = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`不明なオプションです: ${arg}`);
    }
  }

  return options;
}

function loadInstalledClient(clientSecretPath) {
  const payload = JSON.parse(fs.readFileSync(clientSecretPath, "utf8"));
  const client = payload.installed;
  if (!client || !client.client_id) {
    throw new Error("OAuth client JSON は Desktop app の installed 形式である必要があります。");
  }
  return client;
}

function base64Url(input) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkcePair() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function createCallbackServer() {
  return new Promise((resolve, reject) => {
    const state = base64Url(crypto.randomBytes(24));
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

    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");

      clearTimeout(timeout);
      if (error) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Authorization failed. You can close this tab.");
        server.close();
        reject(new Error(`認可が失敗しました: ${error}`));
        return;
      }
      if (!code || returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Invalid authorization response. You can close this tab.");
        server.close();
        reject(new Error("認可レスポンスが不正です。"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Google Drive authorization completed. You can close this tab.");
      server.close();
      resolve({ code, redirectUri, codeVerifier: pkce.verifier });
    });
  });
}

async function exchangeCodeForToken(client, authorization) {
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
    throw new Error(`token 取得に失敗しました: ${message}`);
  }
  if (!data.refresh_token) {
    throw new Error("refresh_token が返りませんでした。再実行して同意画面で許可してください。");
  }

  return {
    type: "authorized_user",
    client_id: client.client_id,
    client_secret: client.client_secret || "",
    refresh_token: data.refresh_token,
    access_token: data.access_token,
    token_type: data.token_type || "Bearer",
    scope: data.scope || READONLY_SCOPES.join(" "),
    token_uri: TOKEN_URI,
    expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : 0,
  };
}

async function login(options) {
  const client = loadInstalledClient(options.clientSecretPath);
  const authorization = await waitForAuthorization(client);
  const token = await exchangeCodeForToken(client, authorization);
  writeTokenFile(token, options.tokenPath);
  return { tokenPath: options.tokenPath, scope: token.scope };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`エラー: ${err.message}\n${USAGE}`);
    process.exit(1);
  }

  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  try {
    const result = await login(options);
    process.stdout.write(`token を保存しました: ${result.tokenPath}\n`);
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
  USAGE,
  parseArgs,
  loadInstalledClient,
  createPkcePair,
  exchangeCodeForToken,
  login,
};
