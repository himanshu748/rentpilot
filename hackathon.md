# RentPilot — Convex All Gas Hackathon build log

RentPilot searches for rooms using a renter's city, preferred areas, budget, home type and must-haves. It separates web leads from matches backed by permitted listing evidence. OpenAI drafts inquiries for the renter to review before AgentMail sends them. On September 5, the complete production flow passed: Firecrawl extraction, OpenAI drafting, review and confirmation, email delivery, and a reply attached to the same listing. That test used fictional first-party listings and controlled inboxes, not real rental availability.

## Open it

- Live app: [https://ceaseless-pigeon-981.convex.site](https://ceaseless-pigeon-981.convex.site)
- Pursuit cockpit: [https://ceaseless-pigeon-981.convex.site/app](https://ceaseless-pigeon-981.convex.site/app)
- Permitted sample source: [https://ceaseless-pigeon-981.convex.site/sample-source](https://ceaseless-pigeon-981.convex.site/sample-source)
- Public source: [https://github.com/himanshu748/rentpilot](https://github.com/himanshu748/rentpilot)
- Demo video: [2:29 deployed-product walkthrough on X](https://x.com/jhahimanshu653/status/2096278313539092555), with live integrations and clearly identified test listings
- Sponsor showcase: [X post](https://x.com/jhahimanshu653/status/2096278313539092555), tagging Convex, OpenAI, Firecrawl, AgentMail and Wayne Sutton, with Codex development credit
- Judge walkthrough and demo script: [submission.md](./submission.md)
- Real-ad research: [Bithauli/Bhitauli evidence and gaps](./docs/inventory-evidence.md); ads found, no exact-match vacancy or approved real source established
- Community showcase: [Convex Discord show-and-tell](https://discord.com/channels/1019350475847499849/1141187289024839760/threads/1545677744849817620), posted September 5 with the live app, repo, screenshot and current limitations. This does not replace the required X/LinkedIn post.

The app was started on August 31, 2026. The first commit is `93bf207`, after the August 25 eligibility date.

## What I built

- Search preferences for any country/region, city, preferred areas and supported ISO currency. Visitors can save preferences anonymously, then sign in to use live searches, AI drafts and email. There is no default Bengaluru assignment; old India/INR records remain compatible.
- A real-time pursuit cockpit with found, checked, shortlisted, contacted, replied, and viewing stages.
- Hard budget, named-area, home-type and must-have gates before deterministic ranking. Missing evidence for a must-have blocks a match. A furnished label alone does not prove a bed, cooler or cooking cylinder is included.
- A source-policy gate. RentPilot records whether automated extraction is permitted and refuses a source without recorded approval.
- A first-party sample listings page whose content explicitly permits extraction. It carries the user's city, country, areas, and currency so judges can exercise Firecrawl without scraping an unwilling third party. These are fictional fixtures, not proof of live global inventory. Monthly rent and matching location/currency evidence are required before ranking.
- Human-controlled outreach. OpenAI may draft; the renter edits, approves, and confirms before AgentMail sends.
- Account ownership derived on the Convex server. Authenticated requests cannot select another account by supplying a guessed client key.
- A responsive, keyboard-complete interface with reduced-motion support and focused motion cues built with Anime.js.

## How the sponsor stack does real work

### Convex

Convex is the application backend and the production host. Typed queries and mutations persist search criteria, sources, listings, threads, activity, and validation runs. Reactive queries update the pursuit queue and delivery state. Actions call Firecrawl and OpenAI; workflows protect the AgentMail send boundary; Convex Auth supports email-code sign-in; Convex components provide Firecrawl, AgentMail, workflows, and static hosting. The same deployment serves the public frontend and exact HTTP routes for auth, the permitted sample source, and AgentMail webhooks.

### Firecrawl

Firecrawl extracts structured listing evidence on the server. A sweep first checks the stored permission status and the HTTPS host, then asks Firecrawl for the listing fields used by the deterministic scorer. The production credential is configured, and the production connectivity probe reaches Firecrawl successfully. The first-party `/sample-source` page is the safe, demonstrable input; it is clearly marked as a fixture and explicitly grants automated extraction.

### OpenAI

OpenAI writes the inquiry from only the listing evidence and the renter's recorded must-haves. It never ranks listings. The action requires structured JSON, validates length and content, and stamps the thread with model provenance. There is intentionally no canned or manual fallback for a live listing: approval and send both fail server-side unless an OpenAI-generated draft exists.

OpenAI inference uses Vercel AI Gateway with `AI_GATEWAY_API_KEY` stored only on Convex. The model is pinned to `openai/gpt-4o-mini` and the provider allowlist to `openai`, with no fallback. The signed-in production flow generated a real draft on September 5, 2026. The tester edited it, reviewed the saved message, and explicitly confirmed the send. Vercel supplies inference access only; it does not host the app.

### Codex (development)

I used OpenAI Codex for feature implementation, integration debugging, automated tests, deployed end-to-end checks and submission preparation. Codex is a development tool here. The app's inquiry-writing feature uses OpenAI gpt-4o-mini as described above. The submission includes the `codex` tag.

### AgentMail

AgentMail owns the product inbox. It sends passwordless sign-in codes and approved listing inquiries. Convex stores a stable per-draft idempotency key, tracks AgentMail's outbound lifecycle, and folds delivery status into the pursuit. Incoming messages are matched back to a pursuit by AgentMail thread ID and ingested idempotently.

The production sender inbox and least-privilege API key are configured. The `message.received` webhook is registered against the production `/agentmail/webhook` route with signature verification. A temporary setup credential was revoked after registration; the application still uses its original inbox-scoped key. A controlled reply to an inquiry sent through the product appeared on the same owned match and moved its stage to Replied. The result survived a page reload.

## Safety and product choices

- Demo listings are labeled synthetic and are read-only.
- Live discovery is refused unless the source policy is recorded as approved.
- No private contact details are taken from a source without permission.
- Ranking is reproducible code, not a hidden model judgment.
- OpenAI is instructed to use recorded facts; users must check its drafts for errors before approving them.
- A human must edit or review, approve, and explicitly confirm every send.
- Paid integrations are rate-limited per signed-in account on the server.
- Secrets live in Convex environment variables and are not committed.

## Build history

- **August 31:** Initialized the new Next.js application.
- **September 3:** Built the brand system, responsive pursuit cockpit, Convex schema, real-time queries, mutations, scoring, workflow, Firecrawl discovery boundary, and AgentMail delivery boundary.
- **September 4:** Added the public landing page, any-city/area discovery, OpenAI-grounded drafting, anonymous-to-account claim flow, AgentMail email-code auth, account isolation, rate limits, the permitted sample source, and hard server-side model provenance checks.
- **September 4:** Published the backend and static frontend together on Convex at the live `convex.site` URL.
- **September 5:** Added worldwide location/currency handling, live web leads, hard budget and source-backed amenity gates, and OpenAI access through the gateway without fallback. Fixed AgentMail component environment forwarding and verified email-code sign-in. Confirmed a controlled email arrived in the user's Gmail and its reply arrived in AgentMail; this test did not exercise listing-linked webhook ingestion.
- **September 5:** Rewrote the first-visitor copy, labelled the fictional example, and made sign-in and coverage limits explicit. Checked desktop, tablet and mobile layouts. Fixed a reply race with bounded retries when a message arrives before its outbound thread reference, and prevented orphan replies from entering shared activity.
- **September 5:** Registered and verified the production inbound webhook. Fixed room-type extraction to distinguish the offered private room from the bedroom count of its shared flat, require a source quotation, and reject unknown types. Changed first-party source facts to a semantic table so extraction retains label/value boundaries. Two private-room fixtures passed; the whole-apartment fixture remained excluded.
- **September 5:** Completed the real production sample-to-reply flow under test case `RP-VAGM` and email subject marker `RP-FLOW-20260905-01`. Confirmed no email existed before final approval, exactly one inquiry arrived after confirmation, and its real reply appeared on the match. No third-party lister was contacted.
- **September 5:** Fixed signed-in phone and tablet header overflow. Tested widths 320, 375, 390, 721, 768, 820, 1024, 1050, 1051, 1180 and 1280 pixels across the fix checks, including mobile navigation and search-preference access.

## Verification

- `npm run build` — production static export succeeds.
- `npm run lint` — no errors; four warnings are confined to generated Convex files.
- `npx tsc --noEmit --incremental false` — clean.
- Public `/`, `/app`, `/sample-source`, and `/api/auth/signin` routes return successfully.
- Anonymous sessions see only their own rows plus the explicitly shared demo rows.
- Unauthenticated attempts to claim a search or guess a `user:` owner key are rejected or restricted to shared data.
- Firecrawl production connectivity probe returns a successful live response.
- September 5 production checks: Firecrawl returns HTTP 200; integration-status reports configured AgentMail, Firecrawl, OpenAI gateway and sample contact; the webhook rejects an unsigned empty request with HTTP 401. Configuration flags alone do not prove delivery or model execution.
- `npm test` — 56 tests pass, including offered-unit extraction and six reply-ingestion regressions. External services are stubbed in the automated suite.
- Deployed first-visitor checks in isolated Comet at 1280, 768 and 375 pixel widths pass: meaningful page content, no overflow, preference validation, sign-in dialog, and no console errors. These checks send no email and leave the user's saved preferences unchanged.
- Full production sample extraction → OpenAI draft → human-approved inquiry → reply shown on its match: **passed September 5**. This used live provider calls and a normally authenticated controlled test account. The listing showed AgentMail delivery as sent and its stage as Replied; data remained after reload. Browser console errors: none.
- The user's real Bithauli/Bhitauli brief remains INR 8,000 maximum with cooler, bed and LPG cooking cylinder required. No evidence-backed room satisfying that brief was established by these tests. Fictional fixtures prove integration behavior, not supply in that market.

## Submission checklist

- [x] Verify Luma registration (registration-confirmation email dated August 26, checked September 5)
- [x] Participant confirms personal eligibility under the official rules (September 5)
- [x] New application started after August 25
- [x] Convex backend with queries, mutations, actions, real-time sync, auth, workflows, and components
- [x] Public GitHub repository
- [x] Root `hackathon.md`
- [x] Public `convex.site` app with no invite required
- [x] Firecrawl production credential and safe first-party extraction source
- [x] AgentMail production sender credential
- [x] Configure production OpenAI access through Vercel AI Gateway and verify a structured draft probe
- [x] Verify a real model-authored inquiry through the signed-in product flow
- [x] Register AgentMail `message.received` webhook and verify a listing-linked reply round trip
- [x] Record an under-three-minute deployed-product demo (2:29, linked above)
- [x] Post on X or LinkedIn and tag `@convex`, `@OpenAI`, `@firecrawl`, and `@agentmail`
- [ ] Submit the repository, live URL, and video at [vibeapps.dev](https://vibeapps.dev) before September 22 at 12:00 PM PT
