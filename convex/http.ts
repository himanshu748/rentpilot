import { AgentMail } from "@agentmail/convex";
import { httpRouter } from "convex/server";
import { components, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { renderIndex, renderListing, sampleListings } from "./sampleSource";

const http = httpRouter();
const agentmail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.email.onReplyReceived,
});

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) =>
    await agentmail.handleWebhook(
      ctx as unknown as Parameters<typeof agentmail.handleWebhook>[0],
      request,
    ),
  ),
});

const html = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

function placeFrom(url: URL) {
  const city = (url.searchParams.get("city") ?? "Bengaluru").trim().slice(0, 60);
  const area = (url.searchParams.get("area") ?? "City centre").trim().slice(0, 60);
  return { city: city || "Bengaluru", area: area || "City centre" };
}

http.route({
  path: "/sample-source",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const url = new URL(request.url);
    return html(renderIndex(url.origin, placeFrom(url)));
  }),
});

http.route({
  pathPrefix: "/sample-source/listing/",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const url = new URL(request.url);
    const slug = url.pathname.split("/").filter(Boolean).pop();
    const listing = sampleListings.find((item) => item.slug === slug);
    if (!listing) return html("<h1>Listing not found</h1>", 404);
    return html(renderListing(listing, placeFrom(url)));
  }),
});

export default http;
