"use strict";

const { fetchAllPages, fetchSlackApi } = require("./common");
const { writeUsersCache, writeUsergroupsCache } = require("./cache");

async function main() {
  // ユーザー取得
  const members = await fetchAllPages(
    "users.list",
    { limit: "1000" },
    "members"
  );

  // ユーザー一覧を表示
  const usersMap = new Map();
  for (const m of members) {
    if (m.deleted) continue;
    const name = m.profile.display_name || m.real_name || m.name;
    console.log(`${m.id}\t${name}`);
    usersMap.set(m.id, name);
  }
  writeUsersCache(usersMap);

  // ユーザーグループも同時取得
  const groupData = await fetchSlackApi("usergroups.list");
  const groupsMap = new Map();
  for (const g of groupData.usergroups || []) {
    groupsMap.set(g.id, g.handle || g.name);
  }
  writeUsergroupsCache(groupsMap);
  console.log(`${groupsMap.size}件のユーザーグループをキャッシュしました`);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}
