#!/usr/bin/env bash
# Exercise upgrade, restart and an explicitly copied custom folder on native CPUs.
set -euo pipefail
old_image="$1"
new_image="$2"
storage_test_root="$(mktemp -d)"
legacy="$storage_test_root/data"
custom="$storage_test_root/共享文件夹/KOLFlow data"
mkdir -p "$legacy" "$custom"
chmod 755 "$storage_test_root"
container="kolflow-storage-${RANDOM}"
trap 'docker logs "$container" 2>/dev/null || true; docker rm -fv "$container" 2>/dev/null || true' EXIT

docker pull "$old_image"
docker run --rm -i -v "$legacy:/app/data" -v "$storage_test_root:/verification" \
  --entrypoint node "$old_image" --input-type=module <<'JS'
import db from './build/src/server/db.js';
import fs from 'node:fs';
db.prepare('INSERT INTO users (id,email,password,displayName) VALUES (?,?,?,?)').run('storage-user','upgrade@example.com','preserved-hash','历史账号');
db.prepare('INSERT INTO brands (id,userId,name,contacts) VALUES (?,?,?,?)').run('storage-brand','storage-user','历史品牌','[]');
db.prepare('INSERT INTO orders (id,userId,orderNo,title,type,status,actualAmount,platforms) VALUES (?,?,?,?,?,?,?,?)').run('storage-order','storage-user','UPGRADE-001','历史商单','paid','completed',1200,'["示例平台"]');
db.prepare('INSERT INTO order_templates (id,userId,name,title,type,platforms) VALUES (?,?,?,?,?,?)').run('storage-template','storage-user','历史模板','模板标题','paid','[]');
db.prepare('INSERT INTO payments (id,userId,orderNo,amount,type,date,dueDate,settledDate) VALUES (?,?,?,?,?,?,?,?)').run('storage-payment','storage-user','UPGRADE-001',1200,'paid','2026-09-01','2026-09-05','2026-09-01');
db.prepare('INSERT INTO assets (id,userId,orderId,productName,image) VALUES (?,?,?,?,?)').run('storage-asset','storage-user','storage-order','历史资产','data:image/png;base64,iVBORw0KGgo=');
db.prepare('INSERT INTO todos (id,userId,content,orderId,brandId) VALUES (?,?,?,?,?)').run('storage-todo','storage-user','历史待办','storage-order','storage-brand');
db.prepare('INSERT INTO settings (id,userId,email,apiKey,weeklyReport) VALUES (?,?,?,?,?)').run('storage-settings','storage-user','upgrade@example.com','preserved-api-key',1);
db.prepare('INSERT INTO publish_links (id,userId,orderId,platform,url) VALUES (?,?,?,?,?)').run('storage-link','storage-user','storage-order','示例平台','https://example.com/post');
db.prepare('INSERT INTO paid_promotions (id,userId,orderId,platform,amount) VALUES (?,?,?,?,?)').run('storage-promo','storage-user','storage-order','示例平台',50);
db.prepare('INSERT INTO comments (id,userId,orderId,content) VALUES (?,?,?,?)').run('storage-comment','storage-user','storage-order','历史评论');
db.prepare('INSERT INTO activity_logs (id,userId,action,details) VALUES (?,?,?,?)').run('storage-log','storage-user','create','历史操作');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
fs.writeFileSync('/verification/before.json', JSON.stringify({
  rows: Object.fromEntries(tables.map(({name}) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY id`).all()])),
  columns: Object.fromEntries(tables.map(({name}) => [name, db.prepare(`PRAGMA table_info(${name})`).all()])),
  schema: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all()
}));
db.close();
JS

verify_running() {
  docker exec --user node -i "$container" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
let ready = false;
for (let i=0; i<30; i++) {
  try { ready = (await fetch('http://127.0.0.1:3000/api/health')).ok; } catch {}
  if (ready) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
assert(ready, 'Mounted production service did not become healthy');
assert.equal((await (await fetch('http://127.0.0.1:3000/api/auth/check-users')).json()).hasUsers, true);
const db = (await import('./build/src/server/db.js')).default;
const before = JSON.parse(fs.readFileSync('/verification/before.json', 'utf8'));
const { verifyStorageMigration } = await import('./scripts/verify-storage-migration.mjs');
verifyStorageMigration(db, before);
assert.notEqual(fs.readFileSync('/proc/1/status','utf8').match(/^Uid:\s+(\d+)/m)?.[1], '0');
// A rolled-back write checks the selected folder is writable without changing fixtures.
db.exec('BEGIN; UPDATE users SET displayName = \'write probe\' WHERE id = \'storage-user\'; ROLLBACK;');
db.close();
console.log('PASS: historical account/order, all table snapshots, schema, integrity and writable data folder');
JS
}

for folder in "$legacy" "$custom"; do
  if [[ "$folder" == "$custom" ]]; then
    # The previous container is stopped before copying SQLite and its companion files.
    sudo cp -a "$legacy/." "$custom/"
    # Old root-run apps can leave root-owned SQLite in a user-owned NAS folder.
    sudo chown 1000:1000 "$custom"
    sudo chown root:root "$custom/database.sqlite"
    sudo chmod 600 "$custom/database.sqlite"
  fi
  docker run -d --name "$container" \
    -v "$folder:/app/data" -v "$storage_test_root:/verification:ro" \
    -e JWT_SECRET=kolflow-release-storage-isolated-secret \
    -e INVITE_CODE=storage-invite "$new_image"
  verify_running
  docker restart "$container"
  verify_running
  docker stop "$container"
  docker rm -v "$container"
done
echo 'PASS: old data in original folder, copied custom folder and restart persistence'
