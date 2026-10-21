// Đổi URL ảnh Firebase trong 2 file JSON sang host mới, ghi ra <outDir>/ (không sửa file gốc).
//   node scripts/rewrite-urls.mjs <baseUrl> <outDir> [--nfc]
//   vd: node scripts/rewrite-urls.mjs https://pub-xxxx.r2.dev backup/r2
// URL mới = <baseUrl>/<object key>, key giữ nguyên như trong bucket Firebase (products/7/a.jpg).
// --nfc: chuẩn hoá key về Unicode NFC. Key Firebase có chữ có dấu ở dạng NFD (giữ nguyên trên R2),
// còn Git trên macOS lưu tên file dạng NFC → host lấy file từ repo (jsDelivr, GitHub raw) cần cờ này.
// Đồng thời làm sạch: tách URL dính liền, bỏ ký tự rác, bỏ ảnh không phải Firebase (host chết, link console).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const [baseUrl, outDir, flag] = process.argv.slice(2);
const nfc = flag === "--nfc";
if (!baseUrl || !outDir || (flag && !nfc)) {
  console.error("Usage: node scripts/rewrite-urls.mjs <baseUrl> <outDir> [--nfc]");
  process.exit(1);
}

const ROOT = new URL("..", import.meta.url).pathname;
const SOURCES = ["database.category.json", "database.products.json"];
const manifest = JSON.parse(await readFile(join(ROOT, "backup/manifest.json"), "utf8"));
const base = baseUrl.replace(/\/+$/, "");
const dropped = [];

function firebaseKey(url) {
  const m = url.match(/https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function newUrl(value, where) {
  const key = firebaseKey(value);
  if (!key) { dropped.push({ where, value }); return null; }
  if (!manifest[key]) throw new Error(`Thiếu file trong backup: ${key} (${where})`);
  const path = nfc ? key.normalize("NFC") : key;
  return `${base}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

for (const f of SOURCES) {
  const docs = JSON.parse(await readFile(join(ROOT, f), "utf8"));
  for (const d of docs) {
    const where = `${f} ${d._id.$oid} ${d.name}`;
    if (typeof d.icon === "string") d.icon = newUrl(d.icon, where);
    if (Array.isArray(d.images)) {
      const urls = d.images.flatMap((u) => u.split(/(?=https:\/\/)/).filter((s) => s.startsWith("https://")));
      d.images = [...new Set(urls.map((u) => newUrl(u, where)).filter(Boolean))];
    }
  }
  await mkdir(join(ROOT, outDir), { recursive: true });
  await writeFile(join(ROOT, outDir, f), JSON.stringify(docs, null, 2) + "\n");
}

console.log(`Đã ghi ${SOURCES.map((f) => join(outDir, f)).join(", ")}`);
if (dropped.length) console.log(`Bỏ ${dropped.length} ảnh không phải Firebase:\n` + dropped.map((x) => `  - ${x.where}: ${x.value}`).join("\n"));
