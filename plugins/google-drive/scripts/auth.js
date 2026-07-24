"use strict";

const cli = require("./auth/cli");

if (require.main === module) {
  cli.main();
}

module.exports = cli;
