const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createSecureTokenStore,
  isWsl,
} = require("../scripts/token-store");

const SERVICE = "scoped-connectors/test";
const ACCOUNT = "default";
const WINDOWS_TARGET = `${SERVICE}/${ACCOUNT}`;
const WSL_ENV = { WSL_DISTRO_NAME: "Ubuntu" };

function createTestStore() {
  return createSecureTokenStore({
    service: SERVICE,
    account: ACCOUNT,
    displayName: "Test Connector",
    windowsHelperPath: "/repo/windows-credential.ps1",
  });
}

describe("createSecureTokenStore", () => {
  it("互換 export を持つ provider wrapper 用 facade を返す", () => {
    const store = createTestStore();
    for (const name of [
      "isWsl",
      "detectTokenStore",
      "describeTokenStore",
      "decodeKeychainPayload",
      "execFileWithInput",
      "resolveWindowsHelperPath",
      "readTokenRecord",
      "writeTokenRecord",
      "deleteTokenRecord",
    ]) {
      assert.equal(typeof store[name], "function", name);
    }
  });

  it("macOS / Windows / WSL の store を検出する", () => {
    const store = createTestStore();

    assert.deepEqual(store.detectTokenStore({ platform: "darwin" }), {
      type: "keychain",
      service: SERVICE,
      account: ACCOUNT,
    });
    assert.deepEqual(store.detectTokenStore({ platform: "win32" }), {
      type: "windows-credential-manager",
      target: WINDOWS_TARGET,
      username: ACCOUNT,
      helperPath: "/repo/windows-credential.ps1",
    });
    assert.deepEqual(store.detectTokenStore({ platform: "linux", env: WSL_ENV }), {
      type: "windows-credential-manager",
      target: WINDOWS_TARGET,
      username: ACCOUNT,
      helperPath: "/repo/windows-credential.ps1",
      bridge: "wsl",
    });
  });

  it("通常 Linux では file fallback せず displayName 入りで失敗する", () => {
    const store = createTestStore();
    assert.throws(
      () => store.detectTokenStore({ platform: "linux", env: {}, procVersion: "Linux version" }),
      /Test Connector token store/
    );
  });
});

describe("isWsl", () => {
  it("環境変数または /proc/version から WSL を判定する", () => {
    assert.equal(isWsl({ env: WSL_ENV }), true);
    assert.equal(isWsl({ env: {}, procVersion: "Linux version 5.15.90.1-microsoft-standard-WSL2" }), true);
    assert.equal(isWsl({ env: {}, procVersion: "Linux version 6.8.0" }), false);
  });
});

describe("macOS adapter", () => {
  it("Keychain hex 出力を UTF-8 JSON として復元する", () => {
    const store = createTestStore();
    const payload = JSON.stringify({ access_token: "token", name: "山田 太郎" });
    assert.equal(store.decodeKeychainPayload(Buffer.from(payload, "utf8").toString("hex")), payload);
  });

  it("record がなければ null を返し、write/delete は Keychain command を使う", async () => {
    const store = createTestStore();
    const calls = [];

    assert.equal(
      await store.readTokenRecord({
        platform: "darwin",
        execFileAsync: async () => {
          const err = new Error("not found");
          err.code = 44;
          throw err;
        },
      }),
      null
    );

    await store.writeTokenRecord(
      { access_token: "token" },
      {
        platform: "darwin",
        execFileAsync: async (command, args) => {
          calls.push({ command, args });
          return { stdout: "" };
        },
      }
    );
    const deleteResult = await store.deleteTokenRecord({
      platform: "darwin",
      execFileAsync: async (command, args) => {
        calls.push({ command, args });
        return { stdout: "" };
      },
    });

    assert.equal(deleteResult.deleted, true);
    assert.deepEqual(calls, [
      {
        command: "security",
        args: ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-w", JSON.stringify({ access_token: "token" })],
      },
      {
        command: "security",
        args: ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT],
      },
    ]);
  });
});

describe("Windows adapter", () => {
  it("Windows Credential Manager helper へ write payload を stdin で渡す", async () => {
    const store = createTestStore();
    const calls = [];
    const record = { access_token: "token", refresh_token: "refresh" };

    await store.writeTokenRecord(record, {
      platform: "win32",
      execFileWithInput: async (command, args, input) => {
        calls.push({ command, args, input });
        return { stdout: "" };
      },
    });

    assert.deepEqual(calls, [
      {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "/repo/windows-credential.ps1",
          "write",
          WINDOWS_TARGET,
          ACCOUNT,
        ],
        input: JSON.stringify(record),
      },
    ]);
  });

  it("Windows record missing は null / deleted=false にする", async () => {
    const store = createTestStore();
    const options = {
      platform: "win32",
      execFileWithInput: async () => {
        const err = new Error("not found");
        err.code = 3;
        throw err;
      },
    };

    assert.equal(await store.readTokenRecord(options), null);
    assert.deepEqual(await store.deleteTokenRecord(options), {
      store: {
        type: "windows-credential-manager",
        target: WINDOWS_TARGET,
        username: ACCOUNT,
        helperPath: "/repo/windows-credential.ps1",
      },
      deleted: false,
    });
  });

  it("WSL では helper path を Windows path に変換して読む", async () => {
    const store = createTestStore();
    const execCalls = [];
    const powershellCalls = [];
    const record = await store.readTokenRecord({
      platform: "linux",
      env: WSL_ENV,
      execFileAsync: async (command, args) => {
        execCalls.push({ command, args });
        return { stdout: "C:\\repo\\windows-credential.ps1\r\n" };
      },
      execFileWithInput: async (command, args, input) => {
        powershellCalls.push({ command, args, input });
        return { stdout: JSON.stringify({ access_token: "token" }) };
      },
    });

    assert.deepEqual(record, { access_token: "token" });
    assert.deepEqual(execCalls, [{ command: "wslpath", args: ["-w", "/repo/windows-credential.ps1"] }]);
    assert.deepEqual(powershellCalls, [
      {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "C:\\repo\\windows-credential.ps1",
          "read",
          WINDOWS_TARGET,
        ],
        input: undefined,
      },
    ]);
  });
});
