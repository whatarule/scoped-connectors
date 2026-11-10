"use strict";

const path = require("node:path");
const { createSecureTokenStore } = require("../_shared/token-store");
const { DEFAULT_PROFILE, normalizeProfileName } = require("../settings/config");

const SERVICE = "scoped-connectors/google-drive";
const ACCOUNT = DEFAULT_PROFILE;
const WINDOWS_TARGET = `${SERVICE}/${ACCOUNT}`;
const WINDOWS_HELPER = path.join(__dirname, "..", "_shared", "token-store", "windows-credential.ps1");

function createProfileTokenStore(profile = DEFAULT_PROFILE) {
  const account = normalizeProfileName(profile, "Google Drive profile");
  return createSecureTokenStore({
    service: SERVICE,
    account,
    displayName: "Google Drive",
    windowsHelperPath: WINDOWS_HELPER,
  });
}

function splitProfileOptions(options = {}) {
  const profile = options.profile || DEFAULT_PROFILE;
  const adapterOptions = { ...options };
  delete adapterOptions.profile;
  return { profile, adapterOptions };
}

function describeTokenStore(options = {}) {
  const { profile, adapterOptions } = splitProfileOptions(options);
  return createProfileTokenStore(profile).describeTokenStore(adapterOptions);
}

async function readTokenRecord(options = {}) {
  const { profile, adapterOptions } = splitProfileOptions(options);
  return createProfileTokenStore(profile).readTokenRecord(adapterOptions);
}

async function writeTokenRecord(record, options = {}) {
  const { profile, adapterOptions } = splitProfileOptions(options);
  return createProfileTokenStore(profile).writeTokenRecord(record, adapterOptions);
}

async function deleteTokenRecord(options = {}) {
  const { profile, adapterOptions } = splitProfileOptions(options);
  return createProfileTokenStore(profile).deleteTokenRecord(adapterOptions);
}

module.exports = {
  SERVICE,
  ACCOUNT,
  WINDOWS_TARGET,
  WINDOWS_HELPER,
  createProfileTokenStore,
  describeTokenStore,
  readTokenRecord,
  writeTokenRecord,
  deleteTokenRecord,
};
