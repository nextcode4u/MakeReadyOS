import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from '../apps/api/node_modules/typescript/lib/typescript.js';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('apps/web/src/lib/durableUploadBatch.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports, Error });
const files = [{ name: 'first.jpg' }, { name: 'second.jpg' }];
test('persists all files before sending and only acknowledges confirmed delivery', async () => {
  const events = [];
  const states = [];
  const outcomes = await exports.durableUploadBatch(files, {
    current: () => true, progress: rows => states.push(rows.map(row => row.status)),
    save: async file => { events.push(`save:${file.name}`); return { id: file.name }; },
    deliver: async id => { events.push(`send:${id}`); return { synced: id === 'first.jpg' }; },
  });
  assert.deepEqual(events, ['save:first.jpg', 'save:second.jpg', 'send:first.jpg', 'send:second.jpg']);
  assert.equal(outcomes[0].status, 'UPLOADED');
  assert.equal(outcomes[1].status, 'QUEUED');
  assert.ok(states.some(rows => rows.includes('UPLOADING')));
});
test('storage failure sends nothing for that file and does not block another file', async () => {
  const sent = [];
  const rows = await exports.durableUploadBatch(files, {
    current: () => true, progress: () => {},
    save: async file => { if (file.name === 'first.jpg') throw new Error('quota'); return { id: file.name }; },
    deliver: async id => { sent.push(id); return { synced: true }; },
  });
  assert.equal(rows[0].status, 'FAILED');
  assert.deepEqual(sent, ['second.jpg']);
});
test('lost confirmation retains the same queued job instead of enqueueing again', async () => {
  let saves = 0;
  const rows = await exports.durableUploadBatch(files, {
    current: () => true, progress: () => {},
    save: async file => { saves++; return { id: file.name }; },
    deliver: async () => { throw new Error('connection lost'); },
  });
  assert.equal(saves, 2);
  assert.ok(rows.every(row => row.status === 'QUEUED'));
});
test('account change during save prevents delivery and old-account progress', async () => {
  let current = true;
  await exports.durableUploadBatch(files, {
    current: () => current,
    save: async () => { current = false; return { id: 'retained-for-original-account' }; },
    deliver: async () => assert.fail('must not send'),
    progress: () => assert.fail('must not expose old-account progress'),
  });
});
