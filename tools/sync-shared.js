#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(REPO_ROOT, "shared", "scripts");
const TARGETS = [
  {
    name: "google-drive",
    dir: path.join(REPO_ROOT, "plugins", "google-drive", "scripts", "_shared"),
  },
];

const USAGE = [
  "Usage: node tools/sync-shared.js [--check] [--target name]",
  "",
  "Sync shared script source files to plugin-local vendored copies.",
  "",
  "Options:",
  "  --check        Report drift without writing files.",
  "  --target name  Sync only one configured target.",
  "  --help, -h     Show this help.",
  "",
  "Configured targets:",
  ...TARGETS.map((target) => `  - ${target.name}`),
  "",
].join("\n");

function relativePath(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

function parseArgs(args) {
  const options = {
    check: false,
    help: false,
    targetName: "",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--check") {
      options.check = true;
    } else if (arg === "--target") {
      if (!args[i + 1]) {
        throw new Error("--target には target 名を指定してください。");
      }
      options.targetName = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function assertDirectory(dirPath, label) {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`${label} path is not a directory: ${relativePath(dirPath)}`);
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`${label} directory does not exist: ${relativePath(dirPath)}`);
    }
    throw err;
  }
}

async function listFiles(rootDir, dir = rootDir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(rootDir, filePath));
    } else if (entry.isFile()) {
      files.push(path.relative(rootDir, filePath).split(path.sep).join("/"));
    }
  }

  return files.sort();
}

async function readFileMap(rootDir) {
  const files = await listFiles(rootDir);
  const map = new Map();
  for (const relative of files) {
    const filePath = path.join(rootDir, relative);
    const [buffer, stat] = await Promise.all([
      fs.readFile(filePath),
      fs.stat(filePath),
    ]);
    map.set(relative, {
      buffer,
      mode: stat.mode & 0o777,
    });
  }
  return map;
}

async function readOptionalDirectoryFileMap(dirPath, label) {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`${label} path is not a directory: ${relativePath(dirPath)}`);
    }
  } catch (err) {
    if (err.code === "ENOENT") return new Map();
    throw err;
  }
  return readFileMap(dirPath);
}

function compareFileMaps(sourceFiles, targetFiles) {
  const missing = [];
  const changed = [];
  const stale = [];

  for (const [relative, source] of sourceFiles.entries()) {
    const target = targetFiles.get(relative);
    if (!target) {
      missing.push(relative);
    } else if (!source.buffer.equals(target.buffer)) {
      changed.push(relative);
    }
  }

  for (const relative of targetFiles.keys()) {
    if (!sourceFiles.has(relative)) {
      stale.push(relative);
    }
  }

  return {
    missing,
    changed,
    stale,
    ok: missing.length === 0 && changed.length === 0 && stale.length === 0,
  };
}

function formatDrift(target, drift) {
  const lines = [`${target.name}: ${relativePath(target.dir)} is out of sync.`];
  for (const relative of drift.missing) {
    lines.push(`  missing: ${relative}`);
  }
  for (const relative of drift.changed) {
    lines.push(`  changed: ${relative}`);
  }
  for (const relative of drift.stale) {
    lines.push(`  stale: ${relative}`);
  }
  return lines.join("\n");
}

async function copySourceFiles(sourceFiles, target) {
  await fs.mkdir(target.dir, { recursive: true });
  for (const [relative, source] of sourceFiles.entries()) {
    const targetPath = path.join(target.dir, relative);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, source.buffer);
    await fs.chmod(targetPath, source.mode);
  }
}

async function resolveTargets(targetName) {
  if (!targetName) return TARGETS;
  const target = TARGETS.find((candidate) => candidate.name === targetName);
  if (!target) {
    throw new Error(
      `Unknown target: ${targetName}\nConfigured targets: ${TARGETS.map((candidate) => candidate.name).join(", ")}`
    );
  }
  return [target];
}

async function run(options) {
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  await assertDirectory(SOURCE_DIR, "Shared source");
  const sourceFiles = await readFileMap(SOURCE_DIR);
  if (sourceFiles.size === 0) {
    throw new Error(`Shared source directory is empty: ${relativePath(SOURCE_DIR)}`);
  }

  const targets = await resolveTargets(options.targetName);
  const messages = [];
  let failed = false;

  for (const target of targets) {
    const targetFiles = await readOptionalDirectoryFileMap(target.dir, `${target.name} target`);
    const drift = compareFileMaps(sourceFiles, targetFiles);

    if (options.check) {
      if (!drift.ok) {
        failed = true;
        messages.push(formatDrift(target, drift));
      } else {
        messages.push(`${target.name}: ok`);
      }
      continue;
    }

    if (drift.stale.length > 0) {
      failed = true;
      messages.push(formatDrift(target, drift));
      continue;
    }

    await copySourceFiles(sourceFiles, target);
    messages.push(`${target.name}: synced ${sourceFiles.size} files`);
  }

  process.stdout.write(`${messages.join("\n")}\n`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).then((code) => {
    process.exitCode = code;
  }).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  SOURCE_DIR,
  TARGETS,
  parseArgs,
  assertDirectory,
  readOptionalDirectoryFileMap,
  compareFileMaps,
  run,
};
