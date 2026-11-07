const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const context = { exports: {}, require: name => {
    if (imports[name]) return imports[name];
    if (name === 'react/jsx-runtime') return require(name);
    throw new Error('Unexpected dependency: ' + name);
  } };
  vm.runInNewContext(code, context); return context.exports;
}
const { replaceEquipment, canReplaceEquipment, isCurrentEquipmentTarget } = load('src/features/players/equipmentSwap.ts');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const plain = value => JSON.parse(JSON.stringify(value));
test('swap preserves count, order and original input', () => {
  const items = ['a', 'b', 'c'];
  assert.deepEqual(plain(replaceEquipment(items, 1, 'x', 6)), ['a', 'x', 'c']);
  assert.deepEqual(items, ['a', 'b', 'c']);
});
test('duplicate names target exactly one slot', () => {
  assert.deepEqual(plain(replaceEquipment(['a', 'a', 'b'], 1, 'x', 6)), ['a', 'x', 'b']);
});
test('invalid/empty/same replacement does not modify array', () => {
  const items = ['a', 'b'];
  for (const index of [-1, 2, 0.5]) assert.equal(replaceEquipment(items, index, 'x', 6), items);
  assert.equal(replaceEquipment(items, 0, '', 6), items); assert.equal(replaceEquipment(items, 0, 'a', 6), items);
});
test('six-slot equipment can be swapped even when all slots are full', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.equal(replaceEquipment(items, 5, 'x', 6)[5], 'x');
});
test('legacy seventh cannot be reused before bot mission completion', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.equal(canReplaceEquipment(items, 6, 6), false);
  assert.equal(replaceEquipment(items, 6, 'x', 6), items);
  assert.equal(replaceEquipment(items, 0, 'x', 6)[0], 'x');
  assert.equal(replaceEquipment(items, 6, 'x', 7)[6], 'x');
});
test('target rejects different player, reorder/removal and stale inventory', () => {
  const target = { playerName: 'A', index: 1, items: ['a', 'b'] };
  assert.equal(isCurrentEquipmentTarget(target, 'A', ['a', 'b']), true);
  assert.equal(isCurrentEquipmentTarget(target, 'B', ['a', 'b']), false);
  assert.equal(isCurrentEquipmentTarget(target, 'A', ['b', 'a']), false);
  assert.equal(isCurrentEquipmentTarget(target, 'A', ['a']), false);
  assert.equal(isCurrentEquipmentTarget(target, 'A', ['a', 'x']), false);
});
function walk(node) {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (!node || typeof node !== 'object') return [];
  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
  return [node, ...children.flatMap(walk)];
}
const Tile = load('src/features/calculos/ItemTile.tsx', {
  '../../components/ThumbImg': { default: () => null },
  '../../lib/cx': { cx: (...args) => args.filter(Boolean).join(' ') },
}).default;
test('swap button replaces remove button and leaves info action independent', () => {
  let changed = 0; let removed = 0; let inspected = 0;
  const nodes = walk(Tile({ name: 'Sword', item: {}, onChange: () => changed++, onRemove: () => removed++, onInspect: () => inspected++ }));
  const buttons = nodes.filter(node => node.type === 'button');
  assert.equal(buttons.length, 2);
  const swap = buttons.find(node => node.props['aria-label'] === 'Cambiar ítem Sword');
  swap.props.onClick(); assert.equal(changed, 1); assert.equal(removed, 0); assert.equal(inspected, 0);
  assert.equal(swap.props['aria-haspopup'], 'dialog'); assert.equal(swap.props.children, '⇄');
});
test('swap button respects disabled state', () => {
  const button = walk(Tile({ name: 'Sword', item: {}, onChange: () => {}, removeDisabled: true })).find(node => node.type === 'button');
  assert.equal(button.props.disabled, true);
});
const Picker = load('src/features/calculos/BuildPicker.tsx', {
  react: { useState: value => [value, () => {}], useMemo: fn => fn() },
  '../../components/Modal': { default: () => null },
  '../../components/ThumbImg': { default: () => null },
  '../../data/items': { ITEMS: [{ nombre: 'Sword' }, { nombre: 'Unavailable' }] },
  '../items/stock': { itemAvailability: item => ({ available: item.nombre === 'Sword' ? 1 : 0 }) },
  '../../lib/text': { normalizeName: text => text.toLowerCase(), matchesSearch: () => true },
}).default;
test('swap picker exposes available replacements plus a distinct Remove action', () => {
  let removed = 0; let added = '';
  const nodes = walk(Picker({ title: 'Swap', busy: false, onlyAvailable: true, onAdd: name => added = name, onRemove: () => removed++, onClose: () => {} }));
  const remove = nodes.find(node => node.type === 'button' && node.props.children === 'Quitar ítem del equipamiento');
  remove.props.onClick(); assert.equal(removed, 1); assert.equal(added, '');
  const choices = nodes.filter(node => node.props?.className === 'calc-picker-item');
  assert.equal(choices.length, 1); choices[0].props.onClick(); assert.equal(added, 'Sword');
});
test('locked seventh-slot picker allows only removal/close, no replacements', () => {
  const nodes = walk(Picker({ title: 'Locked', busy: false, allowSelection: false, onAdd: () => {}, onRemove: () => {}, onClose: () => {} }));
  assert.equal(nodes.some(node => node.props?.className === 'calc-picker-item'), false);
  assert.ok(nodes.some(node => node.type === 'button' && node.props.children === 'Quitar ítem del equipamiento'));
});
test('regular add picker does not gain removal controls', () => {
  const nodes = walk(Picker({ title: 'Add', busy: false, onAdd: () => {}, onClose: () => {} }));
  assert.equal(nodes.some(node => node.props?.children === 'Quitar ítem del equipamiento'), false);
});
console.log(`${passed} equipment swap tests passed`);