const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseArgs, buildPreview } = require("../post");

describe("parseArgs", () => {
  it("チャンネルと本文を取り出す", () => {
    const { channel, text } = parseArgs(["general", "こんにちは"]);
    assert.equal(channel, "general");
    assert.equal(text, "こんにちは");
  });

  it("複数の positional を本文として連結する", () => {
    const { text } = parseArgs(["general", "こんにちは", "世界"]);
    assert.equal(text, "こんにちは 世界");
  });

  it("--confirm が無ければ confirm は false（既定では投稿しない）", () => {
    assert.equal(parseArgs(["general", "hi"]).confirm, false);
  });

  it("--confirm を付けたときだけ confirm が true になる", () => {
    assert.equal(parseArgs(["general", "hi", "--confirm"]).confirm, true);
  });

  it("--thread-ts を取り出し、本文には混ぜない", () => {
    const { threadTs, text } = parseArgs(["general", "hi", "--thread-ts", "123.456"]);
    assert.equal(threadTs, "123.456");
    assert.equal(text, "hi");
  });
});

describe("buildPreview", () => {
  const base = {
    channelArg: "general",
    channelId: "C123",
    text: "こんにちは",
    threadTs: "",
    memberCount: 42,
    broadcasts: [],
  };

  it("投稿していないことを明示する", () => {
    assert.match(buildPreview(base), /まだ投稿していません/);
  });

  it("投稿先と参加人数を表示する", () => {
    const preview = buildPreview(base);
    assert.match(preview, /#general \(C123\)/);
    assert.match(preview, /42 人/);
  });

  it("ブロードキャストがあれば人数付きで警告する", () => {
    const preview = buildPreview({ ...base, broadcasts: ["@channel"] });
    assert.match(preview, /⚠️ @channel が飛びます/);
    assert.match(preview, /42 人に通知されます/);
  });

  it("ブロードキャストが無ければ警告を出さない", () => {
    assert.doesNotMatch(buildPreview(base), /飛びます/);
  });

  it("人数を取得できなくても確認表示は成立する", () => {
    const preview = buildPreview({ ...base, memberCount: undefined });
    assert.doesNotMatch(preview, /参加人数/);
    assert.match(preview, /#general/);
  });

  it("スレッド返信なら返信先を表示する", () => {
    assert.match(buildPreview({ ...base, threadTs: "123.456" }), /スレッド返信: 123\.456/);
  });

  it("--confirm の付け方を案内する", () => {
    assert.match(buildPreview(base), /--confirm/);
  });
});
