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

module.exports = { getCachePath, readCache, writeCache, resolveChannel };
