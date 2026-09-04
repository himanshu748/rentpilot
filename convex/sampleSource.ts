import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * A rental source that RentPilot operates itself and, in writing on the page,
 * permits automated extraction from. It exists so the Firecrawl and AgentMail
 * paths can be exercised end to end without touching a third party's site.
 *
 * This is a fixture, not a claim that an outside portal granted permission.
 * Every page says so, and the listings are marked as sample records.
 */

export type SampleListing = {
  slug: string;
  title: string;
  rent: number;
  bedrooms: string;
  deposit: number;
  available: string;
  notes: string;
  furnishing: string;
};

export type SamplePlace = { city: string; area: string };

export const sampleListings: SampleListing[] = [
  {
    slug: "hsr-27th-main-room",
    title: "Private room in a shared 3 BHK",
    rent: 23500,
    bedrooms: "Private room",
    deposit: 70000,
    available: "Immediately",
    furnishing: "Semi furnished",
    notes: "Two working professionals already share the flat. No brokerage.",
  },
  {
    slug: "koramangala-5th-block-1bhk",
    title: "Compact 1 BHK near the main road",
    rent: 28000,
    bedrooms: "1 BHK",
    deposit: 84000,
    available: "From the 1st of next month",
    furnishing: "Fully furnished",
    notes: "Ten minutes from the metro. No brokerage.",
  },
  {
    slug: "indiranagar-defence-colony-room",
    title: "Sunlit room on a quiet lane",
    rent: 21000,
    bedrooms: "Private room",
    deposit: 60000,
    available: "Immediately",
    furnishing: "Unfurnished",
    notes: "Walking distance to shops and transport. No brokerage.",
  },
];

function contactEmail() {
  return process.env.SAMPLE_SOURCE_CONTACT ?? null;
}

export function sampleSourceHost() {
  const site = process.env.CONVEX_SITE_URL;
  if (!site) return null;
  try {
    return new URL(site).hostname;
  } catch {
    return null;
  }
}

const PERMISSION_NOTICE = `RentPilot operates this page and grants automated extraction of the
  listings below. Rent, locality, home type and the contact address may be fetched and stored.
  These are sample records published for a product demonstration, not live tenancies.`;

const shell = (title: string, inner: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { margin:0; padding:40px 22px; background:#f4f0e8; color:#14261f;
         font:15px/1.6 ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 27px; letter-spacing:-0.03em; margin:0 0 6px; }
  h2 { font-size: 19px; letter-spacing:-0.02em; margin:0 0 4px; }
  a { color:#32664b; }
  .permission { margin: 18px 0 30px; padding:14px 16px; border:1px solid #cbd8c7;
                background:#eef5eb; border-radius:8px; font-size:13px; }
  article { padding:18px 0; border-top:1px solid #d9d3c6; }
  dl { display:grid; grid-template-columns:auto 1fr; gap:4px 14px; margin:10px 0 0; font-size:14px; }
  dt { color:#637068; }
  dd { margin:0; }
  footer { margin-top:34px; color:#637068; font-size:12px; }
</style></head>
<body><main>${inner}</main></body></html>`;

/** The pages carry only a city and an area name, never anyone's personal details. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function listingUrl(origin: string, slug: string, place: SamplePlace) {
  const url = new URL(`${origin}/sample-source/listing/${slug}`);
  url.searchParams.set("city", place.city);
  url.searchParams.set("area", place.area);
  return url.toString();
}

export function renderIndex(origin: string, place: SamplePlace) {
  const rows = sampleListings
    .map(
      (listing) => `<article>
        <h2><a href="${escapeHtml(listingUrl(origin, listing.slug, place))}">${listing.title}</a></h2>
        <p>${escapeHtml(place.area)} &middot; ${listing.bedrooms} &middot; Rs ${listing.rent} per month</p>
      </article>`,
    )
    .join("");
  return shell(
    "RentPilot sample rental source",
    `<h1>Sample rooms in ${escapeHtml(place.area)}, ${escapeHtml(place.city)}</h1>
     <p class="permission">${PERMISSION_NOTICE}</p>
     ${rows}
     <footer>Published by RentPilot for the Convex All Gas Hackathon demonstration.</footer>`,
  );
}

export function renderListing(listing: SampleListing, place: SamplePlace) {
  const email = contactEmail();
  return shell(
    `${listing.title} | RentPilot sample source`,
    `<h1>${listing.title} in ${escapeHtml(place.area)}</h1>
     <p class="permission">${PERMISSION_NOTICE}</p>
     <dl>
       <dt>Monthly rent</dt><dd>Rs ${listing.rent}</dd>
       <dt>Locality</dt><dd>${escapeHtml(place.area)}, ${escapeHtml(place.city)}</dd>
       <dt>Home type</dt><dd>${listing.bedrooms}</dd>
       <dt>Deposit</dt><dd>Rs ${listing.deposit}</dd>
       <dt>Furnishing</dt><dd>${listing.furnishing}</dd>
       <dt>Available</dt><dd>${listing.available}</dd>
       <dt>Contact email</dt><dd>${email ? escapeHtml(email) : "Not published"}</dd>
     </dl>
     <p>${listing.notes}</p>
     <footer>Sample record published by RentPilot. Not a live tenancy.</footer>`,
  );
}

/**
 * Registers this deployment's own sample source as approved, using the
 * deployment's convex.site hostname so the scrape host check matches.
 */
export const register = internalMutation({
  args: { city: v.string() },
  returns: v.object({ domain: v.string(), cities: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const site = process.env.CONVEX_SITE_URL;
    const host = sampleSourceHost();
    if (!site || !host) {
      throw new Error("CONVEX_SITE_URL is not available on this deployment.");
    }
    const city = args.city.trim();
    if (city.length < 2) throw new Error("Choose a city before approving the sample source.");
    if (city.length > 60) throw new Error("City names must be 60 characters or fewer.");

    const existing = await ctx.db
      .query("sources")
      .withIndex("by_domain", (q) => q.eq("domain", host))
      .unique();
    if (existing) {
      if (existing.cities?.length !== 1 || existing.cities[0] !== "Any city") {
        await ctx.db.patch(existing._id, { cities: ["Any city"] });
      }
      return { domain: host, cities: ["Any city"] };
    }

    const cities = ["Any city"];
    const fields = {
      domain: host,
      name: "RentPilot sample source",
      type: "direct" as const,
      permissionStatus: "approved" as const,
      notes: "Operated by RentPilot. The page grants automated extraction in writing.",
      cities,
      isDemo: false,
      permissionRequestedAt: Date.now(),
    };
    await ctx.db.insert("sources", fields);

    await ctx.db.insert("activity", {
      listingId: null,
      type: "system",
      message: "RentPilot sample source approved for controlled discovery",
      createdAt: Date.now(),
      isDemo: false,
    });

    return { domain: host, cities };
  },
});
