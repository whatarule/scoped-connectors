const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { READONLY_SCOPES } = require("../auth");
const {
  DEFAULT_ALLOWED_DOMAINS,
  DEFAULT_CLIENT_ID,
  DEFAULT_CONFIG_PATH,
  TOKEN_URI,
  normalizeDomains,
  resolveClientId,
  parseArgs,
  validateOptions,
  resolveOAuthClient,
  validateGrantedScopes,
  validateAuthorizationCallback,
  exchangeCodeForToken,
  verifyTokenAuthorization,
  buildTokenRecord,
} = require("../oauth-login");

const FULL_SCOPE = READONLY_SCOPES.join(" ");
const OVERBROAD_SCOPE = "https://www.googleapis.com/auth/drive";

describe("normalizeDomains", () => {
  it("配列を trim・小文字化・@除去して正規化する", () => {
    assert.deepEqual(normalizeDomains([" Compass-e.com ", "@example.com", ""]), [
      "compass-e.com",
      "example.com",
    ]);
  });

  it("カンマ区切り文字列も受け付ける", () => {
    assert.deepEqual(normalizeDomains("compass-e.com, example.com"), [
      "compass-e.com",
      "example.com",
    ]);
  });

  it("配列・文字列以外は拒否する", () => {
    assert.throws(() => normalizeDomains({ domain: "x" }), /allowedDomains/);
  });
});

describe("parseArgs", () => {
  it("既定では compass-e.com を許可ドメインにする", () => {
    const options = parseArgs([], {}, () => ({}));
    assert.deepEqual(options.allowedDomains, DEFAULT_ALLOWED_DOMAINS);
    assert.equal(options.clientId, DEFAULT_CLIENT_ID);
    assert.equal(options.configPath, DEFAULT_CONFIG_PATH);
  });

  it("config の allowedDomains と clientId を使う", () => {
    const options = parseArgs([], {}, () => ({
      allowedDomains: ["example.com"],
      clientId: "config.apps.googleusercontent.com",
    }));
    assert.deepEqual(options.allowedDomains, ["example.com"]);
    assert.equal(options.clientId, "config.apps.googleusercontent.com");
  });

  it("環境変数 GOOGLE_DRIVE_ALLOWED_DOMAINS が config より優先される", () => {
    const options = parseArgs(
      [],
      { GOOGLE_DRIVE_ALLOWED_DOMAINS: "env.example.com" },
      () => ({ allowedDomains: ["config.example.com"] })
    );
    assert.deepEqual(options.allowedDomains, ["env.example.com"]);
  });

  it("環境変数 GOOGLE_DRIVE_CLIENT_ID が config の clientId より優先される", () => {
    const options = parseArgs(
      [],
      { GOOGLE_DRIVE_CLIENT_ID: "env.apps.googleusercontent.com" },
      () => ({ clientId: "config.apps.googleusercontent.com" })
    );
    assert.equal(options.clientId, "env.apps.googleusercontent.com");
  });

  it("--client-id は環境変数と config の clientId より優先される", () => {
    const options = parseArgs(
      ["--client-id", "cli.apps.googleusercontent.com"],
      { GOOGLE_DRIVE_CLIENT_ID: "env.apps.googleusercontent.com" },
      () => ({ clientId: "config.apps.googleusercontent.com" })
    );
    assert.equal(options.clientId, "cli.apps.googleusercontent.com");
  });

  it("clientId の優先順位は CLI、環境変数、config、同梱既定値の順に解決する", () => {
    assert.equal(
      resolveClientId(
        { clientId: " cli.apps.googleusercontent.com " },
        { clientId: "config.apps.googleusercontent.com" },
        { GOOGLE_DRIVE_CLIENT_ID: "env.apps.googleusercontent.com" }
      ),
      "cli.apps.googleusercontent.com"
    );
    assert.equal(
      resolveClientId(
        { clientId: "" },
        { clientId: "config.apps.googleusercontent.com" },
        { GOOGLE_DRIVE_CLIENT_ID: " env.apps.googleusercontent.com " }
      ),
      "env.apps.googleusercontent.com"
    );
    assert.equal(
      resolveClientId({ clientId: "" }, { client_id: "legacy.apps.googleusercontent.com" }, {}),
      "legacy.apps.googleusercontent.com"
    );
    assert.equal(resolveClientId({ clientId: "" }, {}, {}), DEFAULT_CLIENT_ID);
  });

  it("config path は GOOGLE_DRIVE_CONFIG_PATH で上書きできる(--config は廃止)", () => {
    const loaded = [];
    const options = parseArgs(
      [],
      { GOOGLE_DRIVE_CONFIG_PATH: "/tmp/config.json" },
      (configPath) => {
        loaded.push(configPath);
        return {};
      }
    );
    assert.equal(options.configPath, "/tmp/config.json");
    assert.deepEqual(loaded, ["/tmp/config.json"]);
    assert.throws(() => parseArgs(["--config", "/tmp/config.json"], {}, () => ({})), /不明なオプション/);
  });

  it("secret をディスクに置くオプションは廃止済みとして拒否する", () => {
    assert.throws(() => parseArgs(["--client-json", "/tmp/client.json"], {}, () => ({})), /不明なオプション/);
    assert.throws(() => parseArgs(["--client-secret", "/tmp/cs.json"], {}, () => ({})), /不明なオプション/);
    assert.throws(() => parseArgs(["--token-path", "/tmp/token.json"], {}, () => ({})), /不明なオプション/);
  });
});

describe("validateOptions", () => {
  it("allowedDomains が空なら失敗する", () => {
    assert.throws(
      () => validateOptions({ allowedDomains: [], configPath: "/tmp/config.json" }),
      /allowedDomains/
    );
  });
});

describe("resolveOAuthClient", () => {
  it("同梱の共有 client_id と対話入力の secret を組み合わせる", async () => {
    const prompts = [];
    const client = await resolveOAuthClient({ clientId: DEFAULT_CLIENT_ID }, async (question) => {
      prompts.push(question);
      return "typed-client-secret";
    });

    assert.deepEqual(client, {
      client_id: DEFAULT_CLIENT_ID,
      client_secret: "typed-client-secret",
    });
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /client secret/);
  });

  it("clientId 指定時も secret は対話入力から受け取る", async () => {
    const client = await resolveOAuthClient(
      { clientId: "example.apps.googleusercontent.com" },
      async () => "typed-client-secret"
    );

    assert.deepEqual(client, {
      client_id: "example.apps.googleusercontent.com",
      client_secret: "typed-client-secret",
    });
  });

  it("別 client では空入力(secret なし)を許容する", async () => {
    const client = await resolveOAuthClient(
      { clientId: "example.apps.googleusercontent.com" },
      async () => ""
    );

    assert.equal(client.client_secret, "");
  });

  it("同梱の共有 client_id で secret が空なら失敗する", async () => {
    await assert.rejects(
      () => resolveOAuthClient({ clientId: DEFAULT_CLIENT_ID }, async () => ""),
      /client secret が必要/
    );
  });
});

describe("validateGrantedScopes", () => {
  it("必要 scope が揃っていれば成功する", () => {
    validateGrantedScopes({ scope: FULL_SCOPE });
  });

  it("scope がなければ再ログインを促す", () => {
    assert.throws(() => validateGrantedScopes({}), /再ログイン/);
  });

  it("不足 scope を列挙して再ログインを促す", () => {
    assert.throws(
      () => validateGrantedScopes({ scope: READONLY_SCOPES[0] }),
      (err) => {
        assert.match(err.message, /不足 scope/);
        assert.match(err.message, new RegExp(READONLY_SCOPES[1].replace(/[/.]/g, "\\$&")));
        assert.match(err.message, /google-drive-auth/);
        return true;
      }
    );
  });

  it("許可されていない scope を列挙して再ログインを促す", () => {
    assert.throws(
      () => validateGrantedScopes({ scope: `${FULL_SCOPE} ${OVERBROAD_SCOPE}` }),
      (err) => {
        assert.match(err.message, /許可されていない scope/);
        assert.match(err.message, new RegExp(OVERBROAD_SCOPE.replace(/[/.]/g, "\\$&")));
        assert.match(err.message, /google-drive-auth/);
        return true;
      }
    );
  });
});

describe("validateAuthorizationCallback", () => {
  it("state が一致すれば code を返す", () => {
    const code = validateAuthorizationCallback({
      code: "auth-code",
      returnedState: "state-1",
      expectedState: "state-1",
    });
    assert.equal(code, "auth-code");
  });

  it("state 不一致は拒否する", () => {
    assert.throws(
      () =>
        validateAuthorizationCallback({
          code: "auth-code",
          returnedState: "state-x",
          expectedState: "state-1",
        }),
      /認可レスポンスが不正/
    );
  });

  it("error パラメータ付きは拒否する", () => {
    assert.throws(
      () =>
        validateAuthorizationCallback({
          error: "access_denied",
          expectedState: "state-1",
        }),
      /access_denied/
    );
  });
});

describe("exchangeCodeForToken", () => {
  it("client_secret がない Desktop client では client_secret を送らない", async () => {
    let postedBody;
    const token = await exchangeCodeForToken(
      { client_id: "example.apps.googleusercontent.com", client_secret: "" },
      {
        code: "auth-code",
        codeVerifier: "pkce-verifier",
        redirectUri: "http://127.0.0.1:1234/oauth2callback",
      },
      async (_url, init) => {
        postedBody = init.body;
        return {
          ok: true,
          async json() {
            return {
              access_token: "ya29.new",
              refresh_token: "1//refresh-new",
              scope: FULL_SCOPE,
            };
          },
        };
      }
    );

    assert.equal(token.access_token, "ya29.new");
    assert.equal(postedBody.get("client_id"), "example.apps.googleusercontent.com");
    assert.equal(postedBody.get("code_verifier"), "pkce-verifier");
    assert.equal(postedBody.has("client_secret"), false);
  });

  it("client_secret missing では login のやり直しと secret 入力を促す", async () => {
    await assert.rejects(
      () =>
        exchangeCodeForToken(
          { client_id: "example.apps.googleusercontent.com", client_secret: "" },
          {
            code: "auth-code",
            codeVerifier: "pkce-verifier",
            redirectUri: "http://127.0.0.1:1234/oauth2callback",
          },
          async () => ({
            ok: false,
            status: 400,
            async json() {
              return { error: "invalid_request", error_description: "client_secret is missing." };
            },
          })
        ),
      (err) => {
        assert.match(err.message, /client_secret is missing/);
        assert.match(err.message, /login をやり直し/);
        assert.match(err.message, /client secret を入力/);
        return true;
      }
    );
  });
});

describe("verifyTokenAuthorization", () => {
  const OPTIONS = { allowedDomains: ["compass-e.com"] };

  function aboutFetch(user) {
    return async (url, init) => {
      assert.match(String(url), /drive\/v3\/about/);
      assert.equal(init.headers.Authorization, "Bearer ya29.test");
      return {
        ok: true,
        async json() {
          return { user };
        },
      };
    };
  }

  it("許可ドメインのアカウントを受け入れる", async () => {
    const verification = await verifyTokenAuthorization(
      OPTIONS,
      { access_token: "ya29.test" },
      aboutFetch({ displayName: "Example User", emailAddress: "user@compass-e.com" })
    );

    assert.deepEqual(verification, {
      user_email: "user@compass-e.com",
      user_name: "Example User",
    });
  });

  it("大文字を含むメールも正規化して受け入れる", async () => {
    const verification = await verifyTokenAuthorization(
      OPTIONS,
      { access_token: "ya29.test" },
      aboutFetch({ emailAddress: "User@Compass-E.com" })
    );

    assert.equal(verification.user_email, "user@compass-e.com");
  });

  it("許可外ドメインのアカウントは保存前に拒否する", async () => {
    await assert.rejects(
      () =>
        verifyTokenAuthorization(
          OPTIONS,
          { access_token: "ya29.test" },
          aboutFetch({ emailAddress: "user@gmail.com" })
        ),
      /許可されていない Google アカウント/
    );
  });

  it("emailAddress が確認できなければ拒否する", async () => {
    await assert.rejects(
      () => verifyTokenAuthorization(OPTIONS, { access_token: "ya29.test" }, aboutFetch({})),
      /メールアドレスを確認できません/
    );
  });
});

describe("buildTokenRecord", () => {
  it("Keychain 保存用の record を組み立てる", () => {
    const record = buildTokenRecord(
      { client_id: "example.apps.googleusercontent.com", client_secret: "cs-value" },
      {
        access_token: "ya29.new",
        refresh_token: "1//refresh-new",
        expires_in: 3600,
        token_type: "Bearer",
        scope: FULL_SCOPE,
      },
      1_000,
      { user_email: "user@compass-e.com", user_name: "Example User" }
    );

    assert.deepEqual(record, {
      version: 1,
      client_id: "example.apps.googleusercontent.com",
      client_secret: "cs-value",
      user_email: "user@compass-e.com",
      user_name: "Example User",
      scope: FULL_SCOPE,
      access_token: "ya29.new",
      refresh_token: "1//refresh-new",
      expires_at: 3_601_000,
      token_type: "Bearer",
      token_uri: TOKEN_URI,
    });
  });

  it("client_secret がない client では空文字にする", () => {
    const record = buildTokenRecord(
      { client_id: "example.apps.googleusercontent.com" },
      { access_token: "ya29.new", refresh_token: "1//refresh-new" },
      1_000
    );

    assert.equal(record.client_secret, "");
    assert.equal(record.expires_at, 0);
    assert.equal(record.scope, FULL_SCOPE);
  });
});
