"use strict";

const { fetchDriveApi, fetchDriveApiRaw } = require("./common");
const { getConfigPath, loadAllowlist, verifyFileInAllowlist, FOLDER_ID_PATTERN } = require("./allowlist");
const {
  USAGE,
  DEFAULT_OUT_DIR,
  MAX_MEDIA_BYTES,
  GOOGLE_SHEET,
  parseReadArgs,
  resolveReadPlan,
} = require("./read/contract");
const {
  sanitizeFileName,
  writeReadResult,
} = require("./read/presenter");

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

async function main() {
  let options;
  try {
    options = parseReadArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`エラー: ${err.message}\n${USAGE}`);
    process.exit(1);
  }
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  const { id: fileId, isFolderUrl } = extractFileId(options.target);
  if (isFolderUrl) {
    throw new Error("フォルダの URL が指定されました。フォルダの一覧表示は未対応です。ファイルの URL を指定してください。");
  }

  const { allowedFolderIds } = loadAllowlist();
  if (!allowedFolderIds.length) {
    throw new Error(
      [
        `許可フォルダが設定されていません（${getConfigPath()}）。`,
        "参照を許可するフォルダの ID を設定してください:",
        '{ "allowedFolderIds": ["<フォルダID>"] }',
        "フォルダIDは Drive のフォルダ URL の folders/ 以降の文字列です。詳細は SETUP.md を参照してください。",
      ].join("\n")
    );
  }

  const fetchJson = async (apiPath, params) => (await fetchDriveApi(apiPath, params)).data;
  const verdict = await verifyFileInAllowlist(fileId, { allowedFolderIds, fetchJson });
  if (!verdict.allowed) {
    throw new Error(`このファイルは参照できません: ${verdict.reason}`);
  }

  const meta = (
    await fetchDriveApi(`files/${encodeURIComponent(fileId)}`, {
      fields: "id,name,mimeType,size",
      supportsAllDrives: true,
    })
  ).data;

  const plan = resolveReadPlan(meta.mimeType, options.format);

  let buffer;
  if (plan.kind === "export") {
    buffer = (
      await fetchDriveApiRaw(`files/${encodeURIComponent(fileId)}/export`, {
        mimeType: plan.exportMime,
      })
    ).buffer;
    if (meta.mimeType === GOOGLE_SHEET) {
      process.stderr.write("注: Sheets の export は先頭シートのみです。\n");
    }
  } else {
    const size = Number(meta.size || 0);
    if (size > MAX_MEDIA_BYTES && !options.force) {
      throw new Error(
        `ファイルサイズが ${Math.round(size / 1024 / 1024)}MB あります。取得する場合は --force を付けてください。`
      );
    }
    buffer = (
      await fetchDriveApiRaw(`files/${encodeURIComponent(fileId)}`, {
        alt: "media",
        supportsAllDrives: true,
      })
    ).buffer;
  }

  process.stderr.write(`ファイル: ${meta.name} (${meta.mimeType})\n`);
  writeReadResult({
    buffer,
    plan,
    outDir: options.outDir,
    fileId,
    fileName: meta.name + (plan.ext || ""),
  });
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  USAGE,
  MAX_MEDIA_BYTES,
  DEFAULT_OUT_DIR,
  extractFileId,
  resolveReadPlan,
  sanitizeFileName,
  parseArgs: parseReadArgs,
};
