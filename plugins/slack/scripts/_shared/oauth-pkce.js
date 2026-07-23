"use strict";

const crypto = require("node:crypto");

function base64Url(input) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkcePair() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function createState() {
  return base64Url(crypto.randomBytes(24));
}

module.exports = {
  base64Url,
  createPkcePair,
  createState,
};
