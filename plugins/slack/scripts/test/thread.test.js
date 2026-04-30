const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseSlackUrl } = require("../thread");

describe("parseSlackUrl", () => {
  it("正常な Slack URL をパースできる", () => {
    const result = parseSlackUrl(
      "https://example.slack.com/archives/C0EXAMPLE01/p1776320535121069"
    );
    assert.deepEqual(result, {
      channelId: "C0EXAMPLE01",
      ts: "1776320535.121069",
    });
  });

  it("異なるワークスペースの URL でもパースできる", () => {
    const result = parseSlackUrl(
      "https://mycompany.slack.com/archives/C01ABCDEF/p1713268800123456"
    );
    assert.deepEqual(result, {
      channelId: "C01ABCDEF",
      ts: "1713268800.123456",
    });
  });

  it("不正な URL は null を返す", () => {
    assert.equal(parseSlackUrl("https://example.com"), null);
  });

  it("空文字列は null を返す", () => {
    assert.equal(parseSlackUrl(""), null);
  });

  it("archives を含まない Slack URL は null を返す", () => {
    assert.equal(
      parseSlackUrl("https://example.slack.com/messages/C0EXAMPLE01"),
      null
    );
  });
});
