const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_COUNT,
  MAX_COUNT,
  parseArgs,
  parseCount,
  redactSecrets,
  truncateText,
  buildAboutStep,
  runSmoke,
  formatSmokeReport,
} = require("../smoke");

const LIVE_STATUS = {
  exists: true,
  store: "test-store",
  user: "Example User",
  email: "user@compass-e.com",
  scope: "https://www.googleapis.com/auth/drive.readonly",
  liveCheck: "about.get ok",
  expiresAt: "2030-01-01T00:00:00.000Z",
};

describe("parseArgs", () => {
  it("既定値を返す", () => {
    assert.deepEqual(parseArgs([]), {
      file: "",
      count: DEFAULT_COUNT,
      login: false,
      skipList: false,
      help: false,
    });
  });

  it("オプションを解析する", () => {
    assert.deepEqual(
      parseArgs(["--file", "https://docs.google.com/document/d/abc123/edit", "--count", "2", "--login", "--skip-list"]),
      {
        file: "https://docs.google.com/document/d/abc123/edit",
        count: 2,
        login: true,
        skipList: true,
        help: false,
      }
    );
  });

  it("count は smoke 用の上限を超えられない", () => {
    assert.equal(parseCount("1"), 1);
    assert.equal(parseCount(String(MAX_COUNT)), MAX_COUNT);
    assert.throws(() => parseCount("0"), /1-10/);
    assert.throws(() => parseCount(String(MAX_COUNT + 1)), /1-10/);
  });
});

describe("redaction", () => {
  it("Google token らしい文字列を伏せる", () => {
    assert.equal(redactSecrets("token ya29.a0AfB_secret end"), "token [redacted-token] end");
    assert.equal(redactSecrets("refresh 1//0gW-secret end"), "refresh [redacted-token] end");
    assert.equal(truncateText("hello   ya29.value"), "hello [redacted-token]");
  });
});

describe("buildAboutStep", () => {
  it("status の live about.get 結果から表示用 step を作る", () => {
    assert.deepEqual(buildAboutStep(LIVE_STATUS), {
      name: "about",
      ok: true,
      user: "Example User",
      email: "user@compass-e.com",
    });
  });

  it("live check 未完了なら失敗する", () => {
    assert.throws(() => buildAboutStep({ ...LIVE_STATUS, liveCheck: "" }), /about\.get/);
  });
});

describe("runSmoke", () => {
  function createDeps(overrides = {}) {
    const calls = [];
    return {
      calls,
      getStatus: async () => LIVE_STATUS,
      runAuth: async () => {
        calls.push({ fn: "runAuth" });
      },
      loadAllowlist: () => ({ allowedFolderIds: ["FOLDER1", "FOLDER2"] }),
      verifyFileInAllowlist: async (fileId) => {
        calls.push({ fn: "verifyFileInAllowlist", fileId });
        return { allowed: true, reason: "" };
      },
      fetchDriveApi: async (path, params = {}) => {
        calls.push({ fn: "fetchDriveApi", path, params });
        if (path === "files") {
          return {
            data: {
              files: [{ id: "FILE1", name: "設計メモ ya29.hidden", mimeType: "application/vnd.google-apps.document" }],
            },
          };
        }
        return {
          data: { id: "FILE1", name: "設計メモ", mimeType: "application/vnd.google-apps.document", size: "0" },
        };
      },
      fetchDriveApiRaw: async (path, params = {}) => {
        calls.push({ fn: "fetchDriveApiRaw", path, params });
        return { buffer: Buffer.from("# secret ya29.hidden"), contentType: "text/markdown" };
      },
      ...overrides,
    };
  }

  it("実 API smoke の各 step を実行し、token 値と内容を出さない", async () => {
    const deps = createDeps();
    const report = await runSmoke({ count: 1 }, deps);
    const output = formatSmokeReport(report);

    assert.equal(report.ok, true);
    assert.deepEqual(deps.calls.map((call) => call.fn), ["fetchDriveApi"]);
    assert.match(output, /Google Drive smoke result: PASS/);
    assert.match(output, /OK auth status/);
    assert.match(output, /OK about\.get/);
    assert.match(output, /OK allowlist: 2 allowed folders/);
    assert.match(output, /OK list: 1 files in folder FOLDER1/);
    assert.doesNotMatch(output, /ya29\.hidden/);
  });

  it("list の query は最初の許可フォルダを対象にする", async () => {
    const deps = createDeps();
    await runSmoke({ count: 2 }, deps);
    const listCall = deps.calls.find((call) => call.fn === "fetchDriveApi");

    assert.equal(listCall.path, "files");
    assert.equal(listCall.params.q, "'FOLDER1' in parents and trashed = false");
    assert.equal(listCall.params.pageSize, "2");
  });

  it("--file 指定時は allowlist 検証を通して読み取り、内容は出力しない", async () => {
    const deps = createDeps();
    const report = await runSmoke({ file: "https://docs.google.com/document/d/FILE1/edit", skipList: true }, deps);
    const output = formatSmokeReport(report);

    assert.deepEqual(
      deps.calls.map((call) => call.fn),
      ["verifyFileInAllowlist", "fetchDriveApi", "fetchDriveApiRaw"]
    );
    const readStep = report.steps.find((step) => step.name === "read");
    assert.equal(readStep.bytes, Buffer.byteLength("# secret ya29.hidden"));
    assert.match(output, /OK read: 設計メモ/);
    assert.doesNotMatch(output, /# secret/);
    assert.doesNotMatch(output, /ya29\.hidden/);
  });

  it("--file が許可フォルダ配下でなければ失敗する", async () => {
    const deps = createDeps({
      verifyFileInAllowlist: async () => ({ allowed: false, reason: "許可フォルダ配下ではありません。" }),
    });

    await assert.rejects(() => runSmoke({ file: "FILE1", skipList: true }, deps), /参照できません/);
  });

  it("token がなければ login 指示を出して失敗する", async () => {
    const deps = createDeps({
      getStatus: async () => ({ exists: false, store: "test-store" }),
    });

    await assert.rejects(() => runSmoke({}, deps), /google-drive-auth/);
  });

  it("--login 指定時は login 後に再度 status を確認する", async () => {
    let statusCalls = 0;
    const deps = createDeps({
      getStatus: async () => {
        statusCalls += 1;
        if (statusCalls === 1) return { exists: false, store: "test-store" };
        return LIVE_STATUS;
      },
    });

    const report = await runSmoke({ login: true, skipList: true }, deps);
    assert.equal(statusCalls, 2);
    assert.equal(report.steps[0].name, "login");
    assert.equal(deps.calls[0].fn, "runAuth");
  });

  it("フォルダ許可リストが空なら失敗する", async () => {
    const deps = createDeps({
      loadAllowlist: () => ({ allowedFolderIds: [] }),
    });

    await assert.rejects(() => runSmoke({}, deps), /allowedFolderIds/);
  });
});
