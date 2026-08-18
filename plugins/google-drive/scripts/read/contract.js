"use strict";

const path = require("node:path");

const USAGE =
  "使い方: read.js <fileId または Drive URL> [--profile name] [--format md|txt|csv|pdf] [--out dir] [--force]\n";
const DEFAULT_OUT_DIR = path.join(process.cwd(), "drive-read");
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

function parseReadArgs(args) {
  const options = { target: null, profile: "", format: null, outDir: DEFAULT_OUT_DIR, force: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--profile") {
      const next = args[++i];
      if (!next) throw new Error("--profile には profile 名を指定してください。");
      options.profile = next;
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

module.exports = {
  USAGE,
  DEFAULT_OUT_DIR,
  MAX_MEDIA_BYTES,
  GOOGLE_DOC,
  GOOGLE_SHEET,
  GOOGLE_SLIDES,
  GOOGLE_FOLDER,
  EXPORT_MIMES,
  EXPORT_FORMATS,
  resolveReadPlan,
  parseReadArgs,
  parseArgs: parseReadArgs,
};
