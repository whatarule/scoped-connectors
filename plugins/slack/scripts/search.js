"use strict";

const { fetchSlackApi, formatTs, resolveMentions } = require("./common");
const { ensureUsersCache, resolveUser } = require("./cache");

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    process.stderr.write("使い方: search.js <keyword> [count] [--after YYYY-MM-DD] [--before YYYY-MM-DD]\n");
    process.exit(1);
  }

  // オプション解析
  let after = "";
  let before = "";
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--after" && args[i + 1]) {
      after = args[++i];
    } else if (args[i] === "--before" && args[i + 1]) {
      before = args[++i];
    } else {
      positional.push(args[i]);
    }
  }

  const keyword = positional[0];
  const count = positional[1] || "20";

  if (!keyword) {
    process.stderr.write("使い方: search.js <keyword> [count] [--after YYYY-MM-DD] [--before YYYY-MM-DD]\n");
    process.exit(1);
  }

  // クエリに期間指定を付加
  let query = keyword;
  if (after) query += ` after:${after}`;
  if (before) query += ` before:${before}`;

  await ensureUsersCache();

  const data = await fetchSlackApi("search.messages", { query, count });
  const matches = (data.messages && data.messages.matches) || [];
  if (matches.length === 0) {
    console.log("検索結果が見つかりませんでした。");
    return;
  }
  for (const m of matches) {
    const datetime = formatTs(m.ts);
    const channel = m.channel ? m.channel.name : "unknown";
    const user = resolveUser(m.user || m.username || "unknown");
    const text = resolveMentions(m.text || "");
    console.log(`[${datetime}] #${channel} (${m.ts}) ${user}: ${text}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}
