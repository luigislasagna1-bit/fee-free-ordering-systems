import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const db = new Database('./prisma/dev.db');
console.log('=== ModifierGroups ===');
const groups = db.prepare('SELECT id, name, restaurantId, menuItemId, categoryId, libraryGroupId FROM ModifierGroup').all();
groups.forEach(g => console.log(JSON.stringify({
  id: g.id?.slice(0,8), name: g.name,
  rId: g.restaurantId?.slice(0,8) ?? null,
  mId: g.menuItemId?.slice(0,8) ?? null,
  cId: g.categoryId?.slice(0,8) ?? null,
  lib: g.libraryGroupId?.slice(0,8) ?? null
})));
console.log('\n=== Restaurants ===');
const rests = db.prepare('SELECT id, slug, name FROM Restaurant').all();
rests.forEach(r => console.log(JSON.stringify({ id: r.id?.slice(0,8), slug: r.slug, name: r.name })));
db.close();
