import { AgentMail, vOutboundId, vOutboundStatus } from "@agentmail/convex";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
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

    // Capture the AgentMail thread id without waiting for anyone to open the
    // panel, so an inbound reply can be matched back to this pursuit.
    await ctx.scheduler.runAfter(15_000, internal.email.captureThreadRef, {
      threadId: thread._id,
      attempt: 1,
    });
    return outboundId;
  },
});

export const applyDeliveryState = internalMutation({
  args: {
    threadId: v.id("threads"),
    status: vOutboundStatus,
    agentMailThreadRef: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    const next =
      args.status === "pending"
        ? "sending"
        : args.status === "sent" || args.status === "delivered"
          ? "sent"
          : "failed";
    await ctx.db.patch(thread._id, {
      sendStatus: next,
      sentAt: next === "sent" ? (thread.sentAt ?? Date.now()) : thread.sentAt,
      agentMailThreadRef: args.agentMailThreadRef ?? thread.agentMailThreadRef,
    });
    return null;
  },
});

/**
 * Polls the outbound record until AgentMail assigns a thread id, then stores it.
 * Bounded retries: a message that never leaves pending stops being chased.
 */
export const captureThreadRef = internalAction({
  args: { threadId: v.id("threads"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const outboundId = await ctx.runQuery(internal.email.getOutboundId, {
      threadId: args.threadId,
    });
    if (!outboundId) return null;

    const delivery = await agentmail.status(
      ctx as unknown as Parameters<typeof agentmail.status>[0],
      outboundId as typeof vOutboundId.type,
    );
    if (delivery) {
      await ctx.runMutation(internal.email.applyDeliveryState, {
        threadId: args.threadId,
        status: delivery.status,
        agentMailThreadRef: delivery.threadId,
      });
      if (delivery.threadId) return null;
    }
    if (args.attempt < 5) {
      await ctx.scheduler.runAfter(30_000 * args.attempt, internal.email.captureThreadRef, {
        threadId: args.threadId,
        attempt: args.attempt + 1,
      });
    }
    return null;
  },
});

export const getOutboundId = internalQuery({
  args: { threadId: v.id("threads") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    return thread?.agentmailOutboundId ?? null;
  },
});

function readString(source: unknown, key: string) {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Inbound mail from AgentMail. Matched to a pursuit by the AgentMail thread id
 * recorded when the inquiry was sent. An unmatched reply is still recorded, so
 * a landlord's answer is never silently dropped.
 */
export const onReplyReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const agentMailThreadId =
      readString(args.message, "thread_id") ?? readString(args.thread, "thread_id");
    const from = readString(args.message, "from") ?? "the landlord";
    const text =
      readString(args.message, "text") ?? readString(args.message, "preview") ?? "";
    const summary = text.slice(0, 600);

    const thread = agentMailThreadId
      ? await ctx.db
          .query("threads")
          .withIndex("by_agentmail_thread", (q) =>
            q.eq("agentMailThreadRef", agentMailThreadId),
          )
          .first()
      : null;

    if (!thread) {
      await ctx.db.insert("activity", {
        listingId: null,
        type: "reply",
        message: `Reply from ${from} arrived in the inbox but matched no open pursuit`,
        createdAt: Date.now(),
        isDemo: false,
      });
      return null;
    }

    const listing = await ctx.db.get(thread.listingId);
    await ctx.db.patch(thread._id, {
      lastReplySummary: summary || null,
      lastReplyIntent: "received",
      lastReplyFrom: from,
      lastReplyAt: Date.now(),
    });
    if (listing && listing.status !== "viewing" && listing.status !== "closed") {
      await ctx.db.patch(listing._id, { status: "replied" });
    }
    await ctx.db.insert("activity", {
      sessionId: listing?.sessionId,
      listingId: thread.listingId,
      type: "reply",
      message: `${from} replied about ${listing?.title ?? "a pursuit"}`,
      createdAt: Date.now(),
      isDemo: false,
    });
    return null;
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
