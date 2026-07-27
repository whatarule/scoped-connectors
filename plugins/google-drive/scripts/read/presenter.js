"use strict";

const fs = require("node:fs");
const path = require("node:path");

function sanitizeFileName(name) {
  // パス区切りと制御文字だけを潰す（日本語等はそのまま残す）
  const cleaned = String(name || "")
    .replace(/[\/\\]/g, "_")
    .replace(/[\x00-\x1f]/g, "")
    .trim();
  return cleaned || "unnamed";
}

function appendFileIdSuffix(fileName, fileId) {
  const ext = path.extname(fileName);
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  return `${base}-${sanitizeFileName(fileId)}${ext}`;
}

function saveToFile(outDir, fileId, fileName, buffer) {
  fs.mkdirSync(outDir, { recursive: true });
  const sanitizedName = sanitizeFileName(fileName);
  const defaultPath = path.join(outDir, sanitizedName);
  const filePath = fs.existsSync(defaultPath)
    ? path.join(outDir, appendFileIdSuffix(sanitizedName, fileId))
    : defaultPath;
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function writeReadResult({ buffer, plan, outDir, fileId, fileName, stdout = process.stdout }) {
  if (plan.toStdout) {
    stdout.write(buffer.toString("utf8"));
    if (buffer.length && buffer[buffer.length - 1] !== 0x0a) stdout.write("\n");
    return { kind: "stdout" };
  }

  const savedPath = saveToFile(outDir, fileId, fileName, buffer);
  stdout.write(`保存しました: ${savedPath}\nこのファイルは Read ツールで読んでください。\n`);
  return { kind: "file", savedPath };
}

module.exports = {
  sanitizeFileName,
  saveToFile,
  writeReadResult,
};
