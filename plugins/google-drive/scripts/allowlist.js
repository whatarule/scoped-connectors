"use strict";

const {
  CONFIG_PATH_ENV,
  DEFAULT_CONFIG_PATH,
  FOLDER_ID_PATTERN,
  getConfigPath,
  loadReadSettings,
} = require("./settings/google-drive");
const {
  MAX_ANCESTOR_DEPTH,
  verifyFileInAllowedFolders,
} = require("./policy/google-read");

function loadAllowlist(configPath = getConfigPath()) {
  const { allowedFolderIds } = loadReadSettings(configPath);
  return { allowedFolderIds };
}

async function verifyFileInAllowlist(fileId, { allowedFolderIds, fetchJson }) {
  async function getParents(id) {
    const data = await fetchJson(`files/${encodeURIComponent(id)}`, {
      fields: "id,parents",
      supportsAllDrives: true,
    });
    return data && Array.isArray(data.parents) ? data.parents : [];
  }

  return verifyFileInAllowedFolders(fileId, { allowedFolderIds, getParents });
}

module.exports = {
  CONFIG_PATH_ENV,
  DEFAULT_CONFIG_PATH,
  FOLDER_ID_PATTERN,
  MAX_ANCESTOR_DEPTH,
  getConfigPath,
  loadAllowlist,
  verifyFileInAllowlist,
};
