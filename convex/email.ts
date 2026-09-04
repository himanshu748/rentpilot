import { AgentMail, vOutboundId, vOutboundStatus } from "@agentmail/convex";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { assertListingInSession } from "./session";
import { sendStatus } from "./schema";

const agentmail = new AgentMail(components.agentmail);

export const sendApprovedDraft = mutation({
  args: {
    threadId: v.id("threads"),
    sessionId: v.optional(v.string()),
    requestId: v.string(),
  },
  returns: vOutboundId,
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Inquiry thread not found.");
    const listing = await assertListingInSession(ctx, thread.listingId, args.sessionId);

    if (!process.env.AGENTMAIL_API_KEY) {
      throw new Error("AgentMail is not configured for this deployment.");
    }

    if (thread.sendRequestId === args.requestId && thread.agentmailOutboundId) {
      return thread.agentmailOutboundId as typeof vOutboundId.type;
    }
    if (thread.sendStatus === "sending" || thread.sendStatus === "sent") {
      throw new Error("This inquiry is already being sent or has been sent.");
    }
    if (thread.sendStatus !== "ready") {
      throw new Error("Save and approve the draft before sending.");
    }

    if (listing.isDemo) {
      throw new Error("Synthetic demo recipients are never emailed.");
    }
    if (!listing.contactEmail) {
      throw new Error("A verified recipient email is required.");
    }

    const inboxId = process.env.AGENTMAIL_INBOX_ID;
    if (!inboxId) throw new Error("AGENTMAIL_INBOX_ID is not configured.");

    const outboundId = await agentmail.sendMessage(ctx, inboxId, {
      to: listing.contactEmail,
      subject: thread.draftSubject,
      text: thread.draftBody,
      labels: ["rentpilot", `listing-${listing._id}`],
    });

    await ctx.db.patch(thread._id, {
      sendStatus: "sending",
      sendRequestId: args.requestId,
      agentmailOutboundId: outboundId,
    });
    await ctx.db.patch(listing._id, { status: "contacted" });
    await ctx.db.insert("activity", {
      sessionId: listing.sessionId,
      listingId: listing._id,
      type: "sent",
      message: `Approved inquiry queued for ${listing.contactEmail}`,
      createdAt: Date.now(),
      isDemo: false,
    });
    return outboundId;
  },
});

export const deliveryStatus = query({
  args: { outboundId: vOutboundId },
  returns: v.union(
    v.object({
      status: vOutboundStatus,
      agentmailMessageId: v.union(v.string(), v.null()),
      threadId: v.union(v.string(), v.null()),
      errorMessage: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => await agentmail.status(ctx, args.outboundId),
});

/**
 * Fold the AgentMail component's outbound lifecycle back into the pursuit
 * thread so the cockpit stops reporting "sending" after delivery resolves.
 * Safe to call repeatedly: it only writes when the mapped state actually moved.
 */
export const syncDeliveryState = mutation({
  args: {
    threadId: v.id("threads"),
    sessionId: v.optional(v.string()),
  },
  returns: sendStatus,
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Inquiry thread not found.");
    const listing = await assertListingInSession(ctx, thread.listingId, args.sessionId);
    if (!thread.agentmailOutboundId) return thread.sendStatus;

    const delivery = await agentmail.status(
      ctx,
      thread.agentmailOutboundId as typeof vOutboundId.type,
    );
    if (!delivery) return thread.sendStatus;

    const next =
      delivery.status === "pending"
        ? "sending"
        : delivery.status === "sent" || delivery.status === "delivered"
          ? "sent"
          : "failed";
    if (next === thread.sendStatus) return thread.sendStatus;

    await ctx.db.patch(thread._id, {
      sendStatus: next,
      sentAt: next === "sent" ? (thread.sentAt ?? Date.now()) : thread.sentAt,
      agentMailThreadRef: delivery.threadId ?? thread.agentMailThreadRef,
    });
    await ctx.db.insert("activity", {
      sessionId: listing.sessionId,
      listingId: listing._id,
      type: next === "sent" ? "sent" : "system",
      message:
        next === "sent"
          ? `AgentMail reported ${delivery.status} for ${listing.title}`
          : `AgentMail could not deliver the inquiry for ${listing.title}${
              delivery.errorMessage ? `: ${delivery.errorMessage}` : ""
            }`,
      createdAt: Date.now(),
      isDemo: false,
    });
    return next;
  },
});
