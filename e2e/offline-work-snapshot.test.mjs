import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from '../apps/api/node_modules/typescript/lib/typescript.js';

const source = ts.transpileModule(readFileSync(new URL('../apps/web/src/lib/offlineWorkSnapshot.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const phrase = 'separate offline test phrase';
const data = { target: { id: 'tech' }, items: [{ id: 'turn1', unitNumber: '105', property: { name: 'Demo' }, status: 'MAKE_READY', resident: 'PRIVATE RESIDENT', code: 'SECRET CODE', notes: 'PRIVATE NOTES' }] };
function setup() {
  const storage = new Map();
  let session = { userId: 'tech', generation: 1 };
  const exports = {};
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const location = { origin: 'https://demo.example.test' };
  vm.runInNewContext(source, { exports, require: () => ({ getVerifiedSession: () => session, isCurrentSession: value => value === session }), crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, btoa, atob, localStorage, location });
  return { api: exports, storage, localStorage, location, changeSession: () => { session = { userId: 'other', generation: 2 }; } };
}
test('encrypted allowlisted copy unlocks without accepting a session', async () => {
  const { api, storage } = setup();
  await api.enableWorkSnapshot(data, phrase);
  const raw = storage.get(api.snapshotKey);
  for (const secret of ['PRIVATE RESIDENT', 'SECRET CODE', 'PRIVATE NOTES', '105', 'MAKE_READY']) assert.ok(!raw.includes(secret));
  const result = await api.openWorkSnapshot(phrase);
  assert.equal(result.rows[0].unit, '105');
  assert.deepEqual(Object.keys(result.rows[0]).sort(), ['cleaning', 'id', 'moveIn', 'paint', 'preparation', 'property', 'status', 'unit']);
  await assert.rejects(api.openWorkSnapshot('incorrect passphrase'));
});
test('requires strong phrase and own work', async () => {
  const { api } = setup();
  await assert.rejects(api.enableWorkSnapshot(data, 'short'));
  await assert.rejects(api.enableWorkSnapshot({ ...data, target: { id: 'other' } }, phrase));
});
test('clear and owner changes preserve queued work', async () => {
  const { api, storage } = setup();
  storage.set('queued-work', 'keep');
  await api.enableWorkSnapshot(data, phrase);
  api.checkSnapshotOwner('other');
  assert.equal(api.snapshotMetadata(), null);
  assert.equal(storage.get('queued-work'), 'keep');
  assert.equal(await api.updateWorkSnapshot(data), false);
});
test('expiry and origin changes fail closed', async () => {
  const { api, location } = setup();
  await api.enableWorkSnapshot(data, phrase);
  assert.equal(api.snapshotMetadata(Date.now() + api.snapshotLifetime + 1), null);
  await api.enableWorkSnapshot(data, phrase);
  location.origin = 'https://other.example.test';
  assert.equal(api.snapshotMetadata(), null);
});
test('metadata tampering cannot extend expiry', async () => {
  const { api, storage } = setup();
  await api.enableWorkSnapshot(data, phrase);
  const value = JSON.parse(storage.get(api.snapshotKey));
  value.savedAt -= 1; value.expiresAt -= 1;
  storage.set(api.snapshotKey, JSON.stringify(value));
  await assert.rejects(api.openWorkSnapshot(phrase));
});
test('clearing or changing session during derivation cannot resurrect a copy', async () => {
  const { api, changeSession } = setup();
  const pending = api.enableWorkSnapshot(data, phrase);
  api.clearWorkSnapshot();
  await assert.rejects(pending);
  const other = api.enableWorkSnapshot(data, phrase);
  changeSession();
  await assert.rejects(other);
  assert.equal(api.snapshotMetadata(), null);
});
test('clearing during write and unlock fails closed', async () => {
  const { api } = setup();
  await api.enableWorkSnapshot(data, phrase);
  const write = api.updateWorkSnapshot(data);
  const unlock = api.openWorkSnapshot(phrase);
  api.clearWorkSnapshot();
  assert.equal(await write, false);
  await assert.rejects(unlock);
  assert.equal(api.snapshotMetadata(), null);
});
test('storage quota failure is not acknowledged as saved', async () => {
  const { api, localStorage } = setup();
  localStorage.setItem = () => { throw new Error('quota'); };
  await assert.rejects(api.enableWorkSnapshot(data, phrase));
  assert.equal(await api.updateWorkSnapshot(data), false);
});
