"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadAllowlist, verifyFileInAllowlist } = require("../allowlist");

function writeTempConfig(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drive-allowlist-test-"));
  const configPath = path.join(dir, "config.json");
  fs.writeFileSync(configPath, content);
  return configPath;
}

test("loadAllowlist: 正常な config を読み込む", () => {
  const configPath = writeTempConfig('{ "allowedFolderIds": ["abc123", "DEF-456_x"] }');
  assert.deepEqual(loadAllowlist(configPath), { allowedFolderIds: ["abc123", "DEF-456_x"] });
});

test("loadAllowlist: ファイルが無ければ空配列", () => {
  assert.deepEqual(loadAllowlist("/nonexistent/config.json"), { allowedFolderIds: [] });
});

test("loadAllowlist: allowedFolderIds 未定義なら空配列", () => {
  const configPath = writeTempConfig("{}");
  assert.deepEqual(loadAllowlist(configPath), { allowedFolderIds: [] });
});

test("loadAllowlist: JSON 破損は throw", () => {
  const configPath = writeTempConfig("{ broken");
  assert.throws(() => loadAllowlist(configPath), /JSON として読み込めません/);
});

test("loadAllowlist: 型不正は throw", () => {
  const configPath = writeTempConfig('{ "allowedFolderIds": "abc" }');
  assert.throws(() => loadAllowlist(configPath), /文字列配列/);
});

test("loadAllowlist: 不正な ID は throw", () => {
  const configPath = writeTempConfig('{ "allowedFolderIds": ["ok", "bad id!"] }');
  assert.throws(() => loadAllowlist(configPath), /不正なID/);
});

// --- verifyFileInAllowlist ---

// parentsMap: id -> parents 配列。無いidは 404 相当の throw
function makeFetchJson(parentsMap, options = {}) {
  const calls = [];
  const fetchJson = async (apiPath) => {
    const id = decodeURIComponent(apiPath.replace(/^files\//, ""));
    calls.push(id);
    if (options.failWith && options.failWith.has(id)) {
      const err = new Error(`error for ${id}`);
      err.status = options.failWith.get(id);
      throw err;
    }
    if (!(id in parentsMap)) {
      const err = new Error(`not found: ${id}`);
      err.status = 404;
      throw err;
    }
    return { id, parents: parentsMap[id] };
  };
  fetchJson.calls = calls;
  return fetchJson;
}

test("verify: 直接の親が許可フォルダなら許可", async () => {
  const fetchJson = makeFetchJson({ file1: ["allowed"] });
  const result = await verifyFileInAllowlist("file1", {
    allowedFolderIds: ["allowed"],
    fetchJson,
  });
  assert.equal(result.allowed, true);
});

test("verify: 祖父母が許可フォルダでも許可（サブツリー）", async () => {
  const fetchJson = makeFetchJson({ file1: ["sub"], sub: ["allowed"] });
  const result = await verifyFileInAllowlist("file1", {
    allowedFolderIds: ["allowed"],
    fetchJson,
  });
  assert.equal(result.allowed, true);
});

test("verify: ルートまで到達したら拒否", async () => {
  const fetchJson = makeFetchJson({ file1: ["folderA"], folderA: [] });
  const result = await verifyFileInAllowlist("file1", {
    allowedFolderIds: ["allowed"],
    fetchJson,
  });
  assert.equal(result.allowed, false);
});

test("verify: parents が無いファイルは拒否（共有アイテム）", async () => {
  const fetchJson = makeFetchJson({ file1: [] });
  const result = await verifyFileInAllowlist("file1", {
    allowedFolderIds: ["allowed"],
    fetchJson,
  });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /親フォルダを判定できない/);
});

test("verify: 複数 parents はいずれかが許可ツリーなら許可", async () => {
  const fetchJson = makeFetchJson({
    file1: ["outside", "inside"],
    outside: [],
    inside: ["allowed"],
  });
  const result = await verifyFileInAllowlist("file1", {
    allowedFolderIds: ["allowed"],
    fetchJson,
  });
  assert.equal(result.allowed, true);
});

test("verify: 祖先解決の 404 は拒否", async () => {
  const fetchJson = makeFetchJson({ file1: ["ghost"] });
  const result = await verifyFileInAllowlist("file1", {
    allowedFolderIds: ["allowed"],
    fetchJson,
  });
  assert.equal(result.allowed, false);
});

test("verify: 401 は rethrow", async () => {
  const fetchJson = makeFetchJson({}, { failWith: new Map([["file1", 401]]) });
  await assert.rejects(
    verifyFileInAllowlist("file1", { allowedFolderIds: ["allowed"], fetchJson }),
    (err) => err.status === 401
  );
});

test("verify: 祖先解決中の 401 も rethrow", async () => {
  const fetchJson = makeFetchJson(
    { file1: ["folderA"] },
    { failWith: new Map([["folderA", 401]]) }
  );
  await assert.rejects(
    verifyFileInAllowlist("file1", { allowedFolderIds: ["allowed"], fetchJson }),
    (err) => err.status === 401
  );
});

test("verify: 循環しても停止して拒否", async () => {
  const fetchJson = makeFetchJson({ file1: ["a"], a: ["b"], b: ["a"] });
  const result = await verifyFileInAllowlist("file1", {
    allowedFolderIds: ["allowed"],
    fetchJson,
  });
  assert.equal(result.allowed, false);
});

test("verify: メモ化で同じフォルダを再解決しない", async () => {
  // file の親2つが同じ祖父母 shared を持つ
  const fetchJson = makeFetchJson({
    file1: ["p1", "p2"],
    p1: ["shared"],
    p2: ["shared"],
    shared: [],
  });
  await verifyFileInAllowlist("file1", { allowedFolderIds: ["allowed"], fetchJson });
  const sharedCalls = fetchJson.calls.filter((id) => id === "shared").length;
  assert.equal(sharedCalls, 1);
});

test("verify: 許可リストが空なら API を呼ばず拒否", async () => {
  const fetchJson = makeFetchJson({ file1: ["allowed"] });
  const result = await verifyFileInAllowlist("file1", { allowedFolderIds: [], fetchJson });
  assert.equal(result.allowed, false);
  assert.equal(fetchJson.calls.length, 0);
});
