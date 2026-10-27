import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Explicitly opt into mutations against a disposable loopback API, never production.
test('attachment retry is scoped, concurrent-safe, and rejects changed content', {
  skip: process.env.ATTACHMENT_RETRY_TEST !== '1',
}, async () => {
  const base = process.env.TEST_API_URL;
  assert.ok(base && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname));
  assert.ok(process.env.TEST_USER && process.env.TEST_PASSWORD);
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: process.env.TEST_USER, password: process.env.TEST_PASSWORD }),
  });
  assert.equal(login.status, 200, await login.clone().text());
  const auth = await login.json();
  const headers = { cookie: login.headers.getSetCookie().map(value => value.split(';')[0]).join('; '), 'x-csrf-token': auth.csrfToken, 'x-mros-expected-user': auth.user.id };
  const work = await (await fetch(`${base}/my-work`, { headers })).json();
  assert.ok(work.items.length >= 2, 'Need two demo assignments');
  const ids = new Set();
  const item = work.items[0].id;
  const uploadId = randomUUID();
  const send = async (target = item, token = uploadId, text = 'synthetic attachment test', stage = 'INITIAL_WALK') => {
    const body = new FormData();
    body.append('file', new Blob([text], { type: 'text/plain' }), 'retry-test.txt');
    const response = await fetch(`${base}/make-ready-items/${target}/attachment-uploads/${token}?inspectionStage=${stage}`, { method: 'POST', headers, body });
    const result = await response.json();
    if (result.attachment) ids.add(result.attachment.id);
    return { status: response.status, result };
  };
  try {
    const first = await send();
    assert.equal(first.status, 201, JSON.stringify(first.result));
    const repeated = await send();
    assert.equal(repeated.status, 200);
    assert.equal(repeated.result.attachment.id, first.result.attachment.id);
    const concurrentToken = randomUUID();
    const [a, b] = await Promise.all([send(item, concurrentToken), send(item, concurrentToken)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 201]);
    assert.equal(a.result.attachment.id, b.result.attachment.id);
    const otherTurn = await send(work.items[1].id);
    assert.equal(otherTurn.status, 201);
    assert.notEqual(otherTurn.result.attachment.id, first.result.attachment.id);
    assert.equal((await send(item, uploadId, 'changed attachment bytes')).status, 409);
    assert.equal((await send(item, uploadId, 'synthetic attachment test', 'GENERAL')).status, 409);
    assert.equal((await send(item, 'invalid-token')).status, 400);
    const unauthorized = await fetch(`${base}/make-ready-items/${item}/attachment-uploads/${uploadId}`, { method: 'POST' });
    assert.equal(unauthorized.status, 401);
  } finally {
    for (const id of ids) {
      const response = await fetch(`${base}/attachments/${id}`, { method: 'DELETE', headers });
      assert.ok(response.ok, await response.text());
    }
  }
});
