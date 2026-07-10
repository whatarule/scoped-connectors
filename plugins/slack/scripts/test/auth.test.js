const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  TOKEN_URI,
  buildRefreshBody,
  buildRefreshedTokenRecord,
  getSlackAccessToken,
  isRefreshRaceError,
  refreshTokenRecord,
  tokenExpiresSoon,
} = require("../auth");

const BASE_RECORD = {
  version: 1,
  client_id: "123.456",
  team_id: "T123",
  team_name: "Example",
  authed_user_id: "U123",
  scope: "channels:read",
  access_token: "xoxe.xoxp-old",
  refresh_token: "xoxe-refresh-old",
  expires_at: 10_000,
  token_type: "user",
};

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
  it("client_secret を含めず refresh request body を作る", () => {
    const body = buildRefreshBody({
      ...BASE_RECORD,
      client_secret: "super-secret",
    }).toString();

    assert.match(body, /client_id=123\.456/);
    assert.match(body, /grant_type=refresh_token/);
    assert.match(body, /refresh_token=xoxe-refresh-old/);
    assert.doesNotMatch(body, /client_secret/);
    assert.doesNotMatch(body, /super-secret/);
    assert.doesNotMatch(body, /xoxe\.xoxp-old/);
  });

  it("client_id または refresh_token がなければ再ログインを促す", () => {
    assert.throws(() => buildRefreshBody({ ...BASE_RECORD, client_id: "" }), /再ログイン/);
    assert.throws(() => buildRefreshBody({ ...BASE_RECORD, refresh_token: "" }), /再ログイン/);
  });
});

describe("buildRefreshedTokenRecord", () => {
  it("新しい access / refresh token と expires_at を保存 record に反映する", () => {
    const record = buildRefreshedTokenRecord(
      BASE_RECORD,
      {
        ok: true,
        access_token: "xoxe.xoxp-new",
        refresh_token: "xoxe-refresh-new",
        expires_in: 43200,
        token_type: "user",
        scope: "channels:read,users:read",
      },
      1_000
    );

    assert.deepEqual(record, {
      ...BASE_RECORD,
      scope: "channels:read,users:read",
      access_token: "xoxe.xoxp-new",
      refresh_token: "xoxe-refresh-new",
      expires_at: 43_201_000,
      token_type: "user",
    });
  });
});

describe("refreshTokenRecord", () => {
  it("oauth.v2.user.access で token を refresh して OS secure store record を上書きする", async () => {
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
              ok: true,
              access_token: "xoxe.xoxp-new",
              refresh_token: "xoxe-refresh-new",
              expires_in: 43200,
              token_type: "user",
            };
          },
        };
      },
    });

    assert.equal(captured.url, TOKEN_URI);
    assert.equal(captured.options.method, "POST");
    assert.equal(captured.options.headers["Content-Type"], "application/x-www-form-urlencoded");
    assert.match(captured.body, /grant_type=refresh_token/);
    assert.doesNotMatch(captured.body, /client_secret/);
    assert.equal(refreshed.access_token, "xoxe.xoxp-new");
    assert.equal(refreshed.refresh_token, "xoxe-refresh-new");
    assert.deepEqual(writes, [refreshed]);
  });

  it("Slack error では token 値を含めないエラーを投げる", async () => {
    await assert.rejects(
      () =>
        refreshTokenRecord(BASE_RECORD, {
          fetchImpl: async () => ({
            ok: true,
            async json() {
              return { ok: false, error: "invalid_refresh_token" };
            },
          }),
        }),
      (err) => {
        assert.equal(err.slackError, "invalid_refresh_token");
        assert.match(err.message, /invalid_refresh_token/);
        assert.doesNotMatch(err.message, /xoxe-refresh-old/);
        assert.doesNotMatch(err.message, /xoxe\.xoxp-old/);
        return true;
      }
    );
  });
});

describe("getSlackAccessToken", () => {
  it("期限内 token は refresh せずそのまま返す", async () => {
    const token = await getSlackAccessToken({
      now: 1_000,
      refreshWindowMs: 1_000,
      readTokenRecord: async () => BASE_RECORD,
      fetchImpl: async () => {
        assert.fail("refresh should not be called");
      },
    });

    assert.equal(token, "xoxe.xoxp-old");
  });

  it("期限切れ間近 token は refresh して新 token を返す", async () => {
    const token = await getSlackAccessToken({
      now: 9_500,
      refreshWindowMs: 1_000,
      readTokenRecord: async () => BASE_RECORD,
      writeTokenRecord: async () => {},
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return {
            ok: true,
            access_token: "xoxe.xoxp-new",
            refresh_token: "xoxe-refresh-new",
            expires_in: 43200,
            token_type: "user",
          };
        },
      }),
    });

    assert.equal(token, "xoxe.xoxp-new");
  });

  it("expires_at と refresh_token がない token record は再ログインを促す", async () => {
    const legacyRecord = { ...BASE_RECORD };
    delete legacyRecord.expires_at;
    delete legacyRecord.refresh_token;

    await assert.rejects(
      () =>
        getSlackAccessToken({
          readTokenRecord: async () => legacyRecord,
          fetchImpl: async () => {
            assert.fail("refresh should not be called");
          },
        }),
      (err) => {
        assert.match(err.message, /再ログイン/);
        assert.doesNotMatch(err.message, /xoxe-refresh-old/);
        assert.doesNotMatch(err.message, /xoxe\.xoxp-old/);
        return true;
      }
    );
  });

  it("refresh token 競合時は OS secure store を再読込して別プロセス保存済み token を使う", async () => {
    let readCount = 0;
    const token = await getSlackAccessToken({
      now: 9_500,
      refreshWindowMs: 1_000,
      readTokenRecord: async () => {
        readCount += 1;
        if (readCount === 1) return BASE_RECORD;
        return {
          ...BASE_RECORD,
          access_token: "xoxe.xoxp-other-process",
          refresh_token: "xoxe-refresh-other-process",
          expires_at: 50_000,
        };
      },
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { ok: false, error: "invalid_refresh_token" };
        },
      }),
    });

    assert.equal(token, "xoxe.xoxp-other-process");
    assert.equal(readCount, 2);
  });

  for (const slackError of ["invalid_refresh_token", "token_expired"]) {
    it(`競合救済できない ${slackError} は再ログインを促す`, async () => {
      await assert.rejects(
        () =>
          getSlackAccessToken({
            now: 9_500,
            refreshWindowMs: 1_000,
            readTokenRecord: async () => BASE_RECORD,
            fetchImpl: async () => ({
              ok: true,
              async json() {
                return { ok: false, error: slackError };
              },
            }),
          }),
        (err) => {
          assert.equal(isRefreshRaceError(err), true);
          assert.equal(err.slackError, slackError);
          assert.match(err.message, /再ログイン/);
          assert.match(err.message, /slack-auth/);
          assert.match(err.message, new RegExp(slackError));
          assert.doesNotMatch(err.message, /xoxe-refresh-old/);
          assert.doesNotMatch(err.message, /xoxe\.xoxp-old/);
          return true;
        }
      );
    });
  }
});
