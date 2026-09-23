import assert from 'node:assert/strict';

// Permit only the two intentional additive changes in this release.
export function verifyStorageMigration(db, before) {
  for (const [name, rows] of Object.entries(before.rows)) {
    const columns = before.columns[name];
    const actualColumns = db.prepare(`PRAGMA table_info("${name}")`).all();
    assert.deepEqual(actualColumns.slice(0, columns.length), columns, `${name}: existing columns changed`);
    assert.deepEqual(actualColumns.slice(columns.length).map(c => c.name), name === 'users' ? ['tokenVersion'] : []);
    const projection = columns.map(c => `"${c.name}"`).join(',');
    assert.deepEqual(db.prepare(`SELECT ${projection} FROM "${name}" ORDER BY id`).all(), rows, `${name}: historical data changed`);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users WHERE tokenVersion IS NOT 0').get().count, 0);
  const schema = db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all();
  const normalized = schema.filter(row => row.name !== 'idx_todos_upcoming').map(row => ({
    ...row,
    sql: row.name === 'users' ? row.sql.replace(', tokenVersion INTEGER NOT NULL DEFAULT 0', '') : row.sql,
  }));
  assert.deepEqual(normalized, before.schema, 'Unexpected schema change beyond the session field and todo index');
  assert(schema.some(row => row.name === 'idx_todos_upcoming' && row.type === 'index'));
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
}
