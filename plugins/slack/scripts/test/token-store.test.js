"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const tokenStore = require("../token-store");

describe("Slack token-store wrapper", () => {
  it("plugin 固有設定と vendored helper path を持つ", () => {
    assert.equal(tokenStore.SERVICE, "scoped-connectors/slack");
    assert.equal(tokenStore.ACCOUNT, "default");
    assert.equal(tokenStore.WINDOWS_TARGET, "scoped-connectors/slack/default");
    assert.match(
      tokenStore.WINDOWS_HELPER.split("\\").join("/"),
      /plugins\/slack\/scripts\/_shared\/token-store\/windows-credential\.ps1$/
    );
  });

  it("production facade だけを公開する", () => {
    assert.deepEqual(Object.keys(tokenStore), [
      "SERVICE",
      "ACCOUNT",
      "WINDOWS_TARGET",
      "WINDOWS_HELPER",
      "describeTokenStore",
      "readTokenRecord",
      "writeTokenRecord",
      "deleteTokenRecord",
    ]);
  });

  it("Slack 設定を vendored token-store に渡す", async () => {
    const calls = [];
    await tokenStore.writeTokenRecord(
      { access_token: "xoxp-test" },
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
      input: JSON.stringify({ access_token: "xoxp-test" }),
    });
  });

  it("非対応 OS のエラーに Slack を表示する", () => {
    assert.throws(
      () =>
        tokenStore.describeTokenStore({
          platform: "linux",
          env: {},
          procVersion: "Linux version 6.8.0",
        }),
      /Slack token store/
    );
  });
});
