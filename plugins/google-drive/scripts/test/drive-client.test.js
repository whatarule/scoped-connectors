"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FILE_METADATA_FIELDS,
  filePath,
  createDriveClient,
} = require("../providers/drive-files");
const legacyDriveClient = require("../providers/drive-client");

test("legacy drive-client wrapper: drive-files と同じ API を export する", () => {
  assert.equal(legacyDriveClient.createDriveClient, createDriveClient);
  assert.equal(legacyDriveClient.filePath, filePath);
});

test("filePath: fileId を Drive files path 用に encode する", () => {
  assert.equal(filePath("abc/def"), "files/abc%2Fdef");
});

test("getFileMetadata: metadata 用 fields と supportsAllDrives を指定する", async () => {
  const calls = [];
  const client = createDriveClient({
    fetchDriveApi: async (apiPath, params) => {
      calls.push({ apiPath, params });
      return { data: { id: "FILE123", name: "Doc" } };
    },
  });

  const meta = await client.getFileMetadata("FILE123");

  assert.deepEqual(meta, { id: "FILE123", name: "Doc" });
  assert.deepEqual(calls, [{
    apiPath: "files/FILE123",
    params: {
      fields: FILE_METADATA_FIELDS,
      supportsAllDrives: true,
    },
  }]);
});

test("exportFile: Drive export endpoint と mimeType を指定する", async () => {
  const calls = [];
  const client = createDriveClient({
    fetchDriveApiRaw: async (apiPath, params) => {
      calls.push({ apiPath, params });
      return { buffer: Buffer.from("body") };
    },
  });

  const buffer = await client.exportFile("FILE123", "text/markdown");

  assert.equal(buffer.toString("utf8"), "body");
  assert.deepEqual(calls, [{
    apiPath: "files/FILE123/export",
    params: { mimeType: "text/markdown" },
  }]);
});

test("downloadFile: media endpoint と supportsAllDrives を指定する", async () => {
  const calls = [];
  const client = createDriveClient({
    fetchDriveApiRaw: async (apiPath, params) => {
      calls.push({ apiPath, params });
      return { buffer: Buffer.from("binary") };
    },
  });

  const buffer = await client.downloadFile("FILE123");

  assert.equal(buffer.toString("utf8"), "binary");
  assert.deepEqual(calls, [{
    apiPath: "files/FILE123",
    params: {
      alt: "media",
      supportsAllDrives: true,
    },
  }]);
});
