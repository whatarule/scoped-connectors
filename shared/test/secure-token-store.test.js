"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const tokenStoreModule = require("../scripts/token-store");

const SERVICE = "scoped-connectors/test";
const ACCOUNT = "default";
const WINDOWS_TARGET = `${SERVICE}/${ACCOUNT}`;
const WINDOWS_HELPER = "/repo/windows-credential.ps1";
const WSL_ENV = { WSL_DISTRO_NAME: "Ubuntu" };

function createTestStore() {
  return tokenStoreModule.createSecureTokenStore({
    service: SERVICE,
    account: ACCOUNT,
    displayName: "Test Connector",
    windowsHelperPath: WINDOWS_HELPER,
  });
}

describe("token-store public facade", () => {
  it("module export を createSecureTokenStore だけに限定する", () => {
    assert.deepEqual(Object.keys(tokenStoreModule), ["createSecureTokenStore"]);
  });

  it("生成した facade を production 操作だけに限定する", () => {
    assert.deepEqual(Object.keys(createTestStore()), [
      "describeTokenStore",
      "readTokenRecord",
      "writeTokenRecord",
      "deleteTokenRecord",
    ]);
  });

  it("macOS / Windows / WSL の store を説明する", () => {
    const store = createTestStore();

    assert.equal(store.describeTokenStore({ platform: "darwin" }), `macOS Keychain (${SERVICE}/${ACCOUNT})`);
    assert.equal(
      store.describeTokenStore({ platform: "win32" }),
      `Windows Credential Manager (${WINDOWS_TARGET})`
    );
    assert.equal(
      store.describeTokenStore({ platform: "linux", env: WSL_ENV }),
      `Windows Credential Manager (${WINDOWS_TARGET}) via WSL`
    );
  });

  it("adapter に plugin 設定を渡す", async () => {
    const calls = [];
    await createTestStore().writeTokenRecord(
      { access_token: "token" },
      {
        platform: "darwin",
        execFileAsync: async (command, args) => {
          calls.push({ command, args });
          return { stdout: "" };
        },
      }
    );

    assert.deepEqual(calls, [
      {
        command: "security",
        args: [
          "add-generic-password",
          "-U",
          "-s",
          SERVICE,
          "-a",
          ACCOUNT,
          "-w",
          JSON.stringify({ access_token: "token" }),
        ],
      },
    ]);
  });

  it("非対応 OS では displayName 入りで失敗する", () => {
    assert.throws(
      () =>
        createTestStore().describeTokenStore({
          platform: "linux",
          env: {},
          procVersion: "Linux version 6.8.0",
        }),
      /Test Connector token store/
    );
  });
});
