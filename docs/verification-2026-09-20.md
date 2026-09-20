# Verification record — 20 September 2026

Base revision: `bcc49ff` on `himanshu748/rentpilot`.

The original checkout had cloud-only files whose reads stalled. Work was performed in a separate GitHub clone, `rentpilot-review`; verification ran from an equivalent temporary copy to avoid cloud-file hydration. The original checkout was not edited. Dependency installation initially failed from disk exhaustion and registry connectivity; only this audit's partial dependency directories were removed. The final installation used `npm ci` and applied the existing AgentMail patch.

## Automated checks

- `npm test`: **110 passed, 0 failed**, no skipped tests. Node tests execute application handlers with controlled database/provider doubles; this is not a live Convex or mail-provider round trip.
- App TypeScript check: passed.
- Convex TypeScript check: passed.
- ESLint: 0 errors; 4 unused-disable warnings in existing generated files.
- Production static export: passed; routes `/`, `/app`, and `/_not-found`. The temporary fixture preview route is not included.
- Git whitespace check: passed.

Specific coverage includes:

- Genuine quotations paired with incorrect room or amenity conclusions; surrounding negation; conditional inclusions, extra charges, Hindi/Telugu and transliterated negation, conflicting amenity descriptions, “no extra charge for a bed,” and “cooler can be arranged.”
- Rent plus mandatory recurring charges; deposit kept separate; unknown and contradictory fees abstain. Exact locality/country/currency gates retained.
- Labelled fixture import → immutable brief/source snapshot → explicit inquiry approval → mocked provider receipt → attributed reply → reload. Changing the current brief does not rewrite the saved one.
- Duplicate import and send requests; different webhook events for the same message; an early reply before outbound thread capture; missing recipients; wrong inbox/sender/thread; source revocation; cross-account read/revoke/send attempts.
- Existing partial search failure and bounded-source tests continue to pass.
- UI handler tests: opening review does not send; confirmation is disabled before acknowledgement; fictional, revoked, unauthorized and uncontactable leads cannot send.

## Rendered checks

The actual new evidence-card component was rendered locally using clearly labelled fictional data. Checked desktop rendering and a 375 × 812 viewport. At 375px the document width and scroll width were both 375px (no horizontal overflow). Expanded source evidence showed original text, old source date and saved missing requirements. Fictional mode disabled email. A separate local review-state fixture showed recipient, subject and the complete message; acknowledgement enabled the confirmation button. The inquiry was cancelled without sending. Viewport override was reset; the temporary preview route was removed.

This was a component render/interaction check, not an authenticated hosted import or live send. Hosted end-to-end verification remains outstanding.

## Production and external evidence

Fresh read-only production source-registry inspection returned the sample site and synthetic demo feed only. Current Roomies terms still restrict scraping. No source permission was widened, no third-party listing was scraped, and no shared inbox/webhook configuration was modified.

No permitted real listing or consenting lister was supplied during this audit. A request for one is pending. No new real-lister reply, vacancy, appointment, testimonial, or independent renter trial is claimed. The public submission and hosted app have not been updated with these local changes.

## Known limits and proposed rollout

- Permission on supplied text/contact is the user's recorded attestation, not independent verification of permission or lister identity.
- The fee parser is intentionally narrow; unfamiliar formats stay unverified. Generic amenities outside the supported deterministic vocabulary also abstain.
- Legacy matches without recurring-charge evidence will disappear from the confirmed list until rechecked. Records are preserved; no destructive migration is required.
- Revocation blocks a new enqueue, but cannot recall an already-queued provider message. Delivery polling and early-reply retries are bounded; unusually delayed/unassociated messages require investigation. One inquiry is allowed per supplied lead; failed inquiries do not automatically resend.
- Deploy additive Convex tables/functions first, then the static export. Verify an authenticated user-supplied import and mobile review on the hosted app. Complete one explicitly approved real-lister inquiry/reply/reload trial before claiming the real workflow is proven.
- Recruit an independent renter with consent and record observations honestly. A trial plan is in `current-workflow.md`; no outreach was sent to an unspecified recipient.
