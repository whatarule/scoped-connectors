"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  extractFileId,
  resolveReadPlan,
  sanitizeFileName,
  parseArgs,
} = require("../read");
const {
  writeReadResult,
} = require("../read/presenter");

// --- extractFileId ---

test("extractFileId: 素の fileId はそのまま返す", () => {
  assert.deepEqual(extractFileId("1AbC-def_456"), { id: "1AbC-def_456", isFolderUrl: false });
});

test("extractFileId: Docs URL", () => {
  const result = extractFileId("https://docs.google.com/document/d/1AbCdef/edit?tab=t.0");
  assert.deepEqual(result, { id: "1AbCdef", isFolderUrl: false });
});

test("extractFileId: Sheets / Slides / file URL", () => {
  assert.equal(extractFileId("https://docs.google.com/spreadsheets/d/1Sheet/edit#gid=0").id, "1Sheet");
  assert.equal(extractFileId("https://docs.google.com/presentation/d/1Slide/edit").id, "1Slide");
  assert.equal(extractFileId("https://drive.google.com/file/d/1File/view?usp=sharing").id, "1File");
});

test("extractFileId: マルチアカウント形式 /u/0/ 付き URL", () => {
  assert.equal(extractFileId("https://docs.google.com/document/u/0/d/1AbCdef/edit").id, "1AbCdef");
});

test("extractFileId: open?id= 形式", () => {
  assert.equal(extractFileId("https://drive.google.com/open?id=1OpenId").id, "1OpenId");
});

test("extractFileId: フォルダ URL は isFolderUrl", () => {
  const result = extractFileId("https://drive.google.com/drive/folders/1FolderId");
  assert.deepEqual(result, { id: "1FolderId", isFolderUrl: true });
});

test("extractFileId: Google 以外の URL は throw", () => {
  assert.throws(() => extractFileId("https://example.com/d/abc"), /Google Drive の URL ではありません/);
});

test("extractFileId: 解釈できない入力は throw", () => {
  assert.throws(() => extractFileId("なにこれ"), /解釈できません/);
  assert.throws(() => extractFileId(""), /指定してください/);
  assert.throws(() => extractFileId("https://drive.google.com/drive/my-drive"), /抽出できません/);
});

// --- resolveReadPlan ---

test("resolveReadPlan: Docs はデフォルト Markdown export で stdout", () => {
  const plan = resolveReadPlan("application/vnd.google-apps.document", null);
  assert.equal(plan.kind, "export");
  assert.equal(plan.exportMime, "text/markdown");
  assert.equal(plan.toStdout, true);
});

test("resolveReadPlan: Sheets は CSV、Slides はテキスト", () => {
  assert.equal(resolveReadPlan("application/vnd.google-apps.spreadsheet", null).exportMime, "text/csv");
  assert.equal(resolveReadPlan("application/vnd.google-apps.presentation", null).exportMime, "text/plain");
});

test("resolveReadPlan: --format pdf はファイル保存", () => {
  const plan = resolveReadPlan("application/vnd.google-apps.document", "pdf");
  assert.equal(plan.exportMime, "application/pdf");
  assert.equal(plan.toStdout, false);
});

test("resolveReadPlan: 対応外の format は throw", () => {
  assert.throws(
    () => resolveReadPlan("application/vnd.google-apps.spreadsheet", "md"),
    /対応していません/
  );
});

test("resolveReadPlan: フォルダは throw", () => {
  assert.throws(() => resolveReadPlan("application/vnd.google-apps.folder", null), /フォルダ/);
});

test("resolveReadPlan: 未対応の Google アプリ形式は throw", () => {
  assert.throws(() => resolveReadPlan("application/vnd.google-apps.form", null), /未対応/);
});

test("resolveReadPlan: テキスト系 mime は stdout", () => {
  assert.deepEqual(resolveReadPlan("text/plain", null), { kind: "media", toStdout: true });
  assert.deepEqual(resolveReadPlan("application/json", null), { kind: "media", toStdout: true });
});

test("resolveReadPlan: バイナリはファイル保存", () => {
  assert.deepEqual(resolveReadPlan("application/pdf", null), { kind: "media", toStdout: false });
  assert.deepEqual(resolveReadPlan("image/png", null), { kind: "media", toStdout: false });
});

test("resolveReadPlan: 通常ファイルへの --format は throw", () => {
  assert.throws(() => resolveReadPlan("application/pdf", "md"), /--format/);
});

// --- sanitizeFileName ---

test("sanitizeFileName: パス区切りを潰し日本語は残す", () => {
  assert.equal(sanitizeFileName("2026年度/Q2\\提案書.docx"), "2026年度_Q2_提案書.docx");
  assert.equal(sanitizeFileName("報告書 v3.pdf"), "報告書 v3.pdf");
  assert.equal(sanitizeFileName(""), "unnamed");
});

// --- writeReadResult ---

test("writeReadResult: stdout 出力は末尾 newline を補う", () => {
  let output = "";
  const result = writeReadResult({
    buffer: Buffer.from("hello"),
    plan: { toStdout: true },
    stdout: { write: (chunk) => { output += chunk; } },
  });
  assert.deepEqual(result, { kind: "stdout" });
  assert.equal(output, "hello\n");
});

test("writeReadResult: ファイル保存時は保存先メッセージを出す", (t) => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "drive-read-presenter-test-"));
  t.after(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });
  let output = "";
  const result = writeReadResult({
    buffer: Buffer.from("pdf-bytes"),
    plan: { toStdout: false },
    outDir,
    fileId: "FILE123",
    fileName: "レポート/本体.pdf",
    stdout: { write: (chunk) => { output += chunk; } },
  });

  assert.equal(result.kind, "file");
  assert.equal(result.savedPath, path.join(outDir, "FILE123", "レポート_本体.pdf"));
  assert.equal(fs.readFileSync(result.savedPath, "utf8"), "pdf-bytes");
  assert.match(output, /保存しました:/);
  assert.match(output, /Read ツール/);
});

// --- parseArgs ---

test("parseArgs: target と オプションを解釈する", () => {
  const options = parseArgs(["1AbC", "--format", "pdf", "--out", "/tmp/x", "--force"]);
  assert.equal(options.target, "1AbC");
  assert.equal(options.format, "pdf");
  assert.equal(options.outDir, "/tmp/x");
  assert.equal(options.force, true);
});

test("parseArgs: 保存先の既定値はカレントディレクトリ配下", () => {
  const options = parseArgs(["1AbC"]);
  assert.equal(options.outDir, path.join(process.cwd(), "drive-read"));
});

test("parseArgs: target 必須・不明な format は throw", () => {
  assert.throws(() => parseArgs([]), /指定してください/);
  assert.throws(() => parseArgs(["1AbC", "--format", "exe"]), /--format/);
  assert.throws(() => parseArgs(["1AbC", "extra"]), /不明な引数/);
});
