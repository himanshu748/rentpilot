import { normalizePlace, sameMarket } from "./location";

export type AmenityEvidence = { requirement: string; status: "present" | "absent" | "unknown"; quote: string };
type Brief = { city?: string; country?: string; currency?: string; budgetMin: number; budgetMax: number; localities: string[]; bedrooms: string[]; mustHaves: string[] };
type Listing = { city?: string; country?: string; currency?: string; rent: number; locality: string; bedrooms: string; amenityEvidence?: AmenityEvidence[] };

/** Conservative aliases, never infer a private room from a whole apartment. */
function roomType(value: string) {
  const normalized = normalizePlace(value);
  return ({ "1 bhk": "1 bedroom", "2 bhk": "2 bedrooms", "single room": "private room" } as Record<string, string>)[normalized] ?? normalized;
}

/** Only exact, named localities count. This does not claim a measured distance. */
export function eligibilityProblems(listing: Listing, brief: Brief): string[] {
  const problems: string[] = [];
  if (!sameMarket(listing, brief)) problems.push("Location or currency differs from your brief");
  if (!Number.isFinite(listing.rent) || listing.rent < brief.budgetMin || listing.rent > brief.budgetMax) problems.push("Monthly rent is outside your hard budget range");
  if (!brief.localities.some((area) => normalizePlace(area) === normalizePlace(listing.locality))) problems.push("The listing does not state a selected locality (distance is not verified)");
  if (!brief.bedrooms.some((kind) => roomType(kind) === roomType(listing.bedrooms))) problems.push("Room type does not match your brief");
  for (const requirement of brief.mustHaves) {
    const evidence = listing.amenityEvidence?.find((item) => normalizePlace(item.requirement) === normalizePlace(requirement));
    if (evidence?.status !== "present" || !evidence.quote.trim()) problems.push(`${requirement}: ${evidence?.status === "absent" ? "not provided" : "not confirmed by source evidence"}`);
  }
  return problems;
}

/** A model assertion is not evidence: retain only quotations found on the page. */
export function groundedAmenities(raw: unknown, markdown: string, requirements: string[]): AmenityEvidence[] {
  const items: Record<string, unknown>[] = Array.isArray(raw) ? raw.filter((item) => item && typeof item === "object") : [];
  const page = normalizePlace(markdown);
  return requirements.map((requirement) => {
    const item = items.find((entry) => typeof entry.requirement === "string" && normalizePlace(entry.requirement) === normalizePlace(requirement));
    const quote = typeof item?.quote === "string" ? item.quote.trim().slice(0, 600) : "";
    const grounded = quote.length >= 3 && page.includes(normalizePlace(quote));
    const amenity = normalizePlace(requirement);
    const mentionsSpecificAmenity = amenity === "bed" ? /\bbeds?\b|पलंग|बिस्तर/i.test(quote)
      : amenity === "cooler" ? /\bcoolers?\b|कूलर/i.test(quote)
      : /\bcylinder\b/i.test(amenity) ? /\b(?:lpg|gas|cooking)\b.*\bcylinders?\b|गैस सिलेंडर/i.test(quote)
      : true;
    // Conservative: ambiguous/negative/extra-charge wording cannot prove an inclusion.
    const positive = mentionsSpecificAmenity && !/\b(no|not|without|unavailable|excluded|extra|additional)\b/i.test(quote);
    const status = grounded && item?.status === "absent" ? "absent" : grounded && item?.status === "present" && positive ? "present" : "unknown";
    return { requirement, status, quote: status === "unknown" ? "" : quote };
  });
}
