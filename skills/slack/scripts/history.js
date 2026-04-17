"use strict";

const { fetchSlackApi, formatMessage } = require("./common");
const { ensureChannelCache, ensureUsersCache, resolveChannel } = require("./cache");

async function main() {
  const channelArg = process.argv[2];
  const limit = process.argv[3] || "20";

  if (!channelArg) {
    process.stderr.write("使い方: history.js <channel> [limit]\n");
    process.exit(1);
  }

  await ensureChannelCache();
  await ensureUsersCache();

  const channelId = resolveChannel(channelArg);
  const data = await fetchSlackApi("conversations.history", { channel: channelId, limit });
  const messages = data.messages || [];
  for (const msg of messages) {
    console.log(formatMessage(msg));
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}
