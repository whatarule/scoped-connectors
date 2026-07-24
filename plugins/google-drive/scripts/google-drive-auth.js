"use strict";

const cli = require("./auth");

if (require.main === module) {
  cli.main();
}

module.exports = cli;
