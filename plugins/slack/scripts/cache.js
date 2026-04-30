"use strict";

const fs = require("fs");
const path = require("path");

/**
 * キャッシュファイルのパスを返す
 * スクリプトの ../../.cache/channels.json
 * @returns {string}
 */
function getCachePath() {
  const scriptsDir = __dirname;
  return path.join(scriptsDir, "..", ".cache", "channels.json");
}

/**
 * キャッシュファイルを読み込んで { name: id } の Map を返す
 * ファイルがなければ null を返す
 * @returns {Map<string, string>|null}
 */
function readCache() {
  const cachePath = getCachePath();
  try {
    const data = fs.readFileSync(cachePath, "utf8");
    const obj = JSON.parse(data);
    return new Map(Object.entries(obj));
  } catch {
    return null;
  }
}

/**
 * { name: id } の Map をキャッシュファイルに書き込む
 * ディレクトリがなければ作成する
 * @param {Map<string, string>} channelMap
 */
function writeCache(channelMap) {
  const cachePath = getCachePath();
  const dir = path.dirname(cachePath);
  fs.mkdirSync(dir, { recursive: true });
  const obj = Object.fromEntries(channelMap);
  fs.writeFileSync(cachePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

/**
 * チャンネル名または ID を解決する
 * C で始まるならそのまま返す。それ以外はキャッシュから名前解決する
 * @param {string} nameOrId - チャンネル名または ID
 * @returns {string} チャンネル ID
 */
function resolveChannel(nameOrId) {
  // # プレフィックスを除去
  const name = nameOrId.replace(/^#/, "");

  // C で始まる場合は ID としてそのまま返す
  if (/^C[A-Z0-9]+$/.test(name)) {
    return name;
  }

  const cache = readCache();
  if (!cache) {
    process.stderr.write(
      "チャンネルキャッシュが見つかりません。先に /slack channels を実行してください。\n"
    );
    process.exit(1);
  }

  const id = cache.get(name);
  if (!id) {
    process.stderr.write(
      `チャンネル "${name}" が見つかりません。/slack channels でキャッシュを更新してください。\n`
    );
    process.exit(1);
  }

  return id;
}

/**
 * ユーザーキャッシュファイルのパスを返す
 * @returns {string}
 */
function getUsersCachePath() {
  const scriptsDir = __dirname;
  return path.join(scriptsDir, "..", ".cache", "users.json");
}

/**
 * ユーザーキャッシュを読み込んで { id: name } の Map を返す
 * ファイルがなければ null を返す
 * @returns {Map<string, string>|null}
 */
function readUsersCache() {
  const cachePath = getUsersCachePath();
  try {
    const data = fs.readFileSync(cachePath, "utf8");
    const obj = JSON.parse(data);
    return new Map(Object.entries(obj));
  } catch {
    return null;
  }
}

/**
 * { id: name } の Map をユーザーキャッシュファイルに書き込む
 * ディレクトリがなければ作成する
 * @param {Map<string, string>} usersMap
 */
function writeUsersCache(usersMap) {
  const cachePath = getUsersCachePath();
  const dir = path.dirname(cachePath);
  fs.mkdirSync(dir, { recursive: true });
  const obj = Object.fromEntries(usersMap);
  fs.writeFileSync(cachePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

/**
 * ユーザーIDを名前に変換する
 * キャッシュがなければIDをそのまま返す（エラーにはしない）
 * @param {string} userId
 * @returns {string}
 */
function resolveUser(userId) {
  const cache = readUsersCache();
  if (!cache) return userId;
  return cache.get(userId) || userId;
}

/**
 * ユーザーグループキャッシュファイルのパスを返す
 * @returns {string}
 */
function getUsergroupsCachePath() {
  const scriptsDir = __dirname;
  return path.join(scriptsDir, "..", ".cache", "usergroups.json");
}

/**
 * ユーザーグループキャッシュを読み込んで { id: name } の Map を返す
 * @returns {Map<string, string>|null}
 */
function readUsergroupsCache() {
  const cachePath = getUsergroupsCachePath();
  try {
    const data = fs.readFileSync(cachePath, "utf8");
    const obj = JSON.parse(data);
    return new Map(Object.entries(obj));
  } catch {
    return null;
  }
}

/**
 * { id: name } の Map をユーザーグループキャッシュに書き込む
 * @param {Map<string, string>} groupsMap
 */
function writeUsergroupsCache(groupsMap) {
  const cachePath = getUsergroupsCachePath();
  const dir = path.dirname(cachePath);
  fs.mkdirSync(dir, { recursive: true });
  const obj = Object.fromEntries(groupsMap);
  fs.writeFileSync(cachePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

/**
 * ユーザーグループIDを名前に変換する
 * キャッシュがなければIDをそのまま返す
 * @param {string} groupId
 * @returns {string}
 */
function resolveUsergroup(groupId) {
  const cache = readUsergroupsCache();
  if (!cache) return groupId;
  return cache.get(groupId) || groupId;
}

/**
 * チャンネルキャッシュがなければ自動取得する
 */
async function ensureChannelCache() {
  if (readCache()) return;
  const { fetchAllPages } = require("./common");
  const channels = await fetchAllPages(
    "conversations.list",
    { types: "public_channel", limit: "1000" },
    "channels"
  );
  const channelMap = new Map();
  for (const ch of channels) {
    channelMap.set(ch.name, ch.id);
  }
  writeCache(channelMap);
}

/**
 * ユーザー・ユーザーグループキャッシュがなければ自動取得する
 */
async function ensureUsersCache() {
  if (readUsersCache() && readUsergroupsCache()) return;
  const { fetchAllPages, fetchSlackApi } = require("./common");

  if (!readUsersCache()) {
    const members = await fetchAllPages("users.list", { limit: "1000" }, "members");
    const usersMap = new Map();
    for (const m of members) {
      if (m.deleted) continue;
      const name = m.profile.display_name || m.real_name || m.name;
      usersMap.set(m.id, name);
    }
    writeUsersCache(usersMap);
  }

  if (!readUsergroupsCache()) {
    const groupData = await fetchSlackApi("usergroups.list");
    const groupsMap = new Map();
    for (const g of groupData.usergroups || []) {
      groupsMap.set(g.id, g.handle || g.name);
    }
    writeUsergroupsCache(groupsMap);
  }
}

module.exports = {
  getCachePath, readCache, writeCache, resolveChannel,
  getUsersCachePath, readUsersCache, writeUsersCache, resolveUser,
  getUsergroupsCachePath, readUsergroupsCache, writeUsergroupsCache, resolveUsergroup,
  ensureChannelCache, ensureUsersCache,
};
