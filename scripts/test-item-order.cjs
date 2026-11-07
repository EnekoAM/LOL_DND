const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/features/players', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const context = { exports: {}, requestAnimationFrame: fn => fn(), require: name => {
    if (imports[name]) return imports[name];
    if (name === 'react/jsx-runtime') return require(name);
    throw new Error('Unexpected dependency: ' + name);
  } };
  vm.runInNewContext(code, context); return context.exports;
}
const helpers = load('itemOrder.ts');
const { moveItem, canDropItem } = helpers;
const ReorderableItem = load('ReorderableItem.tsx', {
  './itemOrder': helpers,
  react: { useRef: () => ({ current: null }), useState: value => [value, () => {}] },
}).default;
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
test('forward/backward moves preserve contents and never mutate source', () => {
  const items = ['a', 'b', 'c', 'd'];
  assert.deepEqual(plain(moveItem(items, 0, 2)), ['b', 'c', 'a', 'd']);
  assert.deepEqual(plain(moveItem(items, 3, 0)), ['d', 'a', 'b', 'c']);
  assert.deepEqual(items, ['a', 'b', 'c', 'd']);
});
test('duplicate item names retain separate positions', () => {
  assert.deepEqual(plain(moveItem(['a', 'b', 'a'], 0, 1)), ['b', 'a', 'a']);
});
test('same, invalid and empty moves are safe no-ops', () => {
  const items = ['a', 'b'];
  for (const [from, to] of [[0, 0], [-1, 1], [0, 2], [2, 0], [0, 0.5]]) assert.equal(moveItem(items, from, to), items);
  const empty = []; assert.equal(moveItem(empty, 0, 0), empty);
});
test('drop rejects foreign lists/players, stale state and external drags', () => {
  const drag = { group: 'player:equipment', index: 0, items: ['a', 'b'] };
  assert.equal(canDropItem(drag, drag.group, ['a', 'b']), true);
  assert.equal(canDropItem(drag, 'player:build', ['a', 'b']), false);
  assert.equal(canDropItem(drag, 'other:equipment', ['a', 'b']), false);
  assert.equal(canDropItem(drag, drag.group, ['b', 'a']), false);
  assert.equal(canDropItem(null, drag.group, ['a', 'b']), false);
});
function fixture(index = 1, disabled = false, dragged = { current: null }, group = 'player:equipment') {
  const moves = [];
  const root = ReorderableItem({ name: 'Sword', index, items: ['a', 'b', 'c'], group, dragged, disabled,
    onMove: (from, to) => moves.push([from, to]), children: 'item info/remove card' });
  const toolbar = root.props.children[1];
  return { root, controls: toolbar.props.children, moves, dragged };
}
const event = () => ({ preventDefault() {}, stopPropagation() {}, dataTransfer: { setData() {} } });
test('arrow buttons and keyboard arrows move without activating item info', () => {
  const f = fixture(); const [left, handle, right] = f.controls;
  left.props.onClick(); right.props.onClick();
  handle.props.onKeyDown({ ...event(), key: 'ArrowLeft' });
  handle.props.onKeyDown({ ...event(), key: 'ArrowRight' });
  assert.deepEqual(f.moves, [[1, 0], [1, 2], [1, 0], [1, 2]]);
  assert.equal(f.root.props.onClick, undefined);
  assert.equal(handle.props.onClick, undefined);
  assert.equal(f.root.props.children[0], 'item info/remove card');
});
test('edge controls disabled and cannot move beyond bounds', () => {
  const first = fixture(0); const last = fixture(2);
  assert.equal(first.controls[0].props.disabled, true); assert.equal(last.controls[2].props.disabled, true);
  first.controls[0].props.onClick(); last.controls[2].props.onClick();
  assert.equal(first.moves.length, 0); assert.equal(last.moves.length, 0);
});
test('disabled controls cannot reorder or start a drag', () => {
  const f = fixture(1, true);
  assert.ok(f.controls.every(control => control.props.disabled));
  assert.equal(f.controls[1].props.draggable, false);
  f.controls[0].props.onClick();
  f.controls[1].props.onDragStart(event());
  f.controls[1].props.onKeyDown({ ...event(), key: 'ArrowRight' });
  assert.equal(f.moves.length, 0); assert.equal(f.dragged.current, null);
});
test('handle drag/drop moves in same list and clears drag session', () => {
  const shared = { current: null };
  const source = fixture(0, false, shared); const target = fixture(2, false, shared);
  source.controls[1].props.onDragStart(event());
  assert.equal(shared.current.index, 0);
  target.root.props.onDrop(event());
  assert.deepEqual(target.moves, [[0, 2]]); assert.equal(shared.current, null);
});
test('cross-list and stale drop never move items; cancelled drag clears state', () => {
  const shared = { current: null };
  const source = fixture(0, false, shared); const target = fixture(2, false, shared, 'player:build');
  source.controls[1].props.onDragStart(event()); target.root.props.onDrop(event());
  assert.equal(target.moves.length, 0);
  shared.current.items = ['changed']; source.root.props.onDrop(event());
  assert.equal(source.moves.length, 0);
  source.controls[1].props.onDragEnd(); assert.equal(shared.current, null);
});
console.log(`${passed} reorder tests passed`);