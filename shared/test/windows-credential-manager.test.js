"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  isWsl,
  createWindowsTokenStore,
  describeWindowsTokenStore,
  resolveWindowsHelperPath,
  readWindowsTokenRecord,
  writeWindowsTokenRecord,
  deleteWindowsTokenRecord,
} = require("../scripts/token-store/windows-credential-manager");

const ACCOUNT = "default";
const TARGET = "scoped-connectors/test/default";
const DISPLAY_NAME = "Test Connector";
const HELPER = "/repo/windows-credential.ps1";
const WSL_ENV = { WSL_DISTRO_NAME: "Ubuntu" };

function createStore(options = {}, bridge = "") {
  return createWindowsTokenStore(
    {
      account: ACCOUNT,
      windowsTarget: TARGET,
      windowsHelperPath: HELPER,
    },
    options,
    bridge
  );
}

describe("Windows Credential Manager adapter", () => {
  it("環境変数または /proc/version から WSL を判定する", () => {
    assert.equal(isWsl({ env: WSL_ENV }), true);
    assert.equal(isWsl({ env: {}, procVersion: "Linux version 5.15.90.1-microsoft-standard-WSL2" }), true);
    assert.equal(isWsl({ env: {}, procVersion: "Linux version 6.8.0" }), false);
  });

  it("Windows / WSL store を生成して説明する", () => {
    const windowsStore = createStore();
    const wslStore = createStore({}, "wsl");

    assert.deepEqual(windowsStore, {
      type: "windows-credential-manager",
      target: TARGET,
      username: ACCOUNT,
      helperPath: HELPER,
    });
    assert.equal(describeWindowsTokenStore(windowsStore), `Windows Credential Manager (${TARGET})`);
    assert.equal(describeWindowsTokenStore(wslStore), `Windows Credential Manager (${TARGET}) via WSL`);
  });

  it("WSL では helper path を Windows path に変換する", async () => {
    const calls = [];
    const result = await resolveWindowsHelperPath(createStore({}, "wsl"), {
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: "C:\\repo\\windows-credential.ps1\r\n" };
      },
    });

    assert.equal(result, "C:\\repo\\windows-credential.ps1");
    assert.deepEqual(calls, [{ command: "wslpath", args: ["-w", HELPER] }]);
  });

  it("WSL path を変換できなければ分かりやすく失敗する", async () => {
    await assert.rejects(
      () =>
        resolveWindowsHelperPath(createStore({}, "wsl"), {
          execFileAsync: async () => {
            throw new Error("wslpath not found");
          },
        }),
      /wslpath/
    );
  });

  it("PowerShell helper から record を読む", async () => {
    const calls = [];
    const record = await readWindowsTokenRecord(createStore(), DISPLAY_NAME, {
      execFileWithInput: async (command, args, input) => {
        calls.push({ command, args, input });
        return { stdout: JSON.stringify({ access_token: "token" }) };
      },
    });

    assert.deepEqual(record, { access_token: "token" });
    assert.deepEqual(calls, [
      {
        command: "powershell.exe",
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", HELPER, "read", TARGET],
        input: undefined,
      },
    ]);
  });

  it("record がなければ null を返す", async () => {
    const result = await readWindowsTokenRecord(createStore(), DISPLAY_NAME, {
      execFileWithInput: async () => {
        const err = new Error("not found");
        err.code = 3;
        throw err;
      },
    });

    assert.equal(result, null);
  });

  it("PowerShell helper へ record を stdin で渡す", async () => {
    const calls = [];
    const record = { access_token: "token", refresh_token: "refresh" };
    const store = createStore();
    const result = await writeWindowsTokenRecord(store, record, {
      execFileWithInput: async (command, args, input) => {
        calls.push({ command, args, input });
        return { stdout: "" };
      },
    });

    assert.equal(result, store);
    assert.deepEqual(calls, [
      {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          HELPER,
          "write",
          TARGET,
          ACCOUNT,
        ],
        input: JSON.stringify(record),
      },
    ]);
  });

  it("WSL では変換した helper path を使う", async () => {
    const calls = [];
    await writeWindowsTokenRecord(
      createStore({}, "wsl"),
      { access_token: "token" },
      {
        execFileAsync: async () => ({ stdout: "C:\\repo\\windows-credential.ps1\n" }),
        execFileWithInput: async (command, args, input) => {
          calls.push({ command, args, input });
          return { stdout: "" };
        },
      }
    );

    assert.equal(calls[0].args[4], "C:\\repo\\windows-credential.ps1");
  });

  it("WSL では変換した helper path から record を読む", async () => {
    const calls = [];
    const record = await readWindowsTokenRecord(createStore({}, "wsl"), DISPLAY_NAME, {
      execFileAsync: async () => ({ stdout: "C:\\repo\\windows-credential.ps1\n" }),
      execFileWithInput: async (command, args, input) => {
        calls.push({ command, args, input });
        return { stdout: JSON.stringify({ access_token: "token" }) };
      },
    });

    assert.deepEqual(record, { access_token: "token" });
    assert.deepEqual(calls, [
      {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "C:\\repo\\windows-credential.ps1",
          "read",
          TARGET,
        ],
        input: undefined,
      },
    ]);
  });

  it("Credential Manager item の削除結果を返す", async () => {
    const store = createStore();
    const calls = [];
    const deleted = await deleteWindowsTokenRecord(store, DISPLAY_NAME, {
      execFileWithInput: async (command, args, input) => {
        calls.push({ command, args, input });
        return { stdout: "" };
      },
    });
    const missing = await deleteWindowsTokenRecord(store, DISPLAY_NAME, {
      execFileWithInput: async () => {
        const err = new Error("not found");
        err.code = 3;
        throw err;
      },
    });

    assert.deepEqual(deleted, { store, deleted: true });
    assert.deepEqual(missing, { store, deleted: false });
    assert.deepEqual(calls, [
      {
        command: "powershell.exe",
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", HELPER, "delete", TARGET],
        input: undefined,
      },
    ]);
  });

  it("WSL では変換した helper path で record を削除する", async () => {
    const calls = [];
    const result = await deleteWindowsTokenRecord(createStore({}, "wsl"), DISPLAY_NAME, {
      execFileAsync: async () => ({ stdout: "C:\\repo\\windows-credential.ps1\n" }),
      execFileWithInput: async (command, args, input) => {
        calls.push({ command, args, input });
        return { stdout: "" };
      },
    });

    assert.equal(result.deleted, true);
    assert.equal(calls[0].args[4], "C:\\repo\\windows-credential.ps1");
  });
});
