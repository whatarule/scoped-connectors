"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createMacTokenStore,
  describeMacTokenStore,
  decodeKeychainPayload,
  readMacTokenRecord,
  writeMacTokenRecord,
  deleteMacTokenRecord,
} = require("../scripts/token-store/mac-keychain");

const SERVICE = "scoped-connectors/test";
const ACCOUNT = "default";
const DISPLAY_NAME = "Test Connector";

function createStore() {
  return createMacTokenStore({ service: SERVICE, account: ACCOUNT });
}

describe("macOS Keychain adapter", () => {
  it("store を生成して説明する", () => {
    const store = createStore();
    assert.deepEqual(store, { type: "keychain", service: SERVICE, account: ACCOUNT });
    assert.equal(describeMacTokenStore(store), `macOS Keychain (${SERVICE}/${ACCOUNT})`);
  });

  it("hex 出力を UTF-8 payload に戻し、通常の JSON はそのまま返す", () => {
    const payload = JSON.stringify({ access_token: "token", name: "山田 太郎" });
    assert.equal(decodeKeychainPayload(Buffer.from(payload, "utf8").toString("hex")), payload);
    assert.equal(decodeKeychainPayload(payload), payload);
  });

  it("Keychain から record を読む", async () => {
    const calls = [];
    const record = await readMacTokenRecord(createStore(), DISPLAY_NAME, {
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: JSON.stringify({ access_token: "token" }) };
      },
    });

    assert.deepEqual(record, { access_token: "token" });
    assert.deepEqual(calls, [
      {
        command: "security",
        args: ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"],
      },
    ]);
  });

  it("Keychain の hex 出力から非 ASCII を含む record を読む", async () => {
    const record = { access_token: "token", name: "山田 太郎" };
    const payload = Buffer.from(JSON.stringify(record), "utf8").toString("hex");
    const result = await readMacTokenRecord(createStore(), DISPLAY_NAME, {
      execFileAsync: async () => ({ stdout: `${payload}\n` }),
    });

    assert.deepEqual(result, record);
  });

  it("Keychain に record がなければ null を返す", async () => {
    const result = await readMacTokenRecord(createStore(), DISPLAY_NAME, {
      execFileAsync: async () => {
        const err = new Error("not found");
        err.code = 44;
        throw err;
      },
    });

    assert.equal(result, null);
  });

  it("Keychain に record を保存する", async () => {
    const calls = [];
    const record = { access_token: "token", refresh_token: "refresh" };
    const store = createStore();
    const result = await writeMacTokenRecord(store, record, {
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: "" };
      },
    });

    assert.equal(result, store);
    assert.deepEqual(calls, [
      {
        command: "security",
        args: ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-w", JSON.stringify(record)],
      },
    ]);
  });

  it("Keychain item の削除結果を返す", async () => {
    const store = createStore();
    const calls = [];
    const deleted = await deleteMacTokenRecord(store, DISPLAY_NAME, {
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: "" };
      },
    });
    const missing = await deleteMacTokenRecord(store, DISPLAY_NAME, {
      execFileAsync: async () => {
        const err = new Error("not found");
        err.code = 44;
        throw err;
      },
    });

    assert.deepEqual(deleted, { store, deleted: true });
    assert.deepEqual(missing, { store, deleted: false });
    assert.deepEqual(calls, [
      {
        command: "security",
        args: ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT],
      },
    ]);
  });
});
