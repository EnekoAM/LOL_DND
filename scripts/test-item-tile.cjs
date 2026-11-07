const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const sourcePath = path.resolve(__dirname, '../src/features/calculos/ItemTile.tsx');
const code = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const context = { exports: {}, require: name => {
  if (name === '../../components/ThumbImg') return { default: () => null };
  if (name === '../../lib/cx') return { cx: (...parts) => parts.filter(Boolean).join(' ') };
  if (name === 'react/jsx-runtime') return require(name);
  throw new Error('Unexpected dependency: ' + name);
} };
vm.runInNewContext(code, context, { filename: sourcePath });
const ItemTile = context.exports.default;
const buttons = node => {
  if (!node || typeof node !== 'object') return [];
  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
  return [...(node.type === 'button' ? [node] : []), ...children.flatMap(buttons)];
};
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const item = { nombre: 'Espada', imagen: '/sword.png' };
test('native info button is keyboard accessible and labelled as a dialog trigger', () => {
  const info = buttons(ItemTile({ name: item.nombre, item, onInspect: () => {} }))[0];
  assert.equal(info.props.type, 'button');
  assert.equal(info.props['aria-haspopup'], 'dialog');
  assert.equal(info.props['aria-label'], 'Ver información de Espada');
});
test('inspect and remove are sibling buttons with independent actions', () => {
  let inspected = 0; let removed = 0;
  const root = ItemTile({ name: item.nombre, item, onInspect: () => inspected++, onRemove: () => removed++ });
  const [info, remove] = buttons(root);
  info.props.onClick(); assert.equal(inspected, 1); assert.equal(removed, 0);
  remove.props.onClick(); assert.equal(removed, 1); assert.equal(inspected, 1);
  assert.equal(root.props.onClick, undefined);
  assert.ok(root.props.children.includes(info)); assert.ok(root.props.children.includes(remove));
});
test('saving disables only removal; information remains available', () => {
  const [info, remove] = buttons(ItemTile({ name: item.nombre, item, onInspect: () => {}, onRemove: () => {}, removeDisabled: true }));
  assert.equal(remove.props.disabled, true); assert.equal(info.props.disabled, undefined);
});
test('other ItemTile usages keep their previous behavior unless inspection is enabled', () => {
  assert.equal(buttons(ItemTile({ name: item.nombre, item })).length, 0);
  assert.equal(buttons(ItemTile({ name: 'Missing', item: undefined, onInspect: () => {} })).length, 0);
});
console.log(`${passed} item tile tests passed`);