"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  CONFIG_PATH_ENV,
  DEFAULT_ALLOWED_DOMAINS,
  DEFAULT_CLIENT_ID,
  DEFAULT_CONFIG_PATH,
  getConfigPath,
  normalizeDomains,
  resolveClientId,
  resolveAllowedDomains,
  parseLoginArgs,
  normalizeAllowedFolderIds,
  loadReadSettings,
} = require("../settings/config");
const legacySettings = require("../settings/google-drive");

function writeTempConfig(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drive-settings-test-"));
  const configPath = path.join(dir, "config.json");
  fs.writeFileSync(configPath, content);
  return configPath;
}

test("legacy settings/google-drive wrapper: settings/config と同じ API を export する", () => {
  assert.equal(legacySettings.getConfigPath, getConfigPath);
  assert.equal(legacySettings.loadReadSettings, loadReadSettings);
});

test("getConfigPath: env が config path 既定値より優先される", () => {
  assert.equal(getConfigPath({ [CONFIG_PATH_ENV]: "/tmp/drive-config.json" }), "/tmp/drive-config.json");
  assert.equal(getConfigPath({}), DEFAULT_CONFIG_PATH);
});

test("normalizeDomains: 配列とカンマ区切り文字列を同じ形に正規化する", () => {
  assert.deepEqual(normalizeDomains([" Compass-e.com ", "@example.com", ""]), [
    "compass-e.com",
    "example.com",
  ]);
  assert.deepEqual(normalizeDomains("compass-e.com, example.com"), [
    "compass-e.com",
    "example.com",
  ]);
});

test("resolveClientId: CLI、env、config、legacy config、既定値の順に解決する", () => {
  assert.equal(
    resolveClientId(
      { clientId: " cli.apps.googleusercontent.com " },
      { clientId: "config.apps.googleusercontent.com" },
      { GOOGLE_DRIVE_CLIENT_ID: "env.apps.googleusercontent.com" }
    ),
    "cli.apps.googleusercontent.com"
  );
  assert.equal(
    resolveClientId(
      { clientId: "" },
      { clientId: "config.apps.googleusercontent.com" },
      { GOOGLE_DRIVE_CLIENT_ID: " env.apps.googleusercontent.com " }
    ),
    "env.apps.googleusercontent.com"
  );
  assert.equal(
    resolveClientId({ clientId: "" }, { client_id: "legacy.apps.googleusercontent.com" }, {}),
    "legacy.apps.googleusercontent.com"
  );
  assert.equal(resolveClientId({ clientId: "" }, {}, {}), DEFAULT_CLIENT_ID);
});

test("resolveAllowedDomains: env は config より優先され、merge せず replace する", () => {
  assert.deepEqual(
    resolveAllowedDomains(
      { allowedDomains: ["config.example.com"] },
      { GOOGLE_DRIVE_ALLOWED_DOMAINS: "env.example.com" }
    ),
    ["env.example.com"]
  );
  assert.deepEqual(resolveAllowedDomains({}, {}), DEFAULT_ALLOWED_DOMAINS);
});

test("parseLoginArgs: configLoader から login option defaults を適用する", () => {
  const loaded = [];
  const options = parseLoginArgs(
    ["--client-id", "cli.apps.googleusercontent.com"],
    { [CONFIG_PATH_ENV]: "/tmp/config.json" },
    (configPath) => {
      loaded.push(configPath);
      return { allowedDomains: ["example.com"] };
    }
  );

  assert.deepEqual(loaded, ["/tmp/config.json"]);
  assert.equal(options.clientId, "cli.apps.googleusercontent.com");
  assert.deepEqual(options.allowedDomains, ["example.com"]);
  assert.equal(options.configPath, "/tmp/config.json");
});

test("normalizeAllowedFolderIds: allowedFolderIds の型と ID 形式を検証する", () => {
  assert.deepEqual(normalizeAllowedFolderIds(undefined, "/tmp/config.json"), []);
  assert.deepEqual(normalizeAllowedFolderIds(["abc123", "DEF-456_x"], "/tmp/config.json"), [
    "abc123",
    "DEF-456_x",
  ]);
  assert.throws(() => normalizeAllowedFolderIds("abc", "/tmp/config.json"), /文字列配列/);
  assert.throws(() => normalizeAllowedFolderIds(["ok", "bad id!"], "/tmp/config.json"), /不正なID/);
});

test("loadReadSettings: config から allowedFolderIds を読み込む", () => {
  const configPath = writeTempConfig('{ "allowedFolderIds": ["abc123"] }');
  assert.deepEqual(loadReadSettings(configPath), {
    configPath,
    allowedFolderIds: ["abc123"],
  });
});
