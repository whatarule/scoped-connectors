"use strict";

const { fetchSlackApi, formatTs } = require("./common");
const { ensureUsersCache, resolveUser } = require("./cache");

async function main() {
  const keyword = process.argv[2];
  const count = process.argv[3] || "20";

  if (!keyword) {
    process.stderr.write("使い方: search.js <keyword> [count]\n");
    process.exit(1);
  }

  await ensureUsersCache();

  const data = await fetchSlackApi("search.messages", { query: keyword, count });
  const matches = (data.messages && data.messages.matches) || [];
  if (matches.length === 0) {
    console.log("検索結果が見つかりませんでした。");
    return;
  }
  for (const m of matches) {
    const datetime = formatTs(m.ts);
    const channel = m.channel ? m.channel.name : "unknown";
    const user = resolveUser(m.user || m.username || "unknown");
    const text = m.text || "";
    console.log(`[${datetime}] #${channel} (${m.ts}) ${user}: ${text}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}
