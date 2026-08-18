"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  USAGE,
  MAX_MEDIA_BYTES,
  DEFAULT_OUT_DIR,
  extractFileId,
  resolveReadPlan,
  sanitizeFileName,
  parseArgs,
  readDriveFile,
} = require("../read/cli");
const legacyRead = require("../read");
const {
  writeReadResult,
} = require("../read/presenter");

test("read.js wrapper: read/cli と同じ API を export する", () => {
  assert.equal(legacyRead.USAGE, USAGE);
  assert.equal(legacyRead.MAX_MEDIA_BYTES, MAX_MEDIA_BYTES);
  assert.equal(legacyRead.DEFAULT_OUT_DIR, DEFAULT_OUT_DIR);
  assert.equal(legacyRead.extractFileId, extractFileId);
  assert.equal(legacyRead.resolveReadPlan, resolveReadPlan);
  assert.equal(legacyRead.sanitizeFileName, sanitizeFileName);
  assert.equal(legacyRead.parseArgs, parseArgs);
  assert.equal(legacyRead.readDriveFile, readDriveFile);
});

test("google-drive-read skill: バイナリ capability 不在・失敗時の未確認契約を維持する", () => {
  const skillPath = path.resolve(__dirname, "../../skills/google-drive-read/SKILL.md");
  const skill = fs.readFileSync(skillPath, "utf8");

  assert.match(skill, /その形式を扱える tool \/ skill だけを使う/);
  assert.match(skill, /画像対応の `Read` \/ image tool/);
  assert.match(skill, /document、spreadsheet、presentation を扱う tool \/ skill/);
  assert.match(skill, /内容は確認していません/);
  assert.match(skill, /形式: <MIME type>/);
  assert.match(skill, /保存先: <absolute path>/);
  assert.match(skill, /dependency の install/);
  assert.match(skill, /parser \/ renderer \/ converter script や virtual environment の作成/);
  assert.match(skill, /暗号化、破損、未対応機能、page \/ size limit 等で失敗/);
  assert.match(skill, /ファイル名や metadata だけから内容を推測しない/);
});

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
  assert.deepEqual(resolveReadPlan("application/xml", null), { kind: "media", toStdout: true });
});

test("resolveReadPlan: PDF・画像・Office・archive はファイル保存", () => {
  assert.deepEqual(resolveReadPlan("application/pdf", null), { kind: "media", toStdout: false });
  assert.deepEqual(resolveReadPlan("image/png", null), { kind: "media", toStdout: false });
  assert.deepEqual(
    resolveReadPlan("application/vnd.openxmlformats-officedocument.wordprocessingml.document", null),
    { kind: "media", toStdout: false }
  );
  assert.deepEqual(
    resolveReadPlan("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", null),
    { kind: "media", toStdout: false }
  );
  assert.deepEqual(
    resolveReadPlan("application/vnd.openxmlformats-officedocument.presentationml.presentation", null),
    { kind: "media", toStdout: false }
  );
  assert.deepEqual(resolveReadPlan("application/zip", null), { kind: "media", toStdout: false });
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
  assert.equal(result.savedPath, path.join(outDir, "レポート_本体.pdf"));
  assert.equal(fs.readFileSync(result.savedPath, "utf8"), "pdf-bytes");
  assert.equal(output, `保存しました: ${result.savedPath}\n`);
  assert.doesNotMatch(output, /Read ツール/);
  assert.doesNotMatch(output, /内容を確認/);
});

test("writeReadResult: 同名ファイルがある場合だけ fileId suffix を付ける", (t) => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "drive-read-presenter-test-"));
  t.after(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });
  const existingPath = path.join(outDir, "レポート_本体.pdf");
  fs.writeFileSync(existingPath, "existing");

  const result = writeReadResult({
    buffer: Buffer.from("new-pdf-bytes"),
    plan: { toStdout: false },
    outDir,
    fileId: "FILE123",
    fileName: "レポート/本体.pdf",
    stdout: { write: () => {} },
  });

  assert.equal(result.kind, "file");
  assert.equal(result.savedPath, path.join(outDir, "レポート_本体-FILE123.pdf"));
  assert.equal(fs.readFileSync(existingPath, "utf8"), "existing");
  assert.equal(fs.readFileSync(result.savedPath, "utf8"), "new-pdf-bytes");
});

test("writeReadResult: 相対 --out でも絶対保存パスを返す", (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "drive-read-presenter-test-"));
  t.after(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });
  const relativeOutDir = path.relative(process.cwd(), path.join(rootDir, "relative-output"));
  let output = "";

  const result = writeReadResult({
    buffer: Buffer.from("pdf-bytes"),
    plan: { toStdout: false },
    outDir: relativeOutDir,
    fileId: "FILE123",
    fileName: "レポート.pdf",
    stdout: { write: (chunk) => { output += chunk; } },
  });

  assert.equal(result.savedPath, path.join(rootDir, "relative-output", "レポート.pdf"));
  assert.equal(path.isAbsolute(result.savedPath), true);
  assert.equal(output, `保存しました: ${result.savedPath}\n`);
});

// --- readDriveFile ---

test("readDriveFile: allowlist 検証後に Google native export を取得する", async () => {
  const calls = [];
  const result = await readDriveFile({
    target: "FILE123",
    format: null,
    force: false,
  }, {
    loadAllowlist: () => ({ allowedFolderIds: ["FOLDER1"] }),
    verifyFileInAllowlist: async (fileId, { allowedFolderIds }) => {
      calls.push(`verify:${fileId}:${allowedFolderIds.join(",")}`);
      return { allowed: true, reason: "" };
    },
    fetchDriveApi: async (apiPath, params) => {
      calls.push(`json:${apiPath}`);
      assert.equal(apiPath, "files/FILE123");
      assert.deepEqual(params, {
        fields: "id,name,mimeType,size",
        supportsAllDrives: true,
      });
      return {
        data: {
          id: "FILE123",
          name: "Doc",
          mimeType: "application/vnd.google-apps.document",
          size: "",
        },
      };
    },
    fetchDriveApiRaw: async (apiPath, params) => {
      calls.push(`raw:${apiPath}`);
      assert.equal(apiPath, "files/FILE123/export");
      assert.deepEqual(params, { mimeType: "text/markdown" });
      return { buffer: Buffer.from("# Doc\n") };
    },
  });

  assert.deepEqual(calls, [
    "verify:FILE123:FOLDER1",
    "json:files/FILE123",
    "raw:files/FILE123/export",
  ]);
  assert.equal(result.fileId, "FILE123");
  assert.equal(result.meta.name, "Doc");
  assert.equal(result.plan.kind, "export");
  assert.equal(result.buffer.toString("utf8"), "# Doc\n");
  assert.deepEqual(result.warnings, []);
});

test("readDriveFile: Sheets export は先頭シートのみ warning を返す", async () => {
  const result = await readDriveFile({
    target: "SHEET123",
    format: null,
    force: false,
  }, {
    loadAllowlist: () => ({ allowedFolderIds: ["FOLDER1"] }),
    verifyFileInAllowlist: async () => ({ allowed: true, reason: "" }),
    fetchDriveApi: async () => ({
      data: {
        id: "SHEET123",
        name: "Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        size: "",
      },
    }),
    fetchDriveApiRaw: async () => ({ buffer: Buffer.from("a,b\n") }),
  });

  assert.equal(result.plan.exportMime, "text/csv");
  assert.deepEqual(result.warnings, ["注: Sheets の export は先頭シートのみです。"]);
});

test("readDriveFile: 解決済み profile を allowlist と Drive client に渡す", async () => {
  const calls = [];
  const result = await readDriveFile({
    target: "FILE123",
    profile: "sasael",
    format: null,
    force: false,
  }, {
    getConfigPath: () => "/tmp/profile-config.json",
    loadAllowlist: (configPath, options) => {
      calls.push({ fn: "loadAllowlist", configPath, options });
      return { profile: "sasael", allowedFolderIds: ["SASAEL1"] };
    },
    verifyFileInAllowlist: async () => ({ allowed: true, reason: "" }),
    fetchDriveApi: async (_apiPath, _params, options) => {
      calls.push({ fn: "fetchDriveApi", options });
      return {
        data: {
          id: "FILE123",
          name: "Doc",
          mimeType: "application/vnd.google-apps.document",
          size: "0",
        },
      };
    },
    fetchDriveApiRaw: async (_apiPath, _params, options) => {
      calls.push({ fn: "fetchDriveApiRaw", options });
      return { buffer: Buffer.from("# Doc\n") };
    },
  });

  assert.equal(result.profile, "sasael");
  assert.deepEqual(calls, [
    {
      fn: "loadAllowlist",
      configPath: "/tmp/profile-config.json",
      options: { profile: "sasael" },
    },
    { fn: "fetchDriveApi", options: { profile: "sasael" } },
    { fn: "fetchDriveApiRaw", options: { profile: "sasael" } },
  ]);
});

test("readDriveFile: Office バイナリは MIME type を保持して media download する", async () => {
  const mimeType =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const result = await readDriveFile({
    target: "DOCX123",
    format: null,
    force: false,
  }, {
    loadAllowlist: () => ({ allowedFolderIds: ["FOLDER1"] }),
    verifyFileInAllowlist: async () => ({ allowed: true, reason: "" }),
    fetchDriveApi: async () => ({
      data: {
        id: "DOCX123",
        name: "仕様書.docx",
        mimeType,
        size: "10",
      },
    }),
    fetchDriveApiRaw: async (apiPath, params) => {
      assert.equal(apiPath, "files/DOCX123");
      assert.deepEqual(params, { alt: "media", supportsAllDrives: true });
      return { buffer: Buffer.from("docx-bytes") };
    },
  });

  assert.equal(result.meta.mimeType, mimeType);
  assert.deepEqual(result.plan, { kind: "media", toStdout: false });
  assert.equal(result.buffer.toString("utf8"), "docx-bytes");
});

test("readDriveFile: media がサイズ上限を超えたら --force なしでは拒否する", async () => {
  await assert.rejects(
    () => readDriveFile({
      target: "PDF123",
      format: null,
      force: false,
    }, {
      loadAllowlist: () => ({ allowedFolderIds: ["FOLDER1"] }),
      verifyFileInAllowlist: async () => ({ allowed: true, reason: "" }),
      fetchDriveApi: async () => ({
        data: {
          id: "PDF123",
          name: "large.pdf",
          mimeType: "application/pdf",
          size: String(51 * 1024 * 1024),
        },
      }),
      fetchDriveApiRaw: async () => {
        throw new Error("fetchDriveApiRaw should not be called");
      },
    }),
    /--force/
  );
});

// --- parseArgs ---

test("parseArgs: target と profile・オプションを解釈する", () => {
  const options = parseArgs(["1AbC", "--profile", "sasael", "--format", "pdf", "--out", "/tmp/x", "--force"]);
  assert.equal(options.target, "1AbC");
  assert.equal(options.profile, "sasael");
  assert.equal(options.format, "pdf");
  assert.equal(options.outDir, "/tmp/x");
  assert.equal(options.force, true);
});

test("parseArgs: 保存先の既定値はカレントディレクトリ配下", () => {
  const options = parseArgs(["1AbC"]);
  assert.equal(options.profile, "");
  assert.equal(options.outDir, path.join(process.cwd(), "drive-read"));
});

test("parseArgs: target 必須・不明な format は throw", () => {
  assert.throws(() => parseArgs([]), /指定してください/);
  assert.throws(() => parseArgs(["1AbC", "--format", "exe"]), /--format/);
  assert.throws(() => parseArgs(["1AbC", "extra"]), /不明な引数/);
});
