"use strict";

const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const SERVICE = "scoped-connectors/slack";
const ACCOUNT = "default";

function detectTokenStore(options = {}) {
  const platform = options.platform || process.platform;
  if (platform === "darwin") {
    return { type: "keychain", service: SERVICE, account: ACCOUNT };
  }
  throw new Error("Slack token store は macOS Keychain のみ対応しています。");
}

function describeTokenStore(options = {}) {
  const store = detectTokenStore(options);
  return `macOS Keychain (${store.service}/${store.account})`;
}

async function readTokenRecord(options = {}) {
  const store = detectTokenStore(options);
  const runExecFile = options.execFileAsync || execFileAsync;
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

async function writeTokenRecord(record, options = {}) {
  const store = detectTokenStore(options);
  const runExecFile = options.execFileAsync || execFileAsync;
  const payload = JSON.stringify(record);

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

async function deleteTokenRecord(options = {}) {
  const store = detectTokenStore(options);
  const runExecFile = options.execFileAsync || execFileAsync;
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

module.exports = {
  SERVICE,
  ACCOUNT,
  detectTokenStore,
  describeTokenStore,
  readTokenRecord,
  writeTokenRecord,
  deleteTokenRecord,
};
