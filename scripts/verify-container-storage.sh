#!/usr/bin/env bash
# Exercise upgrade, restart and an explicitly copied custom folder on native CPUs.
set -euo pipefail
old_image="$1"
new_image="$2"
storage_test_root="$(mktemp -d)"
legacy="$storage_test_root/data"
custom="$storage_test_root/共享文件夹/KOLFlow data"
mkdir -p "$legacy" "$custom"
container="kolflow-storage-${RANDOM}"
trap 'docker logs "$container" 2>/dev/null || true; docker rm -fv "$container" 2>/dev/null || true' EXIT

docker pull "$old_image"
docker run --rm -i -v "$legacy:/app/data" -v "$storage_test_root:/verification" \
  --entrypoint node "$old_image" --input-type=module <<'JS'
import db from './build/src/server/db.js';
import fs from 'node:fs';
db.prepare('INSERT INTO users (id,email,password,displayName) VALUES (?,?,?,?)').run('storage-user','storage@example.com','retained-hash','历史账号');
db.prepare('INSERT INTO orders (id,userId,orderNo,title,type,status,actualAmount,platforms) VALUES (?,?,?,?,?,?,?,?)').run('storage-order','storage-user','STORAGE-001','历史商单','paid','completed',1200,'[]');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
fs.writeFileSync('/verification/before.json', JSON.stringify({
  rows: Object.fromEntries(tables.map(({name}) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY id`).all()])),
  schema: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all()
}));
db.close();
JS

verify_running() {
  docker exec -i "$container" node --input-type=module <<'JS'
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
for (const [name, rows] of Object.entries(before.rows)) {
  assert.deepEqual(db.prepare(`SELECT * FROM ${name} ORDER BY id`).all(), rows);
}
assert.deepEqual(db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(), before.schema);
assert.equal(db.pragma('integrity_check', {simple:true}), 'ok');
assert.deepEqual(db.pragma('foreign_key_check'), []);
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
