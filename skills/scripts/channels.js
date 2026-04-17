"use strict";

const { fetchAllPages } = require("./common");
const { writeCache } = require("./cache");

async function main() {
  const channels = await fetchAllPages(
    "conversations.list",
    { types: "public_channel", limit: "1000" },
    "channels"
  );

  // チャンネル一覧を表示
  for (const ch of channels) {
    console.log(`${ch.name}\t${ch.id}`);
  }

  // キャッシュを更新
  const channelMap = new Map();
  for (const ch of channels) {
    channelMap.set(ch.name, ch.id);
  }
  writeCache(channelMap);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}
