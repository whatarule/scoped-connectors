const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_CHANNEL,
  DEFAULT_QUERY,
  DEFAULT_COUNT,
  MAX_COUNT,
  parseArgs,
  parseCount,
  normalizeChannelName,
  resolveTargetChannel,
  redactSecrets,
  truncateText,
  buildAuthTestStep,
  runSmoke,
  formatSmokeReport,
} = require("../smoke");

describe("parseArgs", () => {
  it("既定値を返す", () => {
    assert.deepEqual(parseArgs([]), {
      channel: DEFAULT_CHANNEL,
      query: DEFAULT_QUERY,
      count: DEFAULT_COUNT,
      login: false,
      skipUsers: false,
      skipHistory: false,
      skipSearch: false,
      showText: false,
      help: false,
    });
  });

  it("オプションを解析する", () => {
    assert.deepEqual(
      parseArgs([
        "--channel",
        "#random",
        "--query",
        "deploy",
        "--count",
        "2",
        "--login",
        "--skip-users",
        "--skip-history",
        "--skip-search",
        "--show-text",
      ]),
      {
        channel: "#random",
        query: "deploy",
        count: 2,
        login: true,
        skipUsers: true,
        skipHistory: true,
        skipSearch: true,
        showText: true,
        help: false,
      }
    );
  });

  it("count は smoke 用の上限を超えられない", () => {
    assert.equal(parseCount("1"), 1);
    assert.equal(parseCount(String(MAX_COUNT)), MAX_COUNT);
    assert.throws(() => parseCount("0"), /1-10/);
    assert.throws(() => parseCount(String(MAX_COUNT + 1)), /1-10/);
  });
});

describe("channel helpers", () => {
  const channels = [
    { id: "C123", name: "general" },
    { id: "C456", name: "random" },
  ];

  it("channel 名を正規化する", () => {
    assert.equal(normalizeChannelName("#general"), "general");
    assert.equal(normalizeChannelName(" random "), "random");
  });

  it("channel 名または public channel ID を解決する", () => {
    assert.deepEqual(resolveTargetChannel("#general", channels), { id: "C123", name: "general" });
    assert.deepEqual(resolveTargetChannel("C456", channels), { id: "C456", name: "random" });
    assert.deepEqual(resolveTargetChannel("C999", channels), { id: "C999", name: "C999" });
    assert.throws(() => resolveTargetChannel("missing", channels), /見つかりません/);
  });
});

describe("redaction", () => {
  it("Slack token らしい文字列を伏せる", () => {
    assert.equal(redactSecrets("token xoxp-secret.value end"), "token [redacted-token] end");
    assert.equal(truncateText("hello   xoxe-refresh-token"), "hello [redacted-token]");
  });
});

describe("runSmoke", () => {
  function createDeps(overrides = {}) {
    const calls = [];
    return {
      calls,
      getStatus: async () => ({
        exists: true,
        store: "test-store",
        workspace: "Example",
        teamId: "T123",
        user: "U123",
        liveCheck: "auth.test ok",
        expiresAt: "2030-01-01T00:00:00.000Z",
      }),
      runAuth: async () => {
        calls.push({ fn: "runAuth" });
      },
      fetchAllPages: async (endpoint, params, dataKey) => {
        calls.push({ fn: "fetchAllPages", endpoint, params, dataKey });
        return [{ id: "C123", name: "general" }];
      },
      fetchSlackApi: async (endpoint, params = {}) => {
        calls.push({ fn: "fetchSlackApi", endpoint, params });
        if (endpoint === "users.list") {
          return { ok: true, members: [{ id: "U1", deleted: false }, { id: "U2", deleted: true }] };
        }
        if (endpoint === "usergroups.list") {
          return { ok: true, usergroups: [{ id: "S1" }] };
        }
        if (endpoint === "conversations.history") {
          return {
            ok: true,
            messages: [{ ts: "1770000001.000000", user: "U1", text: "deploy xoxp-hidden" }],
          };
        }
        throw new Error(`unexpected endpoint: ${endpoint}`);
      },
      searchMessages: async (options) => {
        calls.push({ fn: "searchMessages", options });
        return [
          {
            datetime: "2026-07-08 12:00",
            channelName: "general",
            id: "1770000002.000000",
            user: "alice",
            text: "search xoxp-hidden",
          },
        ];
      },
      ...overrides,
    };
  }

  it("実 API smoke の各 step を実行し、既定では本文と token 値を出さない", async () => {
    const deps = createDeps();
    const report = await runSmoke({ channel: "general", query: "deploy", count: 1 }, deps);
    const output = formatSmokeReport(report);

    assert.equal(report.ok, true);
    assert.deepEqual(
      deps.calls.map((call) => call.fn || call.endpoint),
      ["fetchAllPages", "fetchSlackApi", "fetchSlackApi", "fetchSlackApi", "searchMessages"]
    );
    assert.match(output, /Slack smoke result: PASS/);
    assert.match(output, /OK auth\.test/);
    assert.match(output, /OK channels/);
    assert.match(output, /OK users/);
    assert.match(output, /OK history/);
    assert.match(output, /OK search/);
    assert.doesNotMatch(output, /deploy xoxp-hidden/);
    assert.doesNotMatch(output, /search xoxp-hidden/);
    assert.doesNotMatch(output, /xoxp-hidden/);
  });

  it("--show-text 相当では短い本文を出すが token は伏せる", async () => {
    const deps = createDeps();
    const report = await runSmoke({ channel: "general", query: "deploy", count: 1, showText: true }, deps);
    const output = formatSmokeReport(report);

    assert.match(output, /deploy \[redacted-token\]/);
    assert.match(output, /search \[redacted-token\]/);
    assert.doesNotMatch(output, /xoxp-hidden/);
  });

  it("token がなければ login 指示を出して失敗する", async () => {
    const deps = createDeps({
      getStatus: async () => ({ exists: false, store: "test-store" }),
    });

    await assert.rejects(
      () => runSmoke({}, deps),
      /slack-auth/
    );
  });

  it("--login 指定時は login 後に再度 status を確認する", async () => {
    let statusCalls = 0;
    const deps = createDeps({
      getStatus: async () => {
        statusCalls += 1;
        if (statusCalls === 1) return { exists: false, store: "test-store" };
        return {
          exists: true,
          store: "test-store",
        workspace: "Example",
        teamId: "T123",
        user: "U123",
        liveCheck: "auth.test ok",
        expiresAt: "2030-01-01T00:00:00.000Z",
      };
      },
    });

    const report = await runSmoke({ login: true, skipUsers: true, skipHistory: true, skipSearch: true }, deps);
    assert.equal(statusCalls, 2);
    assert.equal(report.steps[0].name, "login");
    assert.equal(deps.calls[0].fn, "runAuth");
  });

  it("status が live auth.test 未確認なら失敗する", async () => {
    const deps = createDeps({
      getStatus: async () => ({
        exists: true,
        store: "test-store",
        workspace: "Example",
        teamId: "T123",
        user: "U123",
        expiresAt: "2030-01-01T00:00:00.000Z",
      }),
    });

    await assert.rejects(
      () => runSmoke({ skipUsers: true, skipHistory: true, skipSearch: true }, deps),
      /auth\.test/
    );
  });
});

describe("buildAuthTestStep", () => {
  it("status の live auth.test 結果から表示用 step を作る", () => {
    assert.deepEqual(
      buildAuthTestStep({
        liveCheck: "auth.test ok",
        workspace: "Example",
        teamId: "T123",
        user: "U123",
      }),
      {
        name: "auth-test",
        ok: true,
        team: "Example",
        teamId: "T123",
        userId: "U123",
      }
    );
  });
});
