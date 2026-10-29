// Runs in middleware (edge) and route handlers, so only Web Crypto is used here.

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // stay logged in for a year

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The value a logged-in browser holds in its session cookie. Derived from the
 * password, so changing APP_PASSWORD logs every device out.
 */
export async function sessionToken(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET || process.env.APP_PASSWORD;
  return secret ? hmacHex(secret, "meal-calories-session-v1") : null;
}

/** Compare a submitted password without leaking its length or prefix through timing. */
export async function passwordMatches(submitted: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const [a, b] = await Promise.all([hmacHex("pw", submitted), hmacHex("pw", expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
