const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  SERVICE,
  ACCOUNT,
  WINDOWS_TARGET,
  isWsl,
  detectTokenStore,
  describeTokenStore,
  resolveWindowsHelperPath,
  readTokenRecord,
  writeTokenRecord,
  deleteTokenRecord,
} = require("../token-store");

const WSL_ENV = { WSL_DISTRO_NAME: "Ubuntu" };

describe("detectTokenStore", () => {
  it("macOS では Keychain を使う", () => {
    assert.deepEqual(detectTokenStore({ platform: "darwin" }), {
      type: "keychain",
      service: SERVICE,
      account: ACCOUNT,
    });
  });

  it("Windows では Credential Manager を使う", () => {
    const store = detectTokenStore({
      platform: "win32",
      windowsHelperPath: "helper.ps1",
    });

    assert.equal(store.type, "windows-credential-manager");
    assert.equal(store.target, WINDOWS_TARGET);
    assert.equal(store.username, ACCOUNT);
    assert.equal(store.helperPath, "helper.ps1");
  });

  it("WSL では Windows Credential Manager を bridge する", () => {
    const store = detectTokenStore({
      platform: "linux",
      env: WSL_ENV,
      windowsHelperPath: "/repo/helper.ps1",
    });

    assert.equal(store.type, "windows-credential-manager");
    assert.equal(store.bridge, "wsl");
    assert.equal(store.target, WINDOWS_TARGET);
    assert.equal(store.username, ACCOUNT);
    assert.equal(store.helperPath, "/repo/helper.ps1");
  });

  it("Linux では token file fallback せず失敗する", () => {
    assert.throws(() => detectTokenStore({ platform: "linux", env: {}, procVersion: "Linux version" }), /macOS Keychain/);
  });
});

describe("isWsl", () => {
  it("WSL 環境変数で WSL と判定する", () => {
    assert.equal(isWsl({ env: WSL_ENV }), true);
  });

  it("/proc/version の Microsoft 表記で WSL と判定する", () => {
    assert.equal(isWsl({ env: {}, procVersion: "Linux version 5.15.90.1-microsoft-standard-WSL2" }), true);
  });

  it("WSL 情報がなければ false を返す", () => {
    assert.equal(isWsl({ env: {}, procVersion: "Linux version 6.8.0" }), false);
  });
});

describe("describeTokenStore", () => {
  it("Keychain store の説明を返す", () => {
    assert.equal(describeTokenStore({ platform: "darwin" }), `macOS Keychain (${SERVICE}/${ACCOUNT})`);
  });

  it("Windows store の説明を返す", () => {
    assert.equal(
      describeTokenStore({ platform: "win32", windowsHelperPath: "helper.ps1" }),
      `Windows Credential Manager (${WINDOWS_TARGET})`
    );
  });

  it("WSL bridge の説明を返す", () => {
    assert.equal(
      describeTokenStore({ platform: "linux", env: WSL_ENV, windowsHelperPath: "/repo/helper.ps1" }),
      `Windows Credential Manager (${WINDOWS_TARGET}) via WSL`
    );
  });
});

describe("resolveWindowsHelperPath", () => {
  it("WSL で wslpath が使えなければ分かりやすく失敗する", async () => {
    const store = detectTokenStore({
      platform: "linux",
      env: WSL_ENV,
      windowsHelperPath: "/repo/helper.ps1",
    });

    await assert.rejects(
      () =>
        resolveWindowsHelperPath(store, {
          execFileAsync: async () => {
            throw new Error("wslpath not found");
          },
        }),
      /wslpath/
    );
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

  it("Windows では PowerShell helper から token record を読む", async () => {
    const calls = [];
    const record = await readTokenRecord({
      platform: "win32",
      windowsHelperPath: "helper.ps1",
      execFileWithInput: async (command, args, input) => {
        calls.push({ command, args, input });
        return { stdout: JSON.stringify({ access_token: "xoxp-test" }) };
      },
    });

    assert.deepEqual(record, { access_token: "xoxp-test" });
    assert.deepEqual(calls, [
      {
        command: "powershell.exe",
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "helper.ps1", "read", WINDOWS_TARGET],
        input: undefined,
      },
    ]);
  });

  it("Windows Credential Manager に record がなければ null を返す", async () => {
    const record = await readTokenRecord({
      platform: "win32",
      windowsHelperPath: "helper.ps1",
      execFileWithInput: async () => {
        const err = new Error("not found");
        err.code = 3;
        throw err;
      },
    });

    assert.equal(record, null);
  });

  it("WSL では helper path を Windows path に変換して token record を読む", async () => {
    const execCalls = [];
    const powershellCalls = [];
    const record = await readTokenRecord({
      platform: "linux",
      env: WSL_ENV,
      windowsHelperPath: "/repo/helper.ps1",
      execFileAsync: async (command, args) => {
        execCalls.push({ command, args });
        return { stdout: "C:\\repo\\helper.ps1\r\n" };
      },
      execFileWithInput: async (command, args, input) => {
        powershellCalls.push({ command, args, input });
        return { stdout: JSON.stringify({ access_token: "xoxp-wsl" }) };
      },
    });

    assert.deepEqual(record, { access_token: "xoxp-wsl" });
    assert.deepEqual(execCalls, [{ command: "wslpath", args: ["-w", "/repo/helper.ps1"] }]);
    assert.deepEqual(powershellCalls, [
      {
        command: "powershell.exe",
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "C:\\repo\\helper.ps1", "read", WINDOWS_TARGET],
        input: undefined,
      },
    ]);
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

  it("Windows では PowerShell helper へ token record を stdin で渡す", async () => {
    const calls = [];
    const record = { access_token: "xoxp-test", refresh_token: "xoxe-refresh" };
    const store = await writeTokenRecord(
      record,
      {
        platform: "win32",
        windowsHelperPath: "helper.ps1",
        execFileWithInput: async (command, args, input) => {
          calls.push({ command, args, input });
          return { stdout: "" };
        },
      }
    );

    assert.equal(store.type, "windows-credential-manager");
    assert.deepEqual(calls, [
      {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "helper.ps1",
          "write",
          WINDOWS_TARGET,
          ACCOUNT,
        ],
        input: JSON.stringify(record),
      },
    ]);
  });

  it("WSL では Windows path に変換した helper へ token record を stdin で渡す", async () => {
    const execCalls = [];
    const powershellCalls = [];
    const record = { access_token: "xoxp-wsl", refresh_token: "xoxe-refresh" };
    const store = await writeTokenRecord(
      record,
      {
        platform: "linux",
        env: WSL_ENV,
        windowsHelperPath: "/repo/helper.ps1",
        execFileAsync: async (command, args) => {
          execCalls.push({ command, args });
          return { stdout: "C:\\repo\\helper.ps1\n" };
        },
        execFileWithInput: async (command, args, input) => {
          powershellCalls.push({ command, args, input });
          return { stdout: "" };
        },
      }
    );

    assert.equal(store.type, "windows-credential-manager");
    assert.equal(store.bridge, "wsl");
    assert.deepEqual(execCalls, [{ command: "wslpath", args: ["-w", "/repo/helper.ps1"] }]);
    assert.deepEqual(powershellCalls, [
      {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "C:\\repo\\helper.ps1",
          "write",
          WINDOWS_TARGET,
          ACCOUNT,
        ],
        input: JSON.stringify(record),
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

  it("Windows では PowerShell helper で token record を削除する", async () => {
    const calls = [];
    const result = await deleteTokenRecord({
      platform: "win32",
      windowsHelperPath: "helper.ps1",
      execFileWithInput: async (command, args, input) => {
        calls.push({ command, args, input });
        return { stdout: "" };
      },
    });

    assert.equal(result.deleted, true);
    assert.deepEqual(calls, [
      {
        command: "powershell.exe",
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "helper.ps1", "delete", WINDOWS_TARGET],
        input: undefined,
      },
    ]);
  });

  it("Windows Credential Manager に record がなければ deleted=false を返す", async () => {
    const result = await deleteTokenRecord({
      platform: "win32",
      windowsHelperPath: "helper.ps1",
      execFileWithInput: async () => {
        const err = new Error("not found");
        err.code = 3;
        throw err;
      },
    });

    assert.equal(result.deleted, false);
  });

  it("WSL では Windows path に変換した helper で token record を削除する", async () => {
    const execCalls = [];
    const powershellCalls = [];
    const result = await deleteTokenRecord({
      platform: "linux",
      env: WSL_ENV,
      windowsHelperPath: "/repo/helper.ps1",
      execFileAsync: async (command, args) => {
        execCalls.push({ command, args });
        return { stdout: "C:\\repo\\helper.ps1\n" };
      },
      execFileWithInput: async (command, args, input) => {
        powershellCalls.push({ command, args, input });
        return { stdout: "" };
      },
    });

    assert.equal(result.deleted, true);
    assert.deepEqual(execCalls, [{ command: "wslpath", args: ["-w", "/repo/helper.ps1"] }]);
    assert.deepEqual(powershellCalls, [
      {
        command: "powershell.exe",
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "C:\\repo\\helper.ps1", "delete", WINDOWS_TARGET],
        input: undefined,
      },
    ]);
  });
});
