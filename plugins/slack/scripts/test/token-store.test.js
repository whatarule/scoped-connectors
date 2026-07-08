const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  SERVICE,
  ACCOUNT,
  detectTokenStore,
  describeTokenStore,
  readTokenRecord,
  writeTokenRecord,
  deleteTokenRecord,
} = require("../token-store");

describe("detectTokenStore", () => {
  it("macOS では Keychain を使う", () => {
    assert.deepEqual(detectTokenStore({ platform: "darwin" }), {
      type: "keychain",
      service: SERVICE,
      account: ACCOUNT,
    });
  });

  it("macOS 以外では token file fallback せず失敗する", () => {
    assert.throws(() => detectTokenStore({ platform: "linux" }), /macOS Keychain/);
  });
});

describe("describeTokenStore", () => {
  it("Keychain store の説明を返す", () => {
    assert.equal(describeTokenStore({ platform: "darwin" }), `macOS Keychain (${SERVICE}/${ACCOUNT})`);
  });
});

describe("readTokenRecord", () => {
  it("macOS では Keychain から token record を読む", async () => {
    const calls = [];
    const record = await readTokenRecord({
      platform: "darwin",
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: JSON.stringify({ access_token: "xoxp-test" }) };
      },
    });

    assert.deepEqual(record, { access_token: "xoxp-test" });
    assert.deepEqual(calls, [
      {
        command: "security",
        args: ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"],
      },
    ]);
  });

  it("macOS Keychain に record がなければ null を返す", async () => {
    const record = await readTokenRecord({
      platform: "darwin",
      execFileAsync: async () => {
        const err = new Error("not found");
        err.code = 44;
        throw err;
      },
    });

    assert.equal(record, null);
  });
});

describe("writeTokenRecord", () => {
  it("macOS では Keychain に token record を保存する", async () => {
    const calls = [];
    const record = { access_token: "xoxp-test", refresh_token: "xoxe-refresh" };
    const store = await writeTokenRecord(
      record,
      {
        platform: "darwin",
        execFileAsync: async (command, args) => {
          calls.push({ command, args });
          return { stdout: "" };
        },
      }
    );

    assert.equal(store.type, "keychain");
    assert.deepEqual(calls, [
      {
        command: "security",
        args: ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-w", JSON.stringify(record)],
      },
    ]);
  });
});

describe("deleteTokenRecord", () => {
  it("macOS では Keychain item を削除する", async () => {
    const calls = [];
    const result = await deleteTokenRecord({
      platform: "darwin",
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: "" };
      },
    });

    assert.equal(result.deleted, true);
    assert.deepEqual(calls, [
      {
        command: "security",
        args: ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT],
      },
    ]);
  });

  it("macOS で item がなければ deleted=false を返す", async () => {
    const result = await deleteTokenRecord({
      platform: "darwin",
      execFileAsync: async () => {
        const err = new Error("not found");
        err.code = 44;
        throw err;
      },
    });

    assert.equal(result.deleted, false);
  });
});
