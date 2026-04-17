"use strict";

const { readStdin, checkOk } = require("./common");
const { readUsersCache, writeUsersCache } = require("./cache");

const isAppend = process.argv.includes("--append");

async function main() {
  const data = await readStdin();
  checkOk(data);

  const members = data.members || [];

  // ユーザー一覧を表示
  for (const m of members) {
    if (m.deleted) continue;
    const name = m.profile.display_name || m.real_name || m.name;
    console.log(`${m.id}\t${name}`);
  }

  // キャッシュを更新
  let usersMap;
  if (isAppend) {
    usersMap = readUsersCache() || new Map();
  } else {
    usersMap = new Map();
  }

  for (const m of members) {
    if (m.deleted) continue;
    const name = m.profile.display_name || m.real_name || m.name;
    usersMap.set(m.id, name);
  }

  writeUsersCache(usersMap);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}
