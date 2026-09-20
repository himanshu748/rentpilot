import { normalizePlace, sameMarket } from "./location";

export type AmenityEvidence = { requirement: string; status: "present" | "absent" | "unknown"; quote: string };
type Brief = { city?: string; country?: string; currency?: string; budgetMin: number; budgetMax: number; localities: string[]; bedrooms: string[]; mustHaves: string[] };
type Listing = { city?: string; country?: string; currency?: string; rent: number; monthlyCharges?: number; deposit?: number; locality: string; bedrooms: string; amenityEvidence?: AmenityEvidence[] };

export const extractedHomeTypes = ["Private room", "Shared room", "Studio", "1 bedroom", "2 bedrooms", "other", "unknown"] as const;

/** Classify the unit being offered, not the bedroom count of the shared home. */
export function groundedHomeType(value: unknown, quote: unknown, markdown: string): string {
  if (typeof value !== "string" || !extractedHomeTypes.some((type) => type === value) || value === "unknown" || value === "other") return "unknown";
  if (typeof quote !== "string" || quote.trim().length < 3 || !normalizePlace(markdown).includes(normalizePlace(quote))) return "unknown";
  const q = normalizePlace(quote);
  const patterns: Record<string, RegExp> = {
    "Private room": /\bprivate room\b/,
    "Shared room": /\bshared room\b/,
    Studio: /\bstudio\b/,
    "1 bedroom": /\b(?:whole|entire) (?:1|one) (?:bhk|bedroom)/,
    "2 bedrooms": /\b(?:whole|entire) (?:2|two) (?:bhk|bedroom)/,
  };
  if (!patterns[value]?.test(q) || /\b(?:not|no|without|may|could)\b|नहीं|नही|नको/.test(q)) return "unknown";
  const contextualNegation = markdown.split(/[.\n;!?]+/).some(line => patterns[value].test(normalizePlace(line)) && /\b(?:not|no|without|may|could|can|if|unless)\b|नहीं|नही|नको/.test(normalizePlace(line)));
  if (contextualNegation) return "unknown";
  const offered = Object.entries(patterns).filter(([, pattern]) => pattern.test(normalizePlace(markdown)));
  // Conflicting unit descriptions require clarification, even with a genuine quote.
  return offered.length === 1 ? value : "unknown";
}

/** Conservative aliases, never infer a private room from a whole apartment. */
function roomType(value: string) {
  const normalized = normalizePlace(value);
  return ({ "1 bhk": "1 bedroom", "2 bhk": "2 bedrooms" } as Record<string, string>)[normalized] ?? normalized;
}

/** Only exact, named localities count. This does not claim a measured distance. */
export function eligibilityProblems(listing: Listing, brief: Brief): string[] {
  const problems: string[] = [];
  if (!sameMarket(listing, brief)) problems.push("Location or currency differs from your brief");
  if (!Number.isFinite(listing.rent) || listing.rent < brief.budgetMin || listing.rent > brief.budgetMax) problems.push("Monthly rent is outside your hard budget range");
  if (listing.monthlyCharges === undefined || !Number.isFinite(listing.monthlyCharges) || listing.monthlyCharges < 0) problems.push("Mandatory recurring charges are not confirmed");
  else if (listing.rent + listing.monthlyCharges > brief.budgetMax) problems.push("Rent plus mandatory recurring charges exceeds your hard budget");
  if (!brief.localities.some((area) => normalizePlace(area) === normalizePlace(listing.locality))) problems.push("The listing does not state a selected locality (distance is not verified)");
  if (!brief.bedrooms.some((kind) => roomType(kind) === roomType(listing.bedrooms))) problems.push("Room type does not match your brief");
  for (const requirement of brief.mustHaves) {
    const evidence = listing.amenityEvidence?.find((item) => normalizePlace(item.requirement) === normalizePlace(requirement));
    if (evidence?.status !== "present" || !evidence.quote.trim()) problems.push(`${requirement}: ${evidence?.status === "absent" ? "not provided" : "not confirmed by source evidence"}`);
  }
  return problems;
}

/** Quotation integrity is necessary, never sufficient, for interpretation. */
export function groundedAmenities(raw: unknown, markdown: string, requirements: string[]): AmenityEvidence[] {
  const items: Record<string, unknown>[] = Array.isArray(raw) ? raw.filter((item) => item && typeof item === "object") : [];
  const page = normalizePlace(markdown);
  return requirements.map((requirement) => {
    const item = items.find((entry) => typeof entry.requirement === "string" && normalizePlace(entry.requirement) === normalizePlace(requirement));
    const quote = typeof item?.quote === "string" ? item.quote.trim().slice(0, 600) : "";
    const grounded = quote.length >= 3 && page.includes(normalizePlace(quote));
    const amenity = normalizePlace(requirement);
    const mention = amenity === "bed" ? /\bbeds?\b|पलंग|बिस्तर/i
      : amenity === "cooler" ? /\bcoolers?\b|कूलर/i
      : /cylinder/.test(amenity) ? /\b(?:lpg|gas|cooking)\s+cylinders?\b|गैस सिलेंडर/i : null;
    const classify = (text: string): "present" | "absent" | "unknown" => {
      if (!mention?.test(text)) return "unknown";
      const normalized = text.toLowerCase().replace(/no (?:extra|additional) charge(?:s)?/g, "included");
      if (/\b(?:if|unless|only|can|could|may|might|arrang\w*|optional|request|extra|additional|fee|charge|subject to)\b|शुल्क|अतिरिक्त|व्यवस्था/.test(normalized)) return "unknown";
      if (/\b(?:not|no|without|unavailable|excluded|excludes|excluding|nahi|nahin|nhi|nako|sans|sin|nicht)\b|नहीं|नही|नको|बिना|नसलेला|இல்லை|లేదు/.test(normalized)) return "absent";
      if (/[₹$€£]|\b\d+\b/.test(normalized)) return "unknown";
      if (/\b(?:included|provided|supplied|comes with)\b|शामिल/.test(normalized)) return "present";
      return "unknown";
    };
    const interpreted = classify(quote);
    const related = markdown.split(/[.\n;!?]+/).filter(line => mention?.test(line));
    const conflict = related.some(line => classify(line) !== interpreted);
    // Model classifications do not influence this deterministic decision.
    const status = grounded && !conflict ? interpreted : "unknown";
    return { requirement, status, quote: grounded ? quote : "" };
  });
}

/** Intentionally narrow: unrecognized fee descriptions must be clarified. */
export function groundedCosts(text: string) {
  const read = (label: string) => {
    const matches = [...text.matchAll(new RegExp(`(?:^|\\n)\\s*${label}\\s*:\\s*(\\d+(?:\\.\\d{1,2})?)\\s*(?=\\n|$)`, "gi"))];
    return matches.length === 1 ? Number(matches[0][1]) : undefined;
  };
  const otherFees = text.split("\n").some(line => !/^\s*(Mandatory monthly charges|Deposit)\s*:/i.test(line) && /\b(?:maintenance|service fee|recurring|mandatory|additional charges|extra charges)\b/i.test(line));
  return { monthlyCharges: otherFees ? undefined : read("Mandatory monthly charges"), deposit: read("Deposit") };
}
