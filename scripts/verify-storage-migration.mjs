import assert from 'node:assert/strict';

// Only these nullable columns may be added; all historical values must survive.
const additions = { orders: ['products'], order_templates: ['products'], assets: ['images', 'orderProductId'] };
export function verifyStorageMigration(db, before) {
  for (const [name, rows] of Object.entries(before.rows)) {
    const oldColumns = before.columns[name];
    const columns = db.prepare(`PRAGMA table_info("${name}")`).all();
    assert.deepEqual(columns.slice(0, oldColumns.length), oldColumns, `${name}: existing columns changed`);
    assert.deepEqual(columns.slice(oldColumns.length).map(column => column.name), additions[name] || [], `${name}: unexpected migration`);
    const projection = oldColumns.map(column => `"${column.name}"`).join(',');
    assert.deepEqual(db.prepare(`SELECT ${projection} FROM "${name}" ORDER BY id`).all(), rows, `${name}: historical data changed`);
    for (const column of columns.slice(oldColumns.length)) {
      assert.equal(column.type, 'TEXT');
      assert.equal(column.notnull, 0);
      assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM "${name}" WHERE "${column.name}" IS NOT NULL`).get().count, 0);
    }
  }
  const schema = db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all();
  const stableSchema = entries => entries.filter(entry => !(entry.type === 'table' && additions[entry.name]));
  assert.deepEqual(stableSchema(schema), stableSchema(before.schema), 'Unrelated schema changed');
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
}
