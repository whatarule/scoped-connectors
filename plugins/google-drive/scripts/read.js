"use strict";

const cli = require("./read/cli");

if (require.main === module) {
  cli.main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = cli;
