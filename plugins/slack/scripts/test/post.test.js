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
    broadcasts: [],
  };

  it("投稿していないことを明示する", () => {
    assert.match(buildPreview(base), /まだ投稿していません/);
  });

  it("投稿先を表示する", () => {
    assert.match(buildPreview(base), /#general \(C123\)/);
  });

  it("本文を表示する", () => {
    assert.match(buildPreview(base), /こんにちは/);
  });

  it("ブロードキャストがあれば警告する", () => {
    assert.match(buildPreview({ ...base, broadcasts: ["@channel"] }), /⚠️ @channel が飛びます/);
  });

  it("ブロードキャストが無ければ警告を出さない", () => {
    assert.doesNotMatch(buildPreview(base), /飛びます/);
  });

  it("スレッド返信なら返信先を表示する", () => {
    assert.match(buildPreview({ ...base, threadTs: "123.456" }), /スレッド返信: 123\.456/);
  });

  it("--confirm の付け方を案内する", () => {
    assert.match(buildPreview(base), /--confirm/);
  });
});
