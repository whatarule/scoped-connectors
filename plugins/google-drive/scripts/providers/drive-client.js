"use strict";

const { fetchDriveApi, fetchDriveApiRaw } = require("../common");

const FILE_METADATA_FIELDS = "id,name,mimeType,size";

function filePath(fileId) {
  return `files/${encodeURIComponent(fileId)}`;
}

function createDriveClient(options = {}) {
  const fetchDriveApiImpl = options.fetchDriveApi || fetchDriveApi;
  const fetchDriveApiRawImpl = options.fetchDriveApiRaw || fetchDriveApiRaw;

  async function fetchJson(apiPath, params) {
    return (await fetchDriveApiImpl(apiPath, params)).data;
  }

  async function getFileMetadata(fileId) {
    return fetchJson(filePath(fileId), {
      fields: FILE_METADATA_FIELDS,
      supportsAllDrives: true,
    });
  }

  async function exportFile(fileId, exportMime) {
    return (
      await fetchDriveApiRawImpl(`${filePath(fileId)}/export`, {
        mimeType: exportMime,
      })
    ).buffer;
  }

  async function downloadFile(fileId) {
    return (
      await fetchDriveApiRawImpl(filePath(fileId), {
        alt: "media",
        supportsAllDrives: true,
      })
    ).buffer;
  }

  return {
    fetchJson,
    getFileMetadata,
    exportFile,
    downloadFile,
  };
}

const defaultDriveClient = createDriveClient();

module.exports = {
  FILE_METADATA_FIELDS,
  filePath,
  createDriveClient,
  fetchJson: defaultDriveClient.fetchJson,
  getFileMetadata: defaultDriveClient.getFileMetadata,
  exportFile: defaultDriveClient.exportFile,
  downloadFile: defaultDriveClient.downloadFile,
};
