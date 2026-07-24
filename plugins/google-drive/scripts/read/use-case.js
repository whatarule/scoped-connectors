"use strict";

const {
  getConfigPath,
  loadAllowlist,
  verifyFileInAllowlist,
  FOLDER_ID_PATTERN,
} = require("./access-control");
const defaultDriveClient = require("../providers/drive-client");
const {
  GOOGLE_SHEET,
  MAX_MEDIA_BYTES,
  resolveReadPlan,
} = require("./contract");

function extractFileId(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("ファイルID または Drive の URL を指定してください。");
  }
  if (FOLDER_ID_PATTERN.test(trimmed)) {
    return { id: trimmed, isFolderUrl: false };
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch (_err) {
    throw new Error(`ファイルID または Drive の URL として解釈できません: ${trimmed}`);
  }
  if (!/(^|\.)google\.com$/.test(url.hostname)) {
    throw new Error(`Google Drive の URL ではありません: ${url.hostname}`);
  }

  const folderMatch = url.pathname.match(/\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)/);
  if (folderMatch) {
    return { id: folderMatch[1], isFolderUrl: true };
  }

  const docMatch = url.pathname.match(
    /\/(?:document|spreadsheets|presentation|file)\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/
  );
  if (docMatch) {
    return { id: docMatch[1], isFolderUrl: false };
  }

  const idParam = url.searchParams.get("id");
  if (idParam && FOLDER_ID_PATTERN.test(idParam)) {
    return { id: idParam, isFolderUrl: false };
  }

  throw new Error(`URL からファイルIDを抽出できません: ${trimmed}`);
}

function buildMissingAllowlistError(configPath) {
  return new Error(
    [
      `許可フォルダが設定されていません（${configPath}）。`,
      "参照を許可するフォルダの ID を設定してください:",
      '{ "allowedFolderIds": ["<フォルダID>"] }',
      "フォルダIDは Drive のフォルダ URL の folders/ 以降の文字列です。詳細は SETUP.md を参照してください。",
    ].join("\n")
  );
}

async function readDriveFile(options, deps = {}) {
  const driveClient = deps.driveClient || defaultDriveClient.createDriveClient({
    fetchDriveApi: deps.fetchDriveApi,
    fetchDriveApiRaw: deps.fetchDriveApiRaw,
  });
  const getConfigPathImpl = deps.getConfigPath || getConfigPath;
  const loadAllowlistImpl = deps.loadAllowlist || loadAllowlist;
  const verifyFileInAllowlistImpl = deps.verifyFileInAllowlist || verifyFileInAllowlist;

  const { id: fileId, isFolderUrl } = extractFileId(options.target);
  if (isFolderUrl) {
    throw new Error("フォルダの URL が指定されました。フォルダの一覧表示は未対応です。ファイルの URL を指定してください。");
  }

  const { allowedFolderIds } = loadAllowlistImpl();
  if (!allowedFolderIds.length) {
    throw buildMissingAllowlistError(getConfigPathImpl());
  }

  const fetchJson = (apiPath, params) => driveClient.fetchJson(apiPath, params);
  const verdict = await verifyFileInAllowlistImpl(fileId, { allowedFolderIds, fetchJson });
  if (!verdict.allowed) {
    throw new Error(`このファイルは参照できません: ${verdict.reason}`);
  }

  const meta = await driveClient.getFileMetadata(fileId);

  const plan = resolveReadPlan(meta.mimeType, options.format);
  const warnings = [];

  let buffer;
  if (plan.kind === "export") {
    buffer = await driveClient.exportFile(fileId, plan.exportMime);
    if (meta.mimeType === GOOGLE_SHEET) {
      warnings.push("注: Sheets の export は先頭シートのみです。");
    }
  } else {
    const size = Number(meta.size || 0);
    if (size > MAX_MEDIA_BYTES && !options.force) {
      throw new Error(
        `ファイルサイズが ${Math.round(size / 1024 / 1024)}MB あります。取得する場合は --force を付けてください。`
      );
    }
    buffer = await driveClient.downloadFile(fileId);
  }

  return {
    fileId,
    meta,
    plan,
    buffer,
    warnings,
  };
}

module.exports = {
  extractFileId,
  buildMissingAllowlistError,
  readDriveFile,
};
