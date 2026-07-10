"use strict";

const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const SERVICE = "scoped-connectors/slack";
const ACCOUNT = "default";
const WINDOWS_TARGET = `${SERVICE}/${ACCOUNT}`;
const WINDOWS_HELPER = path.join(__dirname, "windows-credential.ps1");

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

function detectTokenStore(options = {}) {
  const platform = options.platform || process.platform;
  if (platform === "darwin") {
    return { type: "keychain", service: SERVICE, account: ACCOUNT };
  }
  if (platform === "win32") {
    return {
      type: "windows-credential-manager",
      target: WINDOWS_TARGET,
      username: ACCOUNT,
      helperPath: options.windowsHelperPath || WINDOWS_HELPER,
    };
  }
  if (platform === "linux" && isWsl(options)) {
    return {
      type: "windows-credential-manager",
      target: WINDOWS_TARGET,
      username: ACCOUNT,
      helperPath: options.windowsHelperPath || WINDOWS_HELPER,
      bridge: "wsl",
    };
  }
  throw new Error("Slack token store は macOS Keychain または Windows Credential Manager のみ対応しています。");
}

function describeTokenStore(options = {}) {
  const store = detectTokenStore(options);
  if (store.type === "keychain") {
    return `macOS Keychain (${store.service}/${store.account})`;
  }
  const bridge = store.bridge === "wsl" ? " via WSL" : "";
  return `Windows Credential Manager (${store.target})${bridge}`;
}

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
    throw new Error("WSL から windows-credential.ps1 の Windows path を解決できませんでした。wslpath が使える環境で実行してください。");
  }
}

async function readTokenRecord(options = {}) {
  const store = detectTokenStore(options);
  const runExecFile = options.execFileAsync || execFileAsync;
  const runExecFileWithInput = options.execFileWithInput || execFileWithInput;
  if (store.type === "keychain") {
    try {
      const { stdout } = await runExecFile("security", [
        "find-generic-password",
        "-s",
        store.service,
        "-a",
        store.account,
        "-w",
      ]);
      return JSON.parse(stdout.trim());
    } catch (err) {
      if (err.code === 44 || /could not be found/i.test(err.stderr || "")) {
        return null;
      }
      throw new Error("Keychain から Slack token を読み取れませんでした。");
    }
  }

  const helperPath = await resolveWindowsHelperPath(store, options);
  try {
    const { stdout } = await runExecFileWithInput("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      helperPath,
      "read",
      store.target,
    ]);
    return JSON.parse(stdout.trim());
  } catch (err) {
    if (err.code === 3) return null;
    throw new Error("Windows Credential Manager から Slack token を読み取れませんでした。");
  }
}

async function writeTokenRecord(record, options = {}) {
  const store = detectTokenStore(options);
  const runExecFile = options.execFileAsync || execFileAsync;
  const runExecFileWithInput = options.execFileWithInput || execFileWithInput;
  const payload = JSON.stringify(record);

  if (store.type === "keychain") {
    await runExecFile("security", [
      "add-generic-password",
      "-U",
      "-s",
      store.service,
      "-a",
      store.account,
      "-w",
      payload,
    ]);
    return store;
  }

  const helperPath = await resolveWindowsHelperPath(store, options);
  await runExecFileWithInput(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      helperPath,
      "write",
      store.target,
      store.username,
    ],
    payload
  );
  return store;
}

async function deleteTokenRecord(options = {}) {
  const store = detectTokenStore(options);
  const runExecFile = options.execFileAsync || execFileAsync;
  const runExecFileWithInput = options.execFileWithInput || execFileWithInput;
  if (store.type === "keychain") {
    try {
      await runExecFile("security", [
        "delete-generic-password",
        "-s",
        store.service,
        "-a",
        store.account,
      ]);
      return { store, deleted: true };
    } catch (err) {
      if (err.code === 44 || /could not be found/i.test(err.stderr || "")) {
        return { store, deleted: false };
      }
      throw new Error("Keychain から Slack token を削除できませんでした。");
    }
  }

  const helperPath = await resolveWindowsHelperPath(store, options);
  try {
    await runExecFileWithInput("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      helperPath,
      "delete",
      store.target,
    ]);
    return { store, deleted: true };
  } catch (err) {
    if (err.code === 3) return { store, deleted: false };
    throw new Error("Windows Credential Manager から Slack token を削除できませんでした。");
  }
}

module.exports = {
  SERVICE,
  ACCOUNT,
  WINDOWS_TARGET,
  WINDOWS_HELPER,
  isWsl,
  detectTokenStore,
  describeTokenStore,
  execFileWithInput,
  resolveWindowsHelperPath,
  readTokenRecord,
  writeTokenRecord,
  deleteTokenRecord,
};
