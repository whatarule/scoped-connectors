"use strict";

const path = require("node:path");
const { createSecureTokenStore } = require("./_shared/secure-token-store");

const SERVICE = "scoped-connectors/slack";
const ACCOUNT = "default";
const WINDOWS_TARGET = `${SERVICE}/${ACCOUNT}`;
const WINDOWS_HELPER = path.join(__dirname, "_shared", "windows-credential.ps1");

const tokenStore = createSecureTokenStore({
  service: SERVICE,
  account: ACCOUNT,
  displayName: "Slack",
  windowsHelperPath: WINDOWS_HELPER,
});

module.exports = {
  SERVICE,
  ACCOUNT,
  WINDOWS_TARGET,
  WINDOWS_HELPER,
  ...tokenStore,
};
