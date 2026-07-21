const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  TOKEN_URI,
  TOKEN_RECORD_VERSION,
  READONLY_SCOPES,
  missingRequiredScopes,
  unexpectedGrantedScopes,
  assertSupportedTokenRecordVersion,
  assertRequiredScopes,
  buildRefreshBody,
  buildRefreshedTokenRecord,
  getGoogleDriveAccessToken,
  isRefreshReauthError,
  refreshTokenRecord,
  tokenExpiresSoon,
} = require("../auth");

const FULL_SCOPE = READONLY_SCOPES.join(" ");
const OVERBROAD_SCOPE = "https://www.googleapis.com/auth/drive";

const BASE_RECORD = {
  version: TOKEN_RECORD_VERSION,
  client_id: "example.apps.googleusercontent.com",
  client_secret: "client-secret-value",
  user_email: "user@compass-e.com",
  user_name: "Example User",
  scope: FULL_SCOPE,
  access_token: "ya29.old",
  refresh_token: "1//refresh-old",
  expires_at: 10_000,
  token_type: "Bearer",
  token_uri: TOKEN_URI,
};

describe("missingRequiredScopes", () => {
  it("全 scope が揃っていれば空配列を返す", () => {
    assert.deepEqual(missingRequiredScopes(FULL_SCOPE), []);
  });

  it("不足 scope を列挙する", () => {
    assert.deepEqual(missingRequiredScopes(READONLY_SCOPES[0]), READONLY_SCOPES.slice(1));
  });
});

describe("unexpectedGrantedScopes", () => {
  it("許可 scope だけなら空配列を返す", () => {
    assert.deepEqual(unexpectedGrantedScopes(FULL_SCOPE), []);
  });

  it("許可されていない scope を列挙する", () => {
    assert.deepEqual(unexpectedGrantedScopes(`${FULL_SCOPE} ${OVERBROAD_SCOPE}`), [
      OVERBROAD_SCOPE,
    ]);
  });
});

describe("assertSupportedTokenRecordVersion", () => {
  it("対応 version なら通す", () => {
    assert.doesNotThrow(() => assertSupportedTokenRecordVersion(BASE_RECORD));
  });

  it("未対応 version は再ログインを促し token 値を漏らさない", () => {
    assert.throws(
      () => assertSupportedTokenRecordVersion({ ...BASE_RECORD, version: 2 }),
      (err) => {
        assert.match(err.message, /version/);
        assert.match(err.message, /再ログイン/);
        assert.doesNotMatch(err.message, /ya29\.old/);
        assert.doesNotMatch(err.message, /1\/\/refresh-old/);
        return true;
      }
    );
  });
});

describe("assertRequiredScopes", () => {
  it("scope 不足時は再ログインを促し token 値を漏らさない", () => {
    assert.throws(
      () => assertRequiredScopes({ ...BASE_RECORD, scope: READONLY_SCOPES[0] }),
      (err) => {
        assert.match(err.message, /再ログイン/);
        assert.match(err.message, /google-drive-auth/);
        assert.doesNotMatch(err.message, /ya29\.old/);
        assert.doesNotMatch(err.message, /1\/\/refresh-old/);
        return true;
      }
    );
  });

  it("scope 超過時は再ログインを促し token 値を漏らさない", () => {
    assert.throws(
      () => assertRequiredScopes({ ...BASE_RECORD, scope: `${FULL_SCOPE} ${OVERBROAD_SCOPE}` }),
      (err) => {
        assert.match(err.message, /許可されていない scope/);
        assert.match(err.message, new RegExp(OVERBROAD_SCOPE.replace(/[/.]/g, "\\$&")));
        assert.match(err.message, /google-drive-auth/);
        assert.doesNotMatch(err.message, /ya29\.old/);
        assert.doesNotMatch(err.message, /1\/\/refresh-old/);
        return true;
      }
    );
  });
});

describe("tokenExpiresSoon", () => {
  it("期限内 token は refresh 不要にする", () => {
    assert.equal(tokenExpiresSoon({ expires_at: 60_000 }, 1_000, 5_000), false);
  });

  it("期限切れ間近 token は refresh 対象にする", () => {
    assert.equal(tokenExpiresSoon({ expires_at: 5_500 }, 1_000, 5_000), true);
  });

  it("expires_at がない token は単体判定では refresh 不要にする", () => {
    assert.equal(tokenExpiresSoon({}, 1_000, 5_000), false);
  });
});

describe("buildRefreshBody", () => {
  it("client_secret を含めて refresh request body を作る", () => {
    const body = buildRefreshBody(BASE_RECORD);

    assert.equal(body.get("client_id"), BASE_RECORD.client_id);
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("refresh_token"), "1//refresh-old");
    assert.equal(body.get("client_secret"), "client-secret-value");
    assert.doesNotMatch(body.toString(), /ya29\.old/);
  });

  it("client_secret がない record では client_secret を送らない", () => {
    const body = buildRefreshBody({ ...BASE_RECORD, client_secret: "" });
    assert.equal(body.has("client_secret"), false);
  });

  it("client_id または refresh_token がなければ再ログインを促す", () => {
    assert.throws(() => buildRefreshBody({ ...BASE_RECORD, client_id: "" }), /再ログイン/);
    assert.throws(() => buildRefreshBody({ ...BASE_RECORD, refresh_token: "" }), /再ログイン/);
  });

  it("未対応 version の record は refresh request body を作らない", () => {
    assert.throws(
      () => buildRefreshBody({ ...BASE_RECORD, version: 2 }),
      (err) => {
        assert.match(err.message, /version/);
        assert.match(err.message, /再ログイン/);
        assert.doesNotMatch(err.message, /ya29\.old/);
        assert.doesNotMatch(err.message, /1\/\/refresh-old/);
        return true;
      }
    );
  });
});

describe("buildRefreshedTokenRecord", () => {
  it("新しい access token と expires_at を保存 record に反映する", () => {
    const record = buildRefreshedTokenRecord(
      BASE_RECORD,
      {
        access_token: "ya29.new",
        expires_in: 3600,
        token_type: "Bearer",
        scope: FULL_SCOPE,
      },
      1_000
    );

    assert.deepEqual(record, {
      ...BASE_RECORD,
      access_token: "ya29.new",
      expires_at: 3_601_000,
    });
  });

  it("refresh_token が返らなくても既存の refresh_token を維持する", () => {
    const record = buildRefreshedTokenRecord(
      BASE_RECORD,
      { access_token: "ya29.new", expires_in: 3600 },
      1_000
    );

    assert.equal(record.refresh_token, "1//refresh-old");
  });

  it("access_token が返らなければエラーにする", () => {
    assert.throws(() => buildRefreshedTokenRecord(BASE_RECORD, {}), /access_token/);
  });
});

describe("refreshTokenRecord", () => {
  it("token endpoint で refresh して Keychain record を上書きする", async () => {
    let captured;
    const writes = [];
    const refreshed = await refreshTokenRecord(BASE_RECORD, {
      now: 1_000,
      writeTokenRecord: async (record) => {
        writes.push(record);
      },
      fetchImpl: async (url, options) => {
        captured = { url, options, body: options.body.toString() };
        return {
          ok: true,
          async json() {
            return {
              access_token: "ya29.new",
              expires_in: 3600,
              token_type: "Bearer",
              scope: FULL_SCOPE,
            };
          },
        };
      },
    });

    assert.equal(captured.url, TOKEN_URI);
    assert.equal(captured.options.method, "POST");
    assert.equal(captured.options.headers["Content-Type"], "application/x-www-form-urlencoded");
    assert.match(captured.body, /grant_type=refresh_token/);
    assert.equal(refreshed.access_token, "ya29.new");
    assert.equal(refreshed.refresh_token, "1//refresh-old");
    assert.deepEqual(writes, [refreshed]);
  });

  it("Google error では token 値を含めないエラーを投げる", async () => {
    await assert.rejects(
      () =>
        refreshTokenRecord(BASE_RECORD, {
          fetchImpl: async () => ({
            ok: false,
            status: 400,
            async json() {
              return { error: "invalid_grant" };
            },
          }),
        }),
      (err) => {
        assert.equal(err.googleError, "invalid_grant");
        assert.match(err.message, /invalid_grant/);
        assert.doesNotMatch(err.message, /1\/\/refresh-old/);
        assert.doesNotMatch(err.message, /ya29\.old/);
        return true;
      }
    );
  });

  it("refresh response の scope が超過していれば保存せず再ログインを促す", async () => {
    const writes = [];
    await assert.rejects(
      () =>
        refreshTokenRecord(BASE_RECORD, {
          now: 1_000,
          writeTokenRecord: async (record) => {
            writes.push(record);
          },
          fetchImpl: async () => ({
            ok: true,
            async json() {
              return {
                access_token: "ya29.new",
                expires_in: 3600,
                token_type: "Bearer",
                scope: `${FULL_SCOPE} ${OVERBROAD_SCOPE}`,
              };
            },
          }),
        }),
      /許可されていない scope/
    );
    assert.deepEqual(writes, []);
  });
});

describe("getGoogleDriveAccessToken", () => {
  it("record がなければ空文字を返す", async () => {
    const token = await getGoogleDriveAccessToken({
      readTokenRecord: async () => null,
    });

    assert.equal(token, "");
  });

  it("期限内 token は refresh せずそのまま返す", async () => {
    const token = await getGoogleDriveAccessToken({
      now: 1_000,
      refreshWindowMs: 1_000,
      readTokenRecord: async () => BASE_RECORD,
      fetchImpl: async () => {
        assert.fail("refresh should not be called");
      },
    });

    assert.equal(token, "ya29.old");
  });

  it("未対応 version の保存 record は access token 利用前に拒否する", async () => {
    await assert.rejects(
      () =>
        getGoogleDriveAccessToken({
          readTokenRecord: async () => ({ ...BASE_RECORD, version: 2 }),
          fetchImpl: async () => {
            assert.fail("refresh should not be called");
          },
        }),
      (err) => {
        assert.match(err.message, /version/);
        assert.match(err.message, /再ログイン/);
        assert.doesNotMatch(err.message, /ya29\.old/);
        assert.doesNotMatch(err.message, /1\/\/refresh-old/);
        return true;
      }
    );
  });

  it("期限切れ間近 token は refresh して新 token を返す", async () => {
    const token = await getGoogleDriveAccessToken({
      now: 9_500,
      refreshWindowMs: 1_000,
      readTokenRecord: async () => BASE_RECORD,
      writeTokenRecord: async () => {},
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return {
            access_token: "ya29.new",
            expires_in: 3600,
            token_type: "Bearer",
          };
        },
      }),
    });

    assert.equal(token, "ya29.new");
  });

  it("expires_at と refresh_token がない token record は再ログインを促す", async () => {
    const legacyRecord = { ...BASE_RECORD };
    delete legacyRecord.expires_at;
    delete legacyRecord.refresh_token;

    await assert.rejects(
      () =>
        getGoogleDriveAccessToken({
          readTokenRecord: async () => legacyRecord,
          fetchImpl: async () => {
            assert.fail("refresh should not be called");
          },
        }),
      (err) => {
        assert.match(err.message, /再ログイン/);
        assert.doesNotMatch(err.message, /1\/\/refresh-old/);
        assert.doesNotMatch(err.message, /ya29\.old/);
        return true;
      }
    );
  });

  it("refresh 競合時は Keychain を再読込して別プロセス保存済み token を使う", async () => {
    let readCount = 0;
    const token = await getGoogleDriveAccessToken({
      now: 9_500,
      refreshWindowMs: 1_000,
      readTokenRecord: async () => {
        readCount += 1;
        if (readCount === 1) return BASE_RECORD;
        return {
          ...BASE_RECORD,
          access_token: "ya29.other-process",
          expires_at: 50_000,
        };
      },
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        async json() {
          return { error: "invalid_grant" };
        },
      }),
    });

    assert.equal(token, "ya29.other-process");
    assert.equal(readCount, 2);
  });

  it("競合救済できない invalid_grant は再ログインを促す", async () => {
    await assert.rejects(
      () =>
        getGoogleDriveAccessToken({
          now: 9_500,
          refreshWindowMs: 1_000,
          readTokenRecord: async () => BASE_RECORD,
          fetchImpl: async () => ({
            ok: false,
            status: 400,
            async json() {
              return { error: "invalid_grant" };
            },
          }),
        }),
      (err) => {
        assert.equal(isRefreshReauthError(err), true);
        assert.equal(err.googleError, "invalid_grant");
        assert.match(err.message, /再ログイン/);
        assert.match(err.message, /google-drive-auth/);
        assert.doesNotMatch(err.message, /1\/\/refresh-old/);
        assert.doesNotMatch(err.message, /ya29\.old/);
        return true;
      }
    );
  });
});
