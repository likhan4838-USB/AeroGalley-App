// ─────────────────────────────────────────────────────────────────────────────
// Profile-edit pipeline for the editable identity fields (name / email).
//
// This is the sibling of user-photo.ts and works the same way: the values live
// in the durable per-user store in lib/auth.ts (`harvest-user-profiles-v1`),
// which is what makes them survive logout/login. This module owns the steps
// around that store — validate, write to BOTH the durable store and the live
// session, and announce the change — so every avatar/name on screen refreshes
// without waiting for a navigation or reload.
//
// User ID and Role are deliberately NOT editable here: they come from the
// credential table and Role gates what the user may do.
// ─────────────────────────────────────────────────────────────────────────────

import type { AuthUser } from "@/lib/auth";
import { getAuthUser, setAuthUser, getStoredProfile, setStoredProfile } from "@/lib/auth";
import { AUTH_USER_UPDATED } from "@/lib/user-photo";

/** Reason an edit was rejected, for the caller to turn into a message. */
export type ProfileEditError = "empty-name" | "bad-email";

/** Deliberately loose — enough to catch typos, not to police valid addresses. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Store key used when nobody is signed in. The mobile LoginScreen navigates
 * without writing a session, so "no signed-in user" is the app's normal state,
 * not an edge case — edits made there still have to persist somewhere.
 */
const GUEST_ID = "__guest__";

/**
 * Role shown when there is no session to read one from. Role stays read-only —
 * it gates what a user may do, so it is never self-editable — this only decides
 * what the guest state displays instead of a bare em dash.
 */
const GUEST_ROLE = "Business Analyst";

/** The store key to read/write profile edits under, session or not. */
function profileKeyFor(user: AuthUser | null): string {
  return user?.userId ?? GUEST_ID;
}

/**
 * The identity fields to display: the session user (when there is one) with any
 * saved edits laid over the top, falling back to the guest record otherwise.
 */
export function getProfileFields(): { name: string; email: string; userId: string; role: string } {
  const user = getAuthUser();
  const edits = getStoredProfile(profileKeyFor(user));
  return {
    name:   edits?.name  ?? user?.name  ?? "Guest User",
    email:  edits?.email ?? user?.email ?? "",
    userId: user?.userId ?? "",
    role:   user?.role   ?? GUEST_ROLE,
  };
}

/**
 * Validate and store the signed-in user's edited name/email, returning the
 * trimmed values that were saved.
 *
 * Writes the durable store first — that is the source of truth. The session
 * write is best-effort: it can throw on quota, and the edit is still safe
 * because `getAuthUser()` re-applies it from the durable store.
 *
 * Throws a `ProfileEditError` string as the Error message on failure.
 */
export function saveProfileEdits(next: { name: string; email: string }): { name: string; email: string } {
  const user = getAuthUser();
  const name = next.name.trim();
  // An em dash is the placeholder shown for "not set", so treat it as blank.
  const email = next.email.trim() === "—" ? "" : next.email.trim();
  if (!name) throw new Error("empty-name" satisfies ProfileEditError);
  if (email && !EMAIL_RE.test(email)) throw new Error("bad-email" satisfies ProfileEditError);

  setStoredProfile(profileKeyFor(user), { name, email });
  // Only a real session can be updated; a guest edit lives in the durable store
  // alone, and getProfileFields() reads it back from there.
  if (user) {
    try { setAuthUser({ ...user, name, email }); } catch { /* session quota */ }
  }
  window.dispatchEvent(new Event(AUTH_USER_UPDATED));
  return { name, email };
}
