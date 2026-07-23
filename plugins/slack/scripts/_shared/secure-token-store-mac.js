"use strict";

const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function createMacTokenStore(config) {
  return {
    type: "keychain",
    service: config.service,
    account: config.account,
  };
}

function describeMacTokenStore(store) {
  return `macOS Keychain (${store.service}/${store.account})`;
}

// security find-generic-password -w は、値に非 ASCII バイトが含まれると hex で出力する。
// JSON payload は "{" 始まりで hex 文字列にはならないため誤検知しない。
function decodeKeychainPayload(raw) {
  if (/^[0-9a-f]+$/i.test(raw) && raw.length % 2 === 0) {
    return Buffer.from(raw, "hex").toString("utf8");
  }
  return raw;
}

async function readMacTokenRecord(store, displayName, options = {}) {
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
    return JSON.parse(decodeKeychainPayload(stdout.trim()));
  } catch (err) {
    if (err.code === 44 || /could not be found/i.test(err.stderr || "")) {
      return null;
    }
    throw new Error(`Keychain から ${displayName} token を読み取れませんでした。`);
  }
}

async function writeMacTokenRecord(store, record, options = {}) {
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

async function deleteMacTokenRecord(store, displayName, options = {}) {
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
    throw new Error(`Keychain から ${displayName} token を削除できませんでした。`);
  }
}

module.exports = {
  createMacTokenStore,
  describeMacTokenStore,
  decodeKeychainPayload,
  readMacTokenRecord,
  writeMacTokenRecord,
  deleteMacTokenRecord,
};
