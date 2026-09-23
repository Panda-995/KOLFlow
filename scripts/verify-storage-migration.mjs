import assert from 'node:assert/strict';

// This UI-only release must preserve the complete v1.4.5 schema and data.
export function verifyStorageMigration(db, before) {
  for (const [name, rows] of Object.entries(before.rows)) {
    assert.deepEqual(db.prepare(`PRAGMA table_info("${name}")`).all(), before.columns[name], `${name}: columns changed`);
    assert.deepEqual(db.prepare(`SELECT * FROM "${name}" ORDER BY id`).all(), rows, `${name}: historical data changed`);
  }
  assert.deepEqual(db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(), before.schema, 'Schema changed');
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
}
