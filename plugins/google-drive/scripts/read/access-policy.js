"use strict";

const MAX_ANCESTOR_DEPTH = 50;

function deny(reason) {
  return { allowed: false, reason };
}

function allow() {
  return { allowed: true, reason: "" };
}

function normalizeParents(parents) {
  return Array.isArray(parents) ? parents : [];
}

function isAuthenticationError(err) {
  return err && err.status === 401;
}

async function verifyFileInAllowedFolders(fileId, options) {
  const allowedFolderIds = (options && options.allowedFolderIds) || [];
  const getParents = options && options.getParents;
  const maxAncestorDepth =
    options && options.maxAncestorDepth ? options.maxAncestorDepth : MAX_ANCESTOR_DEPTH;

  if (!allowedFolderIds.length) {
    return deny("許可フォルダが設定されていません。");
  }
  if (typeof getParents !== "function") {
    throw new Error("getParents function is required.");
  }

  const allowedSet = new Set(allowedFolderIds);
  const memo = new Map();

  async function folderAllowed(folderId, depth, visited) {
    if (allowedSet.has(folderId)) return true;
    if (memo.has(folderId)) return memo.get(folderId);
    if (depth >= maxAncestorDepth || visited.has(folderId)) return false;
    visited.add(folderId);

    let parents;
    try {
      parents = normalizeParents(await getParents(folderId));
    } catch (err) {
      if (isAuthenticationError(err)) throw err;
      memo.set(folderId, false);
      return false;
    }

    let result = false;
    for (const parent of parents) {
      if (await folderAllowed(parent, depth + 1, visited)) {
        result = true;
        break;
      }
    }
    memo.set(folderId, result);
    return result;
  }

  let parents;
  try {
    parents = normalizeParents(await getParents(fileId));
  } catch (err) {
    if (isAuthenticationError(err)) throw err;
    return deny("ファイル情報を取得できないため拒否しました。");
  }

  if (!parents.length) {
    return deny("親フォルダを判定できないため拒否しました（共有アイテム等）。");
  }

  for (const parent of parents) {
    if (await folderAllowed(parent, 1, new Set())) {
      return allow();
    }
  }
  return deny("許可フォルダ配下ではありません。");
}

module.exports = {
  MAX_ANCESTOR_DEPTH,
  verifyFileInAllowedFolders,
};
