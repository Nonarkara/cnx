#!/usr/bin/env node
// patch-og-wasm.mjs — post-build shims for the OpenNext worker.
//
// 1. opennextjs/cloudflare hard-imports `./cloudflare/images.js` even
//    when IMAGES binding is unset — we strip that import and any
//    handleImageRequest / handleCdnCgiImageRequest call sites, then
//    patch the if (/cdn-cgi/image/) and if (/_next/image) branches
//    to fall back to a direct fetch of the upstream origin.
//
// 2. unenv 1.10 sometimes ships `node/tty.mjs` that imports
//    `./internal/tty/write-stream.mjs` — without the file. We
//    create a noop stub at the expected path so wrangler's bundler
//    can resolve it.
//
// Idempotent. Exits 0 even if patches are already applied.

import { readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

let touched = false;

// ─── 1. OpenNext worker.js — strip cloudflare/images import ────────
const workerPath = join(ROOT, ".open-next", "worker.js");
if (await exists(workerPath)) {
  let src = await readFile(workerPath, "utf8");

  // Remove the images import (and the //@ts-expect-error line above).
  const beforeImport = src;
  src = src.replace(
    /\/\/@ts-expect-error: Will be resolved by wrangler build\nimport \{[^}]*handleCdnCgiImageRequest[^}]*\} from "\.\/cloudflare\/images\.js";\n?/,
    "// cloudflare/images.js import removed by patch-og-wasm.mjs\n",
  );
  if (src !== beforeImport) {
    console.log("[patch] removed cloudflare/images.js import in worker.js");
    touched = true;
  }

  // Replace the cdn-cgi/image handler to fall back to fetch.
  const cdnCallRe = /(\s+)return handleCdnCgiImageRequest\(url, env\);/;
  if (cdnCallRe.test(src)) {
    src = src.replace(cdnCallRe, "$1return fetch(`${url}`, { headers: undefined });");
    console.log("[patch] replaced handleCdnCgiImageRequest with direct fetch");
    touched = true;
  }

  // Replace the /_next/image handler to fall back to fetch.
  const imgCallRe = /(\s+)return await handleImageRequest\(url, request\.headers, env\);/;
  if (imgCallRe.test(src)) {
    src = src.replace(imgCallRe, "$1return fetch(url.toString(), { headers: request.headers, redirect: \"follow\" });");
    console.log("[patch] replaced handleImageRequest with direct fetch");
    touched = true;
  }

  if (touched) await writeFile(workerPath, src, "utf8");
}

// ─── 2. unenv stub for missing tty write-stream ──────────────────
const stubDir = join(ROOT, "node_modules", "unenv", "dist", "runtime", "node", "internal", "tty");
const stubPath = join(stubDir, "write-stream.mjs");
if (!(await exists(stubPath))) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(stubDir, { recursive: true });
  await writeFile(
    stubPath,
    [
      "// Stub for unenv's missing tty.write-stream module.",
      "// Created by patch-og-wasm.mjs when the npm tree ships tty.mjs",
      "// without its internal write-stream.mjs.",
      "export class WriteStream {",
      "  write() { return true; } end() {} on() {} once() {}",
      "  emit() { return true; } destroy() {} cork() {} uncork() {}",
      "}",
      "export default WriteStream;",
      "",
    ].join("\n"),
    "utf8",
  );
  console.log("[patch] created unenv tty/write-stream.mjs stub");
  touched = true;
}

if (!touched) console.log("[patch-og-wasm] nothing to patch (already applied)");
process.exit(0);