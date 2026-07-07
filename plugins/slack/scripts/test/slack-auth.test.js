const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseAuthArgs,
  formatExpiresAt,
  getStatus,
  formatStatus,
  clearToken,
  formatClearResult,
  runAuth,
} = require("../slack-auth");

describe("parseAuthArgs", () => {
  it("引数なしは login として扱う", () => {
    assert.deepEqual(parseAuthArgs([]), { command: "login", rest: [] });
  });

  it("login option だけなら login へ渡す", () => {
    assert.deepEqual(parseAuthArgs(["--client-id", "123.456"]), {
      command: "login",
      rest: ["--client-id", "123.456"],
    });
  });

  it("status / clear をサブコマンドとして扱う", () => {
    assert.deepEqual(parseAuthArgs(["status"]), { command: "status", rest: [] });
    assert.deepEqual(parseAuthArgs(["clear"]), { command: "clear", rest: [] });
  });

  it("不明なサブコマンドを拒否する", () => {
    assert.throws(() => parseAuthArgs(["unknown"]), /不明なサブコマンド/);
    assert.throws(() => parseAuthArgs(["logout"]), /不明なサブコマンド/);
  });
});

describe("formatExpiresAt", () => {
  it("expires_at を ISO 文字列にする", () => {
    assert.equal(formatExpiresAt(1000), "1970-01-01T00:00:01.000Z");
  });

  it("不正値は unknown にする", () => {
    assert.equal(formatExpiresAt(0), "unknown");
    assert.equal(formatExpiresAt("not-date"), "unknown");
  });
});

describe("status", () => {
  it("token record がない場合は未保存として表示する", async () => {
    const status = await getStatus({
      describeTokenStore: () => "test-store",
      readTokenRecord: async () => null,
    });

    assert.deepEqual(status, { exists: false, store: "test-store" });
    assert.equal(formatStatus(status), "Slack token は保存されていません。\nstore: test-store\n");
  });

  it("token 値を出さずに保存メタデータだけ表示する", async () => {
    const status = await getStatus({
      describeTokenStore: () => "test-store",
      readTokenRecord: async () => ({
        access_token: "xoxp-secret",
        refresh_token: "xoxe-refresh-secret",
        team_id: "T123",
        team_name: "Example",
        authed_user_id: "U123",
        scope: "channels:read",
        expires_at: 1000,
      }),
    });
    const output = formatStatus(status);

    assert.match(output, /Slack token は保存されています/);
    assert.match(output, /workspace: Example/);
    assert.match(output, /team_id: T123/);
    assert.match(output, /user: U123/);
    assert.doesNotMatch(output, /xoxp-secret/);
    assert.doesNotMatch(output, /xoxe-refresh-secret/);
  });
});

describe("clear", () => {
  it("保存済み token record を削除する", async () => {
    const result = await clearToken({
      describeTokenStore: () => "test-store",
      deleteTokenRecord: async () => ({ deleted: true }),
    });
    const output = formatClearResult(result);

    assert.deepEqual(result, { deleted: true, store: "test-store" });
    assert.match(output, /削除しました/);
    assert.match(output, /revoke は行いません/);
  });

});

describe("runAuth", () => {
  it("引数なしで login を実行する", async () => {
    const output = await runAuth([], {
      parseLoginArgs: (args) => {
        assert.deepEqual(args, []);
        return { clientId: "123.456" };
      },
      oauthLogin: async (options) => ({
        store: "test-store",
        team: `team-for-${options.clientId}`,
        authedUserId: "U123",
        scope: "channels:read",
      }),
    });

    assert.match(output, /Slack token を保存しました/);
    assert.match(output, /workspace: team-for-123.456/);
  });

  it("login 明示でも login を実行する", async () => {
    const output = await runAuth(["login", "--client-id", "123.456"], {
      parseLoginArgs: (args) => {
        assert.deepEqual(args, ["--client-id", "123.456"]);
        return { clientId: "123.456" };
      },
      oauthLogin: async () => ({
        store: "test-store",
        team: "Example",
        authedUserId: "U123",
        scope: "channels:read",
      }),
    });

    assert.match(output, /workspace: Example/);
  });

  it("status に余分な引数があれば拒否する", async () => {
    await assert.rejects(
      () =>
        runAuth(["status", "extra"], {
          describeTokenStore: () => "test-store",
          readTokenRecord: async () => null,
        }),
      /status に引数/
    );
  });
});
