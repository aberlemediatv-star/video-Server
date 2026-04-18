import type { FastifyReply, FastifyRequest } from "fastify";
import { oidcEnabled, verifyBearer } from "./oidc.js";

const key = process.env.ADMIN_API_KEY?.trim();

/**
 * Mutations-Schutz. Akzeptiert:
 *  - OIDC-Bearer (falls OIDC_ISSUER_URL gesetzt), oder
 *  - X-Admin-Key (falls ADMIN_API_KEY gesetzt).
 * Ist weder OIDC noch ADMIN_API_KEY aktiv, sind POSTs offen (nur Dev).
 */
export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (oidcEnabled()) {
    const authz = req.headers.authorization;
    if (typeof authz !== "string" || !/^Bearer\s+/i.test(authz)) {
      void reply.code(401).send({ error: "missing bearer" });
      return;
    }
    const token = authz.replace(/^Bearer\s+/i, "").trim();
    try {
      await verifyBearer(token);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      void reply.code(401).send({ error: "invalid token", detail: msg });
      return;
    }
  }
  if (!key) return;
  const got = req.headers["x-admin-key"];
  if (typeof got !== "string" || got !== key) {
    void reply.code(401).send({ error: "unauthorized" });
    return;
  }
}

export function adminConfigured(): boolean {
  return Boolean(key) || oidcEnabled();
}
