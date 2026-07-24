"use strict";

const {
  USAGE,
  DEFAULT_OUT_DIR,
  MAX_MEDIA_BYTES,
  parseReadArgs,
  resolveReadPlan,
} = require("./read/contract");
const {
  sanitizeFileName,
  writeReadResult,
} = require("./read/presenter");
const {
  extractFileId,
  readDriveFile,
} = require("./read/use-case");

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

  const result = await readDriveFile(options);
  for (const warning of result.warnings) {
    process.stderr.write(`${warning}\n`);
  }

  process.stderr.write(`ファイル: ${result.meta.name} (${result.meta.mimeType})\n`);
  writeReadResult({
    buffer: result.buffer,
    plan: result.plan,
    outDir: options.outDir,
    fileId: result.fileId,
    fileName: result.meta.name + (result.plan.ext || ""),
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
  readDriveFile,
};
