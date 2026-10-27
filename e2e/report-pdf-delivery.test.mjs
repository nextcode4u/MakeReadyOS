import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from '../apps/api/node_modules/typescript/lib/typescript.js';
const code = ts.transpileModule(readFileSync('apps/web/src/lib/reportPdfDelivery.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup() {
  const sent = [], events = new Map();
  let session = { userId: 'demo' }, timer;
  const native = { onmessage: null, postMessage: raw => sent.push(JSON.parse(raw)) };
  const window = { MakeReadyOSReports: native, addEventListener: (name, callback) => events.set(name, callback), setTimeout: callback => { timer = callback; return 1; }, clearTimeout: () => {} };
  const exports = {};
  vm.runInNewContext(code, { exports, window, crypto: webcrypto, Error, require: () => ({ getVerifiedSession: () => session, isCurrentSession: snapshot => snapshot === session, verifiedSessionEventName: 'session' }) });
  return { api: exports, native, sent, window, expire: () => timer(), logout: () => { session = { userId: null }; events.get('session')(); } };
}
test('requires native acknowledgement and preserves draft classification', async () => {
  const f = setup();
  let resolved = false;
  const pending = f.api.deliverReportPdf('encoded', 'test.pdf', 'draft', true).then(() => { resolved = true; });
  assert.equal(resolved, false);
  assert.equal(f.sent[0].kind, 'draft');
  f.native.onmessage({ data: JSON.stringify({ id: 'other', status: 'ready' }) });
  assert.equal(resolved, false);
  f.native.onmessage({ data: JSON.stringify({ id: f.sent[0].id, status: 'ready' }) });
  await pending;
  assert.equal(resolved, true);
});
test('native rejection, timeout and missing support never claim a download', async () => {
  for (const scenario of ['error', 'timeout', 'missing']) {
    const f = setup();
    if (scenario === 'missing') delete f.window.MakeReadyOSReports;
    const pending = f.api.deliverReportPdf('encoded', 'test.pdf', 'resident', true);
    if (scenario === 'timeout') f.expire();
    if (scenario === 'error') f.native.onmessage({ data: JSON.stringify({ id: f.sent[0].id, status: 'error' }) });
    await assert.rejects(pending);
    if (scenario === 'timeout') assert.equal(f.sent.at(-1).action, 'clear');
  }
});
test('account change clears private native reports and rejects the outstanding handoff', async () => {
  const f = setup();
  const pending = f.api.deliverReportPdf('encoded', 'test.pdf', 'resident', true);
  f.logout();
  await assert.rejects(pending);
  assert.equal(f.sent.at(-1).action, 'clear');
  await assert.rejects(f.api.deliverReportPdf('encoded', 'test.pdf', 'resident', true));
});
test('duplicate requests and oversize payloads are refused', async () => {
  const f = setup();
  await assert.rejects(f.api.deliverReportPdf('x'.repeat(22369625), 'test.pdf', 'resident', true));
  assert.equal(f.sent.length, 0);
  const pending = f.api.deliverReportPdf('encoded', 'test.pdf', 'draft', true);
  await assert.rejects(f.api.deliverReportPdf('encoded', 'test.pdf', 'resident', true));
  f.native.onmessage({ data: JSON.stringify({ id: f.sent[0].id, status: 'ready' }) });
  await pending;
});
