import type { FastifyReply, FastifyRequest } from "fastify";

// This only narrows an already authenticated session; it never authenticates a caller.
export async function requireExpectedSessionUser(request: FastifyRequest, reply: FastifyReply) {
  const expected = request.headers["x-mros-expected-user"];
  if (expected === undefined) return;
  if (typeof expected !== "string" || !expected.trim() || expected !== expected.trim()) {
    return reply.code(400).send({ message: "Invalid expected account" });
  }
  if (request.authType !== "session" || !request.currentUser || request.currentUser.id !== expected) {
    return reply.code(409).send({
      code: "SESSION_ACCOUNT_CHANGED",
      message: "The signed-in account changed. Sign in with the account that saved this work before retrying.",
    });
  }
}
