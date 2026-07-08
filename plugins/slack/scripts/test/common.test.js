const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { formatTs, checkOk, resolveSlackToken } = require("../common");

describe("resolveSlackToken", () => {
  it("Keychain token store の access token を返す", async () => {
    const token = await resolveSlackToken({
      now: 1_000,
      refreshWindowMs: 1_000,
      readTokenRecord: async () => ({ access_token: "xoxe-store", expires_at: 60_000 }),
    });

    assert.equal(token, "xoxe-store");
  });

  it("token store が空なら空文字を返す", async () => {
    const token = await resolveSlackToken({
      readTokenRecord: async () => null,
    });

    assert.equal(token, "");
  });

  it("token store に access_token がなければ空文字を返す", async () => {
    const token = await resolveSlackToken({
      readTokenRecord: async () => ({ refresh_token: "xoxe-refresh" }),
    });

    assert.equal(token, "");
  });
});

describe("formatTs", () => {
  it("Slack ts を YYYY-MM-DD HH:MM 形式に変換する", () => {
    // 2024-04-16 12:00 UTC = 2024-04-16 21:00 JST
    const result = formatTs("1713268800.123456");
    // タイムゾーンによって結果が変わるので、フォーマットだけ確認
    assert.match(result, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("異なる ts でも正しいフォーマットを返す", () => {
    const result = formatTs("1700000000.000000");
    assert.match(result, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe("checkOk", () => {
  it("ok: true の場合は何もしない", () => {
    // 例外が投げられないことを確認
    checkOk({ ok: true });
  });

  // ok: false のテストは process.exit を呼ぶので、
  // サブプロセスで実行してテストする
  it("ok: false の場合は exit code 1 で終了する", async () => {
    const { execFile } = require("node:child_process");
    const { promisify } = require("node:util");
    const exec = promisify(execFile);

    try {
      await exec("node", ["-e", `
        const { checkOk } = require("${require("path").resolve(__dirname, "../common")}");
        checkOk({ ok: false, error: "test_error" });
      `]);
      assert.fail("プロセスが終了するはず");
    } catch (err) {
      assert.equal(err.code, 1);
      assert.ok(err.stderr.includes("test_error"));
    }
  });
});
