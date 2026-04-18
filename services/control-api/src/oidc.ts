import { createRemoteJWKSet, jwtVerify } from "jose";

const issuer = process.env.OIDC_ISSUER_URL?.trim();
const audience = process.env.OIDC_AUDIENCE?.trim();
const clientId = process.env.OIDC_CLIENT_ID?.trim();

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export function oidcEnabled(): boolean {
  return Boolean(issuer);
}

export function oidcPublicConfig() {
  return {
    enabled: oidcEnabled(),
    issuer: issuer ?? null,
    clientId: clientId ?? null,
    audience: audience ?? null,
  };
}

async function getJwks() {
  if (jwks) return jwks;
  if (!issuer) throw new Error("OIDC not configured");
  const discoveryUrl = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(discoveryUrl);
  if (!res.ok) {
    throw new Error(`OIDC discovery failed: ${res.status}`);
  }
  const conf = (await res.json()) as { jwks_uri?: string };
  if (!conf.jwks_uri) throw new Error("OIDC discovery has no jwks_uri");
  jwks = createRemoteJWKSet(new URL(conf.jwks_uri));
  return jwks;
}

/** Returns subject claim on success, throws on failure. */
export async function verifyBearer(token: string): Promise<string> {
  if (!issuer) throw new Error("OIDC not configured");
  const jwkSet = await getJwks();
  const { payload } = await jwtVerify(token, jwkSet, {
    issuer,
    audience: audience || undefined,
  });
  if (!payload.sub) throw new Error("token has no sub");
  return String(payload.sub);
}
