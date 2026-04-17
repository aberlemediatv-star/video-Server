import type { FastifyReply, FastifyRequest } from "fastify";

const key = process.env.ADMIN_API_KEY?.trim();

/** Wenn ADMIN_API_KEY gesetzt ist, muss X-Admin-Key übereinstimmen (Mutations & Presign). */
export function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  if (!key) return;
  const got = req.headers["x-admin-key"];
  if (typeof got !== "string" || got !== key) {
    void reply.code(401).send({ error: "unauthorized" });
    return;
  }
}

export function adminConfigured(): boolean {
  return Boolean(key);
}
