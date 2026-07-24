"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_ANCESTOR_DEPTH,
  verifyFileInAllowedFolders,
} = require("../policy/google-read");

function makeGetParents(parentsMap, options = {}) {
  const calls = [];
  const getParents = async (id) => {
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
    return parentsMap[id];
  };
  getParents.calls = calls;
  return getParents;
}

test("verifyFileInAllowedFolders: 許可フォルダ未設定なら親取得せず拒否する", async () => {
  const getParents = makeGetParents({ file1: ["allowed"] });
  const result = await verifyFileInAllowedFolders("file1", {
    allowedFolderIds: [],
    getParents,
  });

  assert.deepEqual(result, { allowed: false, reason: "許可フォルダが設定されていません。" });
  assert.deepEqual(getParents.calls, []);
});

test("verifyFileInAllowedFolders: 直接の親が許可フォルダなら許可する", async () => {
  const getParents = makeGetParents({ file1: ["allowed"] });
  const result = await verifyFileInAllowedFolders("file1", {
    allowedFolderIds: ["allowed"],
    getParents,
  });

  assert.deepEqual(result, { allowed: true, reason: "" });
});

test("verifyFileInAllowedFolders: 祖先が許可フォルダなら許可する", async () => {
  const getParents = makeGetParents({ file1: ["child"], child: ["allowed"] });
  const result = await verifyFileInAllowedFolders("file1", {
    allowedFolderIds: ["allowed"],
    getParents,
  });

  assert.equal(result.allowed, true);
});

test("verifyFileInAllowedFolders: file metadata を取得できなければ fail closed にする", async () => {
  const getParents = makeGetParents({});
  const result = await verifyFileInAllowedFolders("file1", {
    allowedFolderIds: ["allowed"],
    getParents,
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason, /ファイル情報を取得できない/);
});

test("verifyFileInAllowedFolders: 401 は認証切れとして呼び出し元へ投げ直す", async () => {
  const getParents = makeGetParents({}, { failWith: new Map([["file1", 401]]) });

  await assert.rejects(
    verifyFileInAllowedFolders("file1", { allowedFolderIds: ["allowed"], getParents }),
    (err) => err.status === 401
  );
});

test("verifyFileInAllowedFolders: 循環は fail closed にする", async () => {
  const getParents = makeGetParents({ file1: ["a"], a: ["b"], b: ["a"] });
  const result = await verifyFileInAllowedFolders("file1", {
    allowedFolderIds: ["allowed"],
    getParents,
  });

  assert.equal(result.allowed, false);
});

test("verifyFileInAllowedFolders: 深さ上限を超えた探索は fail closed にする", async () => {
  const getParents = makeGetParents({ file1: ["a"], a: ["b"], b: ["allowed"] });
  const result = await verifyFileInAllowedFolders("file1", {
    allowedFolderIds: ["allowed"],
    getParents,
    maxAncestorDepth: 2,
  });

  assert.equal(result.allowed, false);
});

test("MAX_ANCESTOR_DEPTH: 既定の深さ上限を維持する", () => {
  assert.equal(MAX_ANCESTOR_DEPTH, 50);
});
