import bcrypt from "bcryptjs";

// Phase 4 auth (backend_tasks.md section 5.1/41: "Never store plaintext
// passwords... Use a modern password hashing library"). bcryptjs is a pure-JS
// implementation of the same bcrypt algorithm: no native build step, so it
// installs reliably in any environment, at the cost of being somewhat slower
// than a native binding — an acceptable trade for this sprint's scale.
const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Phase 4 code-review finding #2: a login attempt for an email that doesn't
// exist used to skip bcrypt.compare() entirely and fail fast, while a wrong
// password for a real account paid the full ~100-300ms bcrypt cost — a
// timing side-channel that let an attacker distinguish "no such account"
// from "wrong password" by response latency alone, defeating the login
// route's own stated goal of a generic failure.
//
// This is a fixed, precomputed bcrypt hash (12 rounds, matching
// SALT_ROUNDS) of an arbitrary string no real user could ever have chosen
// as their actual password hash — it does not correspond to any account,
// is never written to the database, and is never regenerated at runtime
// (regenerating per request would reintroduce a similar timing/CPU cost
// difference and defeats the purpose of a *fixed* comparison baseline).
// The login route always calls verifyPassword() against either the real
// user's hash or this constant, so the bcrypt.compare() cost is paid on
// every login attempt regardless of whether the account exists.
export const DUMMY_PASSWORD_HASH = "$2b$12$9kD9uQKPHj.sCkW1/wSJY.oL1I/iaYBIiGMrzApUUneeO3..wWvW6";
