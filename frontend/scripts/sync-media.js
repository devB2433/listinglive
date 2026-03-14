#!/usr/bin/env node
/**
 * Sync content/media into frontend/public/media for local dev.
 * Prod uses Dockerfile.prod COPY content/media ./public/media.
 */
const fs = require("fs");
const path = require("path");

const frontendRoot = path.resolve(__dirname, "..");
const src = path.join(frontendRoot, "..", "content", "media");
const dest = path.join(frontendRoot, "public", "media");

if (!fs.existsSync(src)) {
  console.warn("[sync-media] content/media not found, skipping.");
  process.exit(0);
}

function copyRecursive(srcDir, destDir) {
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, name);
    const d = path.join(destDir, name);
    if (fs.statSync(s).isDirectory()) {
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

copyRecursive(src, dest);
console.log("[sync-media] Synced content/media -> frontend/public/media");
