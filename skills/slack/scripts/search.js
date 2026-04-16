"use strict";
const { readStdin, checkOk, formatTs } = require("./common");

async function main() {
  const data = await readStdin();
  checkOk(data);
  const matches = (data.messages && data.messages.matches) || [];
  if (matches.length === 0) {
    console.log("検索結果が見つかりませんでした。");
    return;
  }
  for (const m of matches) {
    const datetime = formatTs(m.ts);
    const channel = m.channel ? m.channel.name : "unknown";
    const user = m.user || m.username || "unknown";
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
