import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { requireExpectedSessionUser } from "./sessionConstraint.js";

test("expected account constrains an authenticated session without granting access", async t => {
  const app = Fastify();
  t.after(() => app.close());
  let userId: string | null = "owner-a";
  let authType: "session" | "apiToken" = "session";
  let writes = 0;
  app.decorateRequest("currentUser", null);
  app.decorateRequest("authType", null);
  app.addHook("preHandler", async (request, reply) => {
    if (!userId) return reply.code(401).send({ message: "Authentication required" });
    request.authType = authType;
    request.currentUser = { id: userId } as NonNullable<typeof request.currentUser>;
  });
  app.addHook("preHandler", requireExpectedSessionUser);
  app.post("/work", async () => { writes++; return { ok: true }; });
  const send = (expected?: string) => app.inject({ method: "POST", url: "/work", headers: expected === undefined ? {} : { "x-mros-expected-user": expected } });
  assert.equal((await send()).statusCode, 200, "existing unbound clients remain compatible");
  assert.equal((await send("owner-a")).statusCode, 200);
  userId = "owner-b";
  const changed = await send("owner-a");
  assert.equal(changed.statusCode, 409);
  assert.equal(changed.json().code, "SESSION_ACCOUNT_CHANGED");
  assert.equal((await send("")).statusCode, 400);
  userId = "owner-a";
  authType = "apiToken";
  assert.equal((await send("owner-a")).statusCode, 409, "a token cannot impersonate the queue owner's session");
  userId = null;
  assert.equal((await send("owner-a")).statusCode, 401, "the header cannot log a user in");
  assert.equal(writes, 2, "mismatched requests never reach the write handler");
});
