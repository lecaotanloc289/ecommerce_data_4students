# ecommerce_data

Dữ liệu export MongoDB (`database.category.json`, `database.products.json`) và bản backup ảnh từ Firebase Storage (`elma-ecommerce-98c30.appspot.com`).

## Backup ảnh

```bash
node scripts/download-images.mjs                      # tải ảnh được tham chiếu → backup/images/<key>, ghi backup/manifest.json
node scripts/rewrite-urls.mjs <baseUrl> <outDir>      # ghi bản JSON với URL = <baseUrl>/<key> vào <outDir>/
```

- Ảnh lưu đúng object key của bucket Firebase (`products/7/a.jpg`, `Categories/…`, `category/icons/…`), nên chỉ cần đổi `baseUrl` khi chuyển host.
- `download-images.mjs` chạy lại được: bỏ qua file đã có đủ dung lượng.
- `rewrite-urls.mjs` không sửa file gốc; nó tách URL bị dính liền, bỏ ký tự rác và bỏ ảnh không phải Firebase (host `000webhostapp` đã chết, link console), in danh sách các ảnh bị bỏ.
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
