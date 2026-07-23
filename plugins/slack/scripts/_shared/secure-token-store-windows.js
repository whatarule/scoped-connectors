"use strict";

const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function isWsl(options = {}) {
  const env = options.env || process.env;
  if (env.WSL_INTEROP || env.WSL_DISTRO_NAME) {
    return true;
  }

  if (options.procVersion !== undefined) {
    return /microsoft|wsl/i.test(String(options.procVersion));
  }

  const readFileSync = options.readFileSync || fs.readFileSync;
  try {
    return /microsoft|wsl/i.test(readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

// powershell.exe -File で起動した helper が stdin を読めるため、必要な payload を渡せる実行 wrapper。
function execFileWithInput(command, args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const err = new Error(stderr.trim() || `${command} exited with ${code}`);
      err.code = code;
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    });

    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

function createWindowsTokenStore(config, options = {}, bridge = "") {
  const store = {
    type: "windows-credential-manager",
    target: config.windowsTarget,
    username: config.account,
    helperPath: options.windowsHelperPath || config.windowsHelperPath,
  };
  if (bridge) {
    store.bridge = bridge;
  }
  return store;
}

function describeWindowsTokenStore(store) {
  const bridge = store.bridge === "wsl" ? " via WSL" : "";
  return `Windows Credential Manager (${store.target})${bridge}`;
}

async function resolveWindowsHelperPath(store, options = {}) {
  if (store.bridge !== "wsl") {
    return store.helperPath;
  }

  const runExecFile = options.execFileAsync || execFileAsync;
  try {
    const { stdout } = await runExecFile("wslpath", ["-w", store.helperPath]);
    const converted = stdout.trim();
    if (!converted) {
      throw new Error("empty path");
    }
    return converted;
  } catch {
    throw new Error(
      "WSL から windows-credential.ps1 の Windows path を解決できませんでした。wslpath が使える環境で実行してください。"
    );
  }
}

function windowsCredentialArgs(helperPath, action, ...args) {
  return [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    helperPath,
    action,
    ...args,
  ];
}

async function readWindowsTokenRecord(store, displayName, options = {}) {
  const runExecFileWithInput = options.execFileWithInput || execFileWithInput;
  const helperPath = await resolveWindowsHelperPath(store, options);
  try {
    const { stdout } = await runExecFileWithInput(
      "powershell.exe",
      windowsCredentialArgs(helperPath, "read", store.target)
    );
    return JSON.parse(stdout.trim());
  } catch (err) {
    if (err.code === 3) return null;
    throw new Error(`Windows Credential Manager から ${displayName} token を読み取れませんでした。`);
  }
}

async function writeWindowsTokenRecord(store, record, options = {}) {
  const runExecFileWithInput = options.execFileWithInput || execFileWithInput;
  const helperPath = await resolveWindowsHelperPath(store, options);
  const payload = JSON.stringify(record);
  await runExecFileWithInput(
    "powershell.exe",
    windowsCredentialArgs(helperPath, "write", store.target, store.username),
    payload
  );
  return store;
}

async function deleteWindowsTokenRecord(store, displayName, options = {}) {
  const runExecFileWithInput = options.execFileWithInput || execFileWithInput;
  const helperPath = await resolveWindowsHelperPath(store, options);
  try {
    await runExecFileWithInput("powershell.exe", windowsCredentialArgs(helperPath, "delete", store.target));
    return { store, deleted: true };
  } catch (err) {
    if (err.code === 3) return { store, deleted: false };
    throw new Error(`Windows Credential Manager から ${displayName} token を削除できませんでした。`);
  }
}

module.exports = {
  isWsl,
  execFileWithInput,
  createWindowsTokenStore,
  describeWindowsTokenStore,
  resolveWindowsHelperPath,
  readWindowsTokenRecord,
  writeWindowsTokenRecord,
  deleteWindowsTokenRecord,
};
