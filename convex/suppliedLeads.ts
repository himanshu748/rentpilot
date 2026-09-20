import { AgentMail, vOutboundId } from "@agentmail/convex";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUserKey } from "./session";
import { recipientEmail, sourceAge, verificationDraft } from "./leadEvidence";
import { formatMoney } from "./location";
import { reserveIntegrationUse } from "./rateLimits";
const mail = new AgentMail(components.agentmail);

export const list = query({
  args: {},
  handler: async ctx => {
    const owner = await requireUserKey(ctx);
    const leads = await ctx.db.query("suppliedLeads").withIndex("by_owner", q => q.eq("owner", owner)).order("desc").take(50);
    return await Promise.all(leads.map(async lead => {
      const inquiry = await ctx.db.query("leadInquiries").withIndex("by_lead", q => q.eq("leadId", lead._id)).first();
      const replies = inquiry ? await ctx.db.query("leadReplies").withIndex("by_inquiry", q => q.eq("inquiryId", inquiry._id)).take(20) : [];
      return { ...lead, draft: verificationDraft(lead.title, lead.requirements, lead.sourceDate), inquiry, replies };
    }));
  },
});
export const importListing = mutation({
  args: { title: v.string(), originalText: v.string(), provenance: v.string(), sourceDate: v.string(), permissionBasis: v.string(), contentPermission: v.boolean(), contactPermission: v.boolean(), recipient: v.string(), isFixture: v.boolean() },
  returns: v.id("suppliedLeads"),
  handler: async (ctx, args) => {
    const owner = await requireUserKey(ctx);
    if (!args.contentPermission || args.permissionBasis.trim().length < 10) throw new Error("Describe your permission to use this original text. A public URL alone is not permission.");
    if (args.title.trim().length < 3 || args.title.length > 120 || args.originalText.trim().length < 20 || args.originalText.length > 12000 || args.provenance.trim().length < 3 || args.provenance.length > 500 || args.permissionBasis.length > 1000) throw new Error("Provide a title, original listing text and its origin within the form limits.");
    if (sourceAge(args.sourceDate) === "invalid") throw new Error("Choose a valid source date, or leave it unknown.");
    if (args.recipient && !recipientEmail(args.recipient)) throw new Error("Use one valid recipient email address.");
    const leads = await ctx.db.query("suppliedLeads").withIndex("by_owner", q => q.eq("owner", owner)).take(50);
    const duplicate = leads.find(lead => lead.originalText === args.originalText && lead.provenance === args.provenance && lead.sourceDate === args.sourceDate && lead.recipient === (recipientEmail(args.recipient) ?? ""));
    if (duplicate) return duplicate._id;
    if (leads.length >= 50) throw new Error("Your supplied listing notebook holds 50 entries.");
    const brief = await ctx.db.query("criteria").withIndex("by_session_and_updated_at", q => q.eq("sessionId", owner)).order("desc").first();
    if (!brief) throw new Error("Save your rental brief first.");
    const currency = brief.currency ?? "INR";
    const { contentPermission: _, ...fields } = args;
    void _;
    return await ctx.db.insert("suppliedLeads", { ...fields, recipient: recipientEmail(args.recipient) ?? "", owner, savedAt: Date.now(), requirements: [
      `${brief.city ?? "Bengaluru"}, ${brief.country ?? "India"}`,
      `${formatMoney(brief.budgetMin, currency)}–${formatMoney(brief.budgetMax, currency)} total monthly budget`,
      brief.localities.join(" / "), brief.bedrooms.join(" or "), ...brief.mustHaves,
    ] });
  },
});
export const revoke = mutation({
  args: { id: v.id("suppliedLeads") }, returns: v.null(),
  handler: async (ctx, { id }) => {
    const lead = await ctx.db.get(id);
    if (!lead || lead.owner !== await requireUserKey(ctx)) throw new Error("Listing not found.");
    await ctx.db.patch(id, { revokedAt: Date.now(), contactPermission: false });
    return null;
  },
});
export const sendInquiry = mutation({
  args: { id: v.id("suppliedLeads"), recipient: v.string(), requestId: v.string(), confirmed: v.boolean(), reviewedUncertainty: v.boolean() },
  returns: v.id("leadInquiries"),
  handler: async (ctx, args) => {
    const owner = await requireUserKey(ctx);
    const lead = await ctx.db.get(args.id);
    if (!lead || lead.owner !== owner) throw new Error("Listing not found.");
    const existing = await ctx.db.query("leadInquiries").withIndex("by_lead", q => q.eq("leadId", lead._id)).first();
    if (existing) {
      if (existing.requestId === args.requestId) return existing._id;
      throw new Error("An inquiry already exists. No duplicate was sent.");
    }
    if (!args.confirmed || !args.reviewedUncertainty || !args.requestId || args.requestId.length > 100) throw new Error("Review the evidence, recipient and complete message, then explicitly confirm sending.");
    if (lead.revokedAt || !lead.contactPermission || lead.isFixture) throw new Error("This lead has no active permission for a real inquiry.");
    const recipient = recipientEmail(args.recipient);
    if (!recipient || recipient !== lead.recipient) throw new Error("Review the permitted recipient. It cannot be replaced during send.");
    const inbox = process.env.AGENTMAIL_INBOX_ID;
    if (!inbox || !process.env.AGENTMAIL_API_KEY) throw new Error("Email is not configured.");
    const draft = verificationDraft(lead.title, lead.requirements, lead.sourceDate);
    await reserveIntegrationUse(ctx, owner, "agentmail");
    const outboundId = await mail.sendMessage(ctx, inbox, { to: recipient, subject: draft.subject, text: draft.body, labels: ["rentpilot", "ask-to-verify", `lead-${lead._id}`] });
    const id = await ctx.db.insert("leadInquiries", { owner, leadId: lead._id, recipient, inbox, ...draft, requestId: args.requestId, approvedAt: Date.now(), status: "queued", outboundId });
    await ctx.scheduler.runAfter(15000, internal.suppliedLeads.refreshDelivery, { id, attempt: 0 });
    return id;
  },
});
export const refreshDelivery = internalMutation({
  args: { id: v.id("leadInquiries"), attempt: v.number() }, returns: v.null(),
  handler: async (ctx, { id, attempt }) => {
    const inquiry = await ctx.db.get(id);
    if (!inquiry) return null;
    const receipt = await mail.status(ctx, inquiry.outboundId as typeof vOutboundId.type);
    if (receipt) await ctx.db.patch(id, { status: receipt.status === "pending" ? "queued" : ["sent", "delivered"].includes(receipt.status) ? "sent" : "failed", providerStatus: receipt.status, ...(receipt.threadId ? { threadRef: receipt.threadId } : {}), ...(receipt.agentmailMessageId ? { messageRef: receipt.agentmailMessageId } : {}) });
    if ((!receipt || receipt.status === "pending" || !receipt.threadId) && attempt < 8) await ctx.scheduler.runAfter(30000, internal.suppliedLeads.refreshDelivery, { id, attempt: attempt + 1 });
    return null;
  },
});
