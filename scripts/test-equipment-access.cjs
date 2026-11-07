const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../src/features/players/equipmentAccess.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const context = { exports: {}, require: name => {
  if (name === '../../data/players') return { EQUIPMENT_SLOTS: 7 };
  throw new Error('Unexpected dependency: ' + name);
} };
vm.runInNewContext(code, context);
const { equipmentAccess } = context.exports;
const items = count => Array.from({ length: count }, (_, index) => `item${index}`);
const player = (count, quests) => ({ equipamiento: items(count), quests });
const completed = name => [{ id: 'bot', name, done: true }];
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
test('missing quests lock seventh slot; six slots available', () => {
  const access = equipmentAccess(player(0));
  assert.equal(access.unlocked, false); assert.equal(access.limit, 6); assert.equal(access.slotsLeft, 6);
});
test('pending mission does not unlock the seventh slot', () => {
  assert.equal(equipmentAccess(player(6, [{ name: 'Misión de bot', done: false }])).slotsLeft, 0);
});
test('completed mission accepts accents and case like the top lane matcher', () => {
  for (const name of ['Misión de bot', 'MISION DE BOT', 'Quest de bot', 'bot']) {
    const access = equipmentAccess(player(6, completed(name)));
    assert.equal(access.unlocked, true); assert.equal(access.limit, 7); assert.equal(access.slotsLeft, 1);
  }
});
test('unrelated quests or substrings do not unlock', () => {
  for (const name of ['Quest de top', 'robot', 'botlane', 'botín']) {
    assert.equal(equipmentAccess(player(6, completed(name))).unlocked, false);
  }
});
test('full unlocked equipment has no extra add slot', () => {
  const access = equipmentAccess(player(7, completed('Misión de bot')));
  assert.equal(access.limit, 7); assert.equal(access.slotsLeft, 0); assert.equal(access.grandfathered, false);
});
test('existing seventh item retained and flagged without mutating any data', () => {
  const existing = player(7); const before = JSON.stringify(existing);
  const access = equipmentAccess(existing);
  assert.equal(access.limit, 6); assert.equal(access.slotsLeft, 0); assert.equal(access.grandfathered, true);
  assert.equal(JSON.stringify(existing), before); assert.equal(existing.equipamiento.length, 7);
});
test('removing legacy seventh does not allow re-adding until completion', () => {
  const locked = player(6);
  assert.equal(equipmentAccess(locked).slotsLeft, 0);
  locked.quests = completed('Misión de bot');
  assert.equal(equipmentAccess(locked).slotsLeft, 1);
});
test('mission reversal relocks but preserves previously equipped seventh item', () => {
  const existing = player(7, completed('Misión de bot'));
  assert.equal(equipmentAccess(existing).unlocked, true);
  existing.quests[0].done = false;
  assert.equal(equipmentAccess(existing).grandfathered, true);
  assert.equal(existing.equipamiento.length, 7);
});
test('quest completion is per character; hidden completed quests still qualify', () => {
  const mine = player(6, [{ name: 'Misión de bot', done: true, hidden: true }]);
  const other = player(6);
  assert.equal(equipmentAccess(mine).unlocked, true); assert.equal(equipmentAccess(other).unlocked, false);
});
console.log(`${passed} equipment gate tests passed`);