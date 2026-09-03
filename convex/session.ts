import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * Listings without a sessionId belong to the shared demo workspace and are
 * readable and editable by every visitor. Every other listing is reachable only
 * from the browser session that created it.
 */
export function isListingInSession(
  listing: Doc<"listings">,
  sessionId: string | undefined,
) {
  return listing.sessionId === undefined || listing.sessionId === sessionId;
}

export async function assertListingInSession(
  ctx: QueryCtx,
  listingId: Id<"listings">,
  sessionId: string | undefined,
) {
  const listing = await ctx.db.get(listingId);
  if (!listing) throw new Error("Pursuit not found.");
  if (!isListingInSession(listing, sessionId)) {
    throw new Error("This pursuit belongs to another search session.");
  }
  return listing;
}
