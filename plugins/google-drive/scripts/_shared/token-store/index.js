"use strict";

const {
  createMacTokenStore,
  describeMacTokenStore,
  readMacTokenRecord,
  writeMacTokenRecord,
  deleteMacTokenRecord,
} = require("./mac-keychain");
const {
  isWsl,
  createWindowsTokenStore,
  describeWindowsTokenStore,
  readWindowsTokenRecord,
  writeWindowsTokenRecord,
  deleteWindowsTokenRecord,
} = require("./windows-credential-manager");

function createSecureTokenStore(config) {
  const service = config.service;
  const account = config.account || "default";
  const displayName = config.displayName;
  const windowsTarget = `${service}/${account}`;
  const windowsHelperPath = config.windowsHelperPath;
  const adapterConfig = {
    service,
    account,
    windowsTarget,
    windowsHelperPath,
  };

  function detectTokenStore(options = {}) {
    const platform = options.platform || process.platform;
    if (platform === "darwin") {
      return createMacTokenStore(adapterConfig);
    }
    if (platform === "win32") {
      return createWindowsTokenStore(adapterConfig, options);
    }
    if (platform === "linux" && isWsl(options)) {
      return createWindowsTokenStore(adapterConfig, options, "wsl");
    }
    throw new Error(`${displayName} token store は macOS Keychain または Windows Credential Manager のみ対応しています。`);
  }

  function describeTokenStore(options = {}) {
    const store = detectTokenStore(options);
    if (store.type === "keychain") {
      return describeMacTokenStore(store);
    }
    return describeWindowsTokenStore(store);
  }

  async function readTokenRecord(options = {}) {
    const store = detectTokenStore(options);
    if (store.type === "keychain") {
      return readMacTokenRecord(store, displayName, options);
    }
    return readWindowsTokenRecord(store, displayName, options);
  }

  async function writeTokenRecord(record, options = {}) {
    const store = detectTokenStore(options);
    if (store.type === "keychain") {
      return writeMacTokenRecord(store, record, options);
    }
    return writeWindowsTokenRecord(store, record, options);
  }

  async function deleteTokenRecord(options = {}) {
    const store = detectTokenStore(options);
    if (store.type === "keychain") {
      return deleteMacTokenRecord(store, displayName, options);
    }
    return deleteWindowsTokenRecord(store, displayName, options);
  }

  return {
    describeTokenStore,
    readTokenRecord,
    writeTokenRecord,
    deleteTokenRecord,
  };
}

module.exports = {
  createSecureTokenStore,
};
