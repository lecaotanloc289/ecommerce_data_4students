# ecommerce_data

Dữ liệu export MongoDB (`database.category.json`, `database.products.json`) và bản backup ảnh từ Firebase Storage (`elma-ecommerce-98c30.appspot.com`).

## Backup ảnh

```bash
node scripts/download-images.mjs                      # tải ảnh được tham chiếu → backup/images/<key>, ghi backup/manifest.json
node scripts/rewrite-urls.mjs <baseUrl> <outDir> [--nfc]  # ghi bản JSON với URL = <baseUrl>/<key> vào <outDir>/
```

- Ảnh lưu đúng object key của bucket Firebase (`products/7/a.jpg`, `Categories/…`, `category/icons/…`), nên chỉ cần đổi `baseUrl` khi chuyển host.
- `download-images.mjs` chạy lại được: bỏ qua file đã có đủ dung lượng.
- `rewrite-urls.mjs` không sửa file gốc; nó tách URL bị dính liền, bỏ ký tự rác và bỏ ảnh không phải Firebase (host `000webhostapp` đã chết, link console), in danh sách các ảnh bị bỏ.
## Về `token=` trong URL Firebase

`database.category.json`, `database.products.json` và `backup/manifest.json` (trường `sourceUrl`) chứa URL Firebase Storage có tham số `token=...`. Repo public nên các token này được công khai **có chủ đích**:

- Đây là *download token* của Firebase: chỉ cho **đọc đúng một file** ảnh đó, giống một link chia sẻ.
- Token **không** cho ghi, sửa, xoá, hay liệt kê file trong bucket, và không cho truy cập project Firebase/Google Cloud.
- Các ảnh này vốn là ảnh sản phẩm public, đã được mirror lên R2 (`media.lecaotanloc.dev`).

Muốn vô hiệu một token: Firebase Console → Storage → chọn file → *Revoke* access token.

## Cloudflare R2

- Bucket `elma-ecommerce-images`, public qua custom domain `https://media.lecaotanloc.dev/<key>`.
- JSON đã trỏ sang R2: `backup/r2/database.category.json`, `backup/r2/database.products.json`
  (sinh bằng `node scripts/rewrite-urls.mjs https://media.lecaotanloc.dev backup/r2`).
- Upload lại / thêm ảnh: `wrangler r2 bulk put` chỉ gán 1 content-type mỗi lần chạy, nên tách theo loại:

  ```bash
  jq --arg t image/jpeg --arg root "$PWD/backup/images/" \
    '[to_entries[]|select(.value.contentType==$t)|{key:.key,file:($root+.key)}]' backup/manifest.json > /tmp/r2-jpeg.json
  npx wrangler r2 bulk put elma-ecommerce-images --remote --force -f /tmp/r2-jpeg.json --ct image/jpeg --cc 'public, max-age=604800'
  # lặp lại với image/png
  ```
- Đổi host khác: gắn domain mới vào bucket (`wrangler r2 bucket domain add`) rồi chạy lại `rewrite-urls.mjs` với base URL mới.

## Dự phòng: jsDelivr (lấy ảnh từ chính repo GitHub này)

Khi R2 / `media.lecaotanloc.dev` không truy cập được, dùng bộ JSON trỏ sang jsDelivr — CDN miễn phí phục vụ file thẳng từ repo public này:

- `backup/jsdelivr/database.category.json`, `backup/jsdelivr/database.products.json`
- URL ảnh: `https://cdn.jsdelivr.net/gh/lecaotanloc289/ecommerce_data_4students@main/backup/images/<key>`
- Sinh lại:

  ```bash
  node scripts/rewrite-urls.mjs https://cdn.jsdelivr.net/gh/lecaotanloc289/ecommerce_data_4students@main/backup/images backup/jsdelivr --nfc
  ```

  `--nfc` là bắt buộc với host lấy file từ Git: key Firebase lưu chữ có dấu ở dạng Unicode NFD, còn Git (macOS) lưu tên file dạng NFC — thiếu cờ thì các ảnh tên tiếng Việt (vd. `products/83/90.-Pin-sạc-dự-phòng-…`) bị 404. R2 giữ key gốc nên **không** dùng cờ này cho R2.
- jsDelivr cache theo nhánh `@main` tới ~12 giờ; ảnh mới push có thể chưa hiện ngay.
- Lần đầu một file được gọi, jsDelivr phải kéo từ GitHub về — đôi khi trả `404` tạm thời, gọi lại sau vài giây là được.

| Nguồn | Bộ JSON | Ghi chú |
|---|---|---|
| Cloudflare R2 | `backup/r2/` | Chính, có CDN |
| jsDelivr ← GitHub | `backup/jsdelivr/` | Dự phòng, miễn phí |
| Firebase Storage | file gốc ở thư mục gốc | Có thể ngừng bất cứ lúc nào (billing Google) |
