"use strict";

const {
  CONFIG_PATH_ENV,
  DEFAULT_CONFIG_PATH,
  FOLDER_ID_PATTERN,
  getConfigPath,
  loadReadSettings,
} = require("./settings/google-drive");
const MAX_ANCESTOR_DEPTH = 50;

function loadAllowlist(configPath = getConfigPath()) {
  const { allowedFolderIds } = loadReadSettings(configPath);
  return { allowedFolderIds };
}

// 渡されたIDから parents を許可フォルダIDに突き当たるまで遡って所属を検証する。
// 判定できないケース（parents なし・APIエラー・深さ超過・循環）はすべて拒否に倒す。
// 401 だけは「認証切れ」をサイレント拒否と誤認させないため呼び出し元に投げ直す。
async function verifyFileInAllowlist(fileId, { allowedFolderIds, fetchJson }) {
  if (!allowedFolderIds || !allowedFolderIds.length) {
    return { allowed: false, reason: "許可フォルダが設定されていません。" };
  }

  const allowedSet = new Set(allowedFolderIds);
  const memo = new Map();

  async function getParents(id) {
    const data = await fetchJson(`files/${encodeURIComponent(id)}`, {
      fields: "id,parents",
      supportsAllDrives: true,
    });
    return data && Array.isArray(data.parents) ? data.parents : [];
  }

  async function folderAllowed(folderId, depth, visited) {
    if (allowedSet.has(folderId)) return true;
    if (memo.has(folderId)) return memo.get(folderId);
    if (depth >= MAX_ANCESTOR_DEPTH || visited.has(folderId)) return false;
    visited.add(folderId);

    let parents;
    try {
      parents = await getParents(folderId);
    } catch (err) {
      if (err && err.status === 401) throw err;
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
    parents = await getParents(fileId);
  } catch (err) {
    if (err && err.status === 401) throw err;
    return { allowed: false, reason: "ファイル情報を取得できないため拒否しました。" };
  }

  if (!parents.length) {
    return {
      allowed: false,
      reason: "親フォルダを判定できないため拒否しました（共有アイテム等）。",
    };
  }

  for (const parent of parents) {
    if (await folderAllowed(parent, 1, new Set())) {
      return { allowed: true, reason: "" };
    }
  }
  return { allowed: false, reason: "許可フォルダ配下ではありません。" };
}

module.exports = {
  CONFIG_PATH_ENV,
  DEFAULT_CONFIG_PATH,
  FOLDER_ID_PATTERN,
  MAX_ANCESTOR_DEPTH,
  getConfigPath,
  loadAllowlist,
  verifyFileInAllowlist,
};
