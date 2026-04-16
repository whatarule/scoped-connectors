"use strict";

const { readStdin, checkOk } = require("./common");
const { readCache, writeCache } = require("./cache");

const isAppend = process.argv.includes("--append");

async function main() {
  const data = await readStdin();
  checkOk(data);

  const channels = data.channels || [];

  // チャンネル一覧を表示
  for (const ch of channels) {
    console.log(`${ch.name}\t${ch.id}`);
  }

  // キャッシュを更新
  let channelMap;
  if (isAppend) {
    // --append: 既存キャッシュに追記
    channelMap = readCache() || new Map();
  } else {
    // 新規作成
    channelMap = new Map();
  }

  for (const ch of channels) {
    channelMap.set(ch.name, ch.id);
  }

  writeCache(channelMap);
}

main().catch((err) => {
  process.stderr.write(`エラー: ${err.message}\n`);
  process.exit(1);
});
