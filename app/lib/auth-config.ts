// Single source of truth for the session signing key. Every file that
// needs to sign or verify a session JWT imports SECRET_KEY from here —
// never declare a separate copy elsewhere. Multiple independent copies
// is what caused login/session verification to silently disagree earlier.
import "server-only";
if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is not set");
}

export const SECRET_KEY = new TextEncoder().encode(process.env.SESSION_SECRET);