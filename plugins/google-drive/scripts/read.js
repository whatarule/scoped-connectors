"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { fetchDriveApi, fetchDriveApiRaw } = require("./common");
const { getConfigPath, loadAllowlist, verifyFileInAllowlist, FOLDER_ID_PATTERN } = require("./allowlist");

const USAGE =
  "使い方: read.js <fileId または Drive URL> [--format md|txt|csv|pdf] [--out dir] [--force]\n";
const DEFAULT_OUT_DIR = path.join(os.tmpdir(), "drive-read");
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

const GOOGLE_DOC = "application/vnd.google-apps.document";
const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const GOOGLE_SLIDES = "application/vnd.google-apps.presentation";
const GOOGLE_FOLDER = "application/vnd.google-apps.folder";

const EXPORT_MIMES = {
  md: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  pdf: "application/pdf",
};

// Google ネイティブ形式ごとの export 先。先頭がデフォルト。
const EXPORT_FORMATS = {
  [GOOGLE_DOC]: ["md", "txt", "pdf"],
  [GOOGLE_SHEET]: ["csv", "pdf"],
  [GOOGLE_SLIDES]: ["txt", "pdf"],
};

const TEXT_MIME_PATTERN = /^text\//;
const TEXT_MIMES = new Set(["application/json", "application/xml", "application/javascript"]);

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

// mimeType と --format から取得方法を決める
function resolveReadPlan(mimeType, format) {
  if (mimeType === GOOGLE_FOLDER) {
    throw new Error("フォルダが指定されました。フォルダの一覧表示は未対応です。ファイルの URL / ID を指定してください。");
  }

  const exportFormats = EXPORT_FORMATS[mimeType];
  if (exportFormats) {
    const chosen = format || exportFormats[0];
    if (!exportFormats.includes(chosen)) {
      throw new Error(
        `この形式（${mimeType}）は --format ${chosen} に対応していません。指定可能: ${exportFormats.join(", ")}`
      );
    }
    return {
      kind: "export",
      exportMime: EXPORT_MIMES[chosen],
      toStdout: chosen !== "pdf",
      ext: `.${chosen}`,
    };
  }

  if (mimeType.startsWith("application/vnd.google-apps.")) {
    throw new Error(`未対応の Google アプリ形式です: ${mimeType}`);
  }

  if (format) {
    throw new Error("--format は Google Docs / Sheets / Slides のみ指定できます。");
  }

  if (TEXT_MIME_PATTERN.test(mimeType) || TEXT_MIMES.has(mimeType)) {
    return { kind: "media", toStdout: true };
  }
  return { kind: "media", toStdout: false };
}

function sanitizeFileName(name) {
  // パス区切りと制御文字だけを潰す（日本語等はそのまま残す）
  const cleaned = String(name || "")
    .replace(/[\/\\]/g, "_")
    .replace(/[\x00-\x1f]/g, "")
    .trim();
  return cleaned || "unnamed";
}

function parseArgs(args) {
  const options = { target: null, format: null, outDir: DEFAULT_OUT_DIR, force: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--format") {
      const next = args[++i];
      if (!next || !EXPORT_MIMES[next]) {
        throw new Error(`--format には ${Object.keys(EXPORT_MIMES).join("|")} を指定してください。`);
      }
      options.format = next;
    } else if (arg === "--out") {
      const next = args[++i];
      if (!next) throw new Error("--out には保存先ディレクトリを指定してください。");
      options.outDir = next;
    } else if (!options.target) {
      options.target = arg;
    } else {
      throw new Error(`不明な引数です: ${arg}`);
    }
  }

  if (!options.help && !options.target) {
    throw new Error("ファイルID または Drive の URL を指定してください。");
  }
  return options;
}

function saveToFile(outDir, fileId, fileName, buffer) {
  const dir = path.join(outDir, fileId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, sanitizeFileName(fileName));
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
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
  if (plan.toStdout) {
    process.stdout.write(buffer.toString("utf8"));
    if (buffer.length && buffer[buffer.length - 1] !== 0x0a) process.stdout.write("\n");
  } else {
    const savedPath = saveToFile(options.outDir, fileId, meta.name + (plan.ext || ""), buffer);
    process.stdout.write(`保存しました: ${savedPath}\nこのファイルは Read ツールで読んでください。\n`);
  }
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
  parseArgs,
};
