"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const tokenStore = require("../auth/token-store");

describe("Google Drive token-store wrapper", () => {
  it("plugin 固有設定と vendored helper path を持つ", () => {
    assert.equal(tokenStore.SERVICE, "scoped-connectors/google-drive");
    assert.equal(tokenStore.ACCOUNT, "default");
    assert.equal(tokenStore.WINDOWS_TARGET, "scoped-connectors/google-drive/default");
    assert.match(
      tokenStore.WINDOWS_HELPER.split("\\").join("/"),
      /plugins\/google-drive\/scripts\/_shared\/token-store\/windows-credential\.ps1$/
    );
  });

  it("production facade だけを公開する", () => {
    assert.deepEqual(Object.keys(tokenStore), [
      "SERVICE",
      "ACCOUNT",
      "WINDOWS_TARGET",
      "WINDOWS_HELPER",
      "createProfileTokenStore",
      "describeTokenStore",
      "readTokenRecord",
      "writeTokenRecord",
      "deleteTokenRecord",
    ]);
  });

  it("profile ごとに独立した secure store account を使う", async () => {
    const calls = [];
    await tokenStore.writeTokenRecord(
      { access_token: "ya29.sasael" },
      {
        profile: "sasael",
        platform: "win32",
        execFileWithInput: async (command, args, input) => {
          calls.push({ command, args, input });
          return { stdout: "" };
        },
      }
    );
    assert.equal(calls[0].args.at(-2), "scoped-connectors/google-drive/sasael");
    assert.equal(calls[0].args.at(-1), "sasael");
    assert.throws(() => tokenStore.createProfileTokenStore("../unsafe"), /profile/);
  });

  it("Google Drive 設定を vendored token-store に渡す", async () => {
    const calls = [];
    await tokenStore.writeTokenRecord(
      { access_token: "ya29.test" },
      {
        platform: "win32",
        execFileWithInput: async (command, args, input) => {
          calls.push({ command, args, input });
          return { stdout: "" };
        },
      }
    );

    assert.deepEqual(calls[0], {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        tokenStore.WINDOWS_HELPER,
        "write",
        tokenStore.WINDOWS_TARGET,
        tokenStore.ACCOUNT,
      ],
      input: JSON.stringify({ access_token: "ya29.test" }),
    });
  });

  it("非対応 OS のエラーに Google Drive を表示する", () => {
    assert.throws(
      () =>
        tokenStore.describeTokenStore({
          platform: "linux",
          env: {},
          procVersion: "Linux version 6.8.0",
        }),
      /Google Drive token store/
    );
  });
});
