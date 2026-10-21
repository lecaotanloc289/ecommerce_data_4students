// Tải mọi ảnh Firebase Storage được tham chiếu trong 2 file JSON về backup/images/<object key>.
// Ghi backup/manifest.json: { "<object key>": { bytes, contentType, sourceUrl } } để bước rewrite/upload dùng lại.
// Chạy: node scripts/download-images.mjs
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SOURCES = ["database.categories.json", "database.products.json"];
const OUT = join(ROOT, "backup/images");
const MANIFEST = join(ROOT, "backup/manifest.json");
const CONCURRENCY = 8;

// https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded key>?alt=media&token=...
function firebaseKey(url) {
  const m = url.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Dữ liệu có chỗ 2 URL bị dính liền trong 1 chuỗi → tách theo "https://".
function collectUrls(node, out) {
  if (typeof node === "string") node.split(/(?=https:\/\/)/).forEach((u) => { if (firebaseKey(u)) out.add(u); });
  else if (Array.isArray(node)) node.forEach((n) => collectUrls(n, out));
  else if (node && typeof node === "object") Object.values(node).forEach((n) => collectUrls(n, out));
}

const urls = new Set();
for (const f of SOURCES) collectUrls(JSON.parse(await readFile(join(ROOT, f), "utf8")), urls);

let manifest = {};
try { manifest = JSON.parse(await readFile(MANIFEST, "utf8")); } catch {}

const queue = [...urls];
const failed = [];
let done = 0;

async function worker() {
  while (queue.length) {
    const url = queue.shift();
    const key = firebaseKey(url);
    const dest = join(OUT, key);
    try {
      if (manifest[key] && (await stat(dest).catch(() => null))?.size === manifest[key].bytes) { done++; continue; }
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      manifest[key] = { bytes: buf.length, contentType: res.headers.get("content-type"), sourceUrl: url };
      done++;
    } catch (e) {
      failed.push({ url, key, error: String(e.message ?? e) });
    }
    if ((done + failed.length) % 50 === 0) console.log(`${done + failed.length}/${urls.size}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await mkdir(dirname(MANIFEST), { recursive: true });
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`OK ${done}/${urls.size}, lỗi ${failed.length}`);
if (failed.length) { console.log(JSON.stringify(failed, null, 2)); process.exitCode = 1; }
