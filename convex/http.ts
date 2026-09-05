import { AgentMail } from "@agentmail/convex";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";
import { components, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { renderIndex, renderListing, sampleListings } from "./sampleSource";
import { validCurrency } from "./location";

const http = httpRouter();
auth.addHttpRoutes(http);
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
  const country = (url.searchParams.get("country") ?? "India").trim().slice(0, 80);
  const currency = (url.searchParams.get("currency") ?? "INR").trim().toUpperCase();
  if (!validCurrency(currency)) return null;
  return { city: city || "Bengaluru", area: area || "City centre", country: country || "India", currency };
}

http.route({
  path: "/sample-source",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const url = new URL(request.url);
    const place = placeFrom(url);
    return place ? html(renderIndex(url.origin, place)) : html("<h1>Unsupported currency</h1>", 400);
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
    const place = placeFrom(url);
    return place ? html(renderListing(listing, place)) : html("<h1>Unsupported currency</h1>", 400);
  }),
});

// Next's static export emits /app.html, not an SPA route in /index.html.
// Serve its HTML (or RSC payload for client navigation) at the clean URL.
const serveCockpit = httpAction(async (ctx, request) => {
  const isRsc = request.headers.get("RSC") === "1";
  const asset = await ctx.runQuery(components.staticHosting.lib.resolveAssetForHttp, {
    path: isRsc ? "/app.txt" : "/app.html",
    spaFallback: false,
  });
  if (!asset?.storageUrl) return new Response("Cockpit deployment unavailable", { status: 503 });
  const response = await fetch(asset.storageUrl);
  if (!response.ok) return new Response("Cockpit could not be loaded", { status: 502 });
  return new Response(response.body, {
    headers: {
      "Content-Type": isRsc ? "text/x-component; charset=utf-8" : "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "Vary": "RSC",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
http.route({ path: "/app", method: "GET", handler: serveCockpit });
http.route({ path: "/app/", method: "GET", handler: serveCockpit });

// Exact auth, webhook, sample-source and cockpit routes take precedence.
registerStaticRoutes(http, components.staticHosting, { spaFallback: false });

export default http;
