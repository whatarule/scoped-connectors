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
} = require("../google-drive-auth");

const STORE_DESCRIPTION = "macOS Keychain (scoped-connectors/google-drive/default)";

const BASE_RECORD = {
  version: 1,
  client_id: "example.apps.googleusercontent.com",
  client_secret: "client-secret-value",
  user_email: "user@compass-e.com",
  user_name: "Example User",
  scope: "https://www.googleapis.com/auth/drive.readonly",
  access_token: "ya29.secret",
  refresh_token: "1//refresh-secret",
  expires_at: Date.UTC(2026, 0, 1, 0, 0, 1),
  token_type: "Bearer",
};

function statusOptions(overrides = {}) {
  return {
    readTokenRecord: async () => BASE_RECORD,
    describeTokenStore: () => STORE_DESCRIPTION,
    getGoogleDriveAccessToken: async () => "ya29.secret",
    fetchDriveAboutWithToken: async () => ({
      user: { displayName: "Live User", emailAddress: "live@compass-e.com" },
    }),
    ...overrides,
  };
}

describe("parseAuthArgs", () => {
  it("引数なしは login にする", () => {
    assert.deepEqual(parseAuthArgs([]), { command: "login", rest: [] });
  });

  it("login の残り引数を渡す", () => {
    assert.deepEqual(parseAuthArgs(["login", "--client-id", "example.apps.googleusercontent.com"]), {
      command: "login",
      rest: ["--client-id", "example.apps.googleusercontent.com"],
    });
  });

  it("先頭がオプションなら login として扱う", () => {
    assert.deepEqual(parseAuthArgs(["--client-id", "example.apps.googleusercontent.com"]), {
      command: "login",
      rest: ["--client-id", "example.apps.googleusercontent.com"],
    });
  });

  it("不明なサブコマンドは拒否する", () => {
    assert.throws(() => parseAuthArgs(["logout"]), /不明なサブコマンド/);
  });
});

describe("formatExpiresAt", () => {
  it("ms epoch を ISO 文字列にする", () => {
    assert.equal(formatExpiresAt(Date.UTC(2026, 0, 1)), "2026-01-01T00:00:00.000Z");
  });

  it("値がなければ unknown にする", () => {
    assert.equal(formatExpiresAt(0), "unknown");
  });
});

describe("getStatus", () => {
  it("record がなければ live check を呼ばない", async () => {
    const status = await getStatus(
      statusOptions({
        readTokenRecord: async () => null,
        getGoogleDriveAccessToken: async () => {
          assert.fail("access token should not be requested");
        },
        fetchDriveAboutWithToken: async () => {
          assert.fail("live check should not be called");
        },
      })
    );

    assert.deepEqual(status, { exists: false, store: STORE_DESCRIPTION });
  });

  it("record があれば about.get で live check して最新 record を表示する", async () => {
    let readCount = 0;
    const status = await getStatus(
      statusOptions({
        readTokenRecord: async () => {
          readCount += 1;
          if (readCount === 1) return BASE_RECORD;
          return { ...BASE_RECORD, expires_at: Date.UTC(2026, 0, 2) };
        },
      })
    );

    assert.equal(status.exists, true);
    assert.equal(status.liveCheck, "about.get ok");
    assert.equal(status.user, "Live User");
    assert.equal(status.email, "live@compass-e.com");
    assert.equal(status.expiresAt, "2026-01-02T00:00:00.000Z");
    assert.equal(readCount, 2);
  });

  it("access token を確認できなければ再ログインを促す", async () => {
    await assert.rejects(
      () => getStatus(statusOptions({ getGoogleDriveAccessToken: async () => "" })),
      /再ログイン/
    );
  });
});

describe("formatStatus", () => {
  it("status 出力に token 値を含めない", async () => {
    const output = formatStatus(await getStatus(statusOptions()));

    assert.match(output, /Google Drive token は保存されています。/);
    assert.match(output, /live_check: about\.get ok/);
    assert.match(output, /email: live@compass-e\.com/);
    assert.doesNotMatch(output, /ya29\.secret/);
    assert.doesNotMatch(output, /1\/\/refresh-secret/);
    assert.doesNotMatch(output, /client-secret-value/);
  });

  it("record がなければ未保存と表示する", () => {
    const output = formatStatus({ exists: false, store: STORE_DESCRIPTION });
    assert.match(output, /保存されていません/);
  });
});

describe("clearToken / formatClearResult", () => {
  it("Keychain record を削除して revoke 非実行を明示する", async () => {
    const calls = [];
    const result = await clearToken({
      deleteTokenRecord: async () => {
        calls.push("delete");
        return { deleted: true };
      },
      describeTokenStore: () => STORE_DESCRIPTION,
    });

    assert.deepEqual(calls, ["delete"]);
    const output = formatClearResult(result);
    assert.match(output, /削除しました/);
    assert.match(output, /revoke は行いません/);
    assert.match(output, /myaccount\.google\.com\/permissions/);
  });

  it("record がなければ未保存と表示する", async () => {
    const result = await clearToken({
      deleteTokenRecord: async () => ({ deleted: false }),
      describeTokenStore: () => STORE_DESCRIPTION,
    });

    assert.match(formatClearResult(result), /保存されていませんでした/);
  });
});

describe("runAuth", () => {
  it("login 成功時に store と email を表示し token 値を出さない", async () => {
    const output = await runAuth([], {
      parseLoginArgs: (args) => ({ args }),
      oauthLogin: async () => ({
        store: STORE_DESCRIPTION,
        user: "Example User",
        email: "user@compass-e.com",
        scope: "https://www.googleapis.com/auth/drive.readonly",
      }),
    });

    assert.match(output, /Google Drive token を保存しました。/);
    assert.match(output, new RegExp(`store: ${STORE_DESCRIPTION.replace(/[()/]/g, "\\$&")}`));
    assert.match(output, /email: user@compass-e\.com/);
    assert.doesNotMatch(output, /ya29\./);
  });

  it("status に引数は指定できない", async () => {
    await assert.rejects(() => runAuth(["status", "--json"]), /引数は指定できません/);
  });

  it("help は USAGE を返す", async () => {
    const output = await runAuth(["--help"]);
    assert.match(output, /login\|status\|clear/);
  });
});
