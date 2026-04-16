"use strict";
const { readStdin, checkOk, formatMessage } = require("./common");

async function main() {
  const data = await readStdin();
  checkOk(data);
  const messages = data.messages || [];
  for (const msg of messages) {
    console.log(formatMessage(msg));
  }
}

main().catch((err) => {
  process.stderr.write(`エラー: ${err.message}\n`);
  process.exit(1);
});
