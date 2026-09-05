export const currencies = Intl.supportedValuesOf("currency");

export function normalizePlace(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function validCurrency(value: string) {
  return currencies.includes(value);
}

export function sameMarket(
  listing: { city?: string; country?: string; currency?: string },
  brief: { city?: string; country?: string; currency?: string },
) {
  // Rows created before international support were denominated in INR in India.
  return normalizePlace(listing.city ?? "Bengaluru") === normalizePlace(brief.city ?? "Bengaluru") &&
    normalizePlace(listing.country ?? "India") === normalizePlace(brief.country ?? "India") &&
    (listing.currency ?? "INR") === (brief.currency ?? "INR");
}

export function formatMoney(value: number, currency: string, compact = false) {
  return new Intl.NumberFormat("en", {
    style: "currency", currency, currencyDisplay: "code",
    ...(compact ? { notation: "compact" as const, maximumFractionDigits: 1 } : {}),
  }).format(value);
}
