import { getAuthUserId } from "@convex-dev/auth/server";
import type { Auth } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * Rows are owned by an opaque owner key, stored in the `sessionId` field.
 *
 * Signed out, that key is the anonymous id the browser keeps in localStorage.
 * Signed in, it is `user:<userId>`, derived on the server from the auth token
 * and never taken from the client, so a caller cannot read another account's
 * pursuits by guessing a key. Rows with no owner are the shared demo workspace.
 */
export async function ownerKey(
  ctx: { auth: Auth },
  anonymousSessionId: string | undefined,
) {
  const userId = await getAuthUserId(ctx);
  return userId ? userKey(userId) : anonymousSessionId;
}

export function userKey(userId: Id<"users">) {
  return `user:${userId}`;
}

export function isListingInSession(
  listing: Doc<"listings">,
  owner: string | undefined,
) {
  return listing.sessionId === undefined || listing.sessionId === owner;
}

export async function assertListingInSession(
  ctx: QueryCtx,
  listingId: Id<"listings">,
  owner: string | undefined,
) {
  const listing = await ctx.db.get(listingId);
  if (!listing) throw new Error("Pursuit not found.");
  if (!isListingInSession(listing, owner)) {
    throw new Error("This pursuit belongs to another search session.");
  }
  return listing;
}
