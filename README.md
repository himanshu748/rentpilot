# RentPilot

RentPilot turns scattered room listings into traceable pursuits. Each pursuit keeps its source evidence, explains its fit score and presents one safe next action from found to viewing.

This repository is the working Convex All Gas Hackathon build.

**Live app:** [https://ceaseless-pigeon-981.convex.site](https://ceaseless-pigeon-981.convex.site)

**Hackathon build log:** [hackathon.md](./hackathon.md)

**Judge walkthrough and demo script:** [submission.md](./submission.md)

## What works

- Visitors can set preferences anonymously. Live searches, AI drafts and inquiry sends require sign-in with an AgentMail email code; signing in claims the anonymous search onto the account.
- Server-derived ownership: a signed-in request ignores any client-supplied session id, so one account cannot read another's pursuits by guessing a key
- Landing page at `/` that explains the search, listing checks, sign-in requirement and fictional example
- Geist Sans and Geist Mono self-hosted through `next/font`, matching the brand system
- Responsive pursuit cockpit at `/app` with desktop, tablet and phone compositions
- Session-persistent search briefs for any city, preferred areas, budget, home types and must-haves without requiring account setup
- City-scoped pursuit queues and source readiness, with an honest empty state when a city has no approved source yet
- Live Firecrawl web search from the saved brief, with source links labelled as unverified leads. Search does not scrape unapproved pages; only registry-approved sources enter the extraction pipeline.
- Hard monthly budget, selected locality and room-type gates. Every must-have needs a source quotation; unknown amenities do not become matches. Existing pursuits are checked again when the brief changes, including before drafting or sending.
- Locality matching is by the named neighbourhood, not a measured distance radius. Search snippets do not establish availability, amenities, or final costs.
- Convex schema with bounded indexed queries for sources, criteria, listings, threads, activity and validation runs
- Session-isolated reads and writes: a browser session sees its own matching pursuits, never another session's or an unrelated shared demo queue
- Explicitly fictional sample-source sweeps remain available for integration testing and use the same hard filters as live listings
- Explainable ranking with confidence and missing-evidence penalties, computed in Convex and never by a model
- OpenAI drafts from the listing evidence and your must-haves, with instructions against inventing personal details. Review and approval remain required because model output can be wrong.
- Human-editable inquiry drafts saved through Convex mutations, locked once an inquiry has been sent
- AgentMail component, durable send boundary, stable per-draft idempotency key, two-step human confirmation, live delivery status folded back into the pursuit thread and a webhook route
- Anime.js transitions for pursuit entry and state progress, deferred until the tab is visible and skipped under reduced motion
- Honest credential gates for Firecrawl discovery and AgentMail delivery
- Signed-in, server-derived ownership and hourly account limits around paid Firecrawl, OpenAI and AgentMail calls
- AgentMail reply ingestion stores the sender, timestamp and summary on the owned match, deduplicates events, and retries replies that arrive before the outbound thread reference. The production webhook and the full sample-listing-to-in-app-reply loop passed a live controlled test on September 5.
- Keyboard-complete: skip link, focus-visible rings, Escape and focus return on the mobile evidence dialog

## Local setup

```bash
npm install
CONVEX_AGENT_MODE=anonymous npx convex dev
npm run dev
```

In another terminal, seed the labeled demo workspace once:

```bash
npx convex run seed:demo
```

Open `http://localhost:3000` for the landing page, or go straight to the product at
`http://localhost:3000/app`.

## Production deployment

The frontend is statically exported and published through the Convex static-hosting
component, so the judged app and its backend routes share the required `convex.site` host.

```bash
npm run deploy
```

The static-hosting deploy command builds with the production Convex URL, deploys the
Convex backend, and uploads the generated `out/` bundle in one flow.

The public production app is:

```text
https://ceaseless-pigeon-981.convex.site
```

## Routes

| Route  | What it is                                                        |
| ------ | ----------------------------------------------------------------- |
| `/`    | Landing page. Static, explains the product and the source policy.  |
| `/app` | The pursuit cockpit. Live Convex queries and mutations.            |

## Integration configuration

Keep the sending inbox in deployment configuration rather than publishing it in the repository.

```bash
npx convex env set AGENTMAIL_INBOX_ID your-inbox@agentmail.to
npx convex env set AGENTMAIL_API_KEY your_agentmail_key
npx convex env set SAMPLE_SOURCE_CONTACT a-controlled-recipient@example.com
npx convex env set AGENTMAIL_WEBHOOK_SECRET your_webhook_secret
```

AgentMail also carries the sign-in codes, so no separate email provider is needed.
Until `AGENTMAIL_API_KEY` is set, sign-in reports that it cannot send a code.

The app explicitly forwards `AGENTMAIL_API_KEY` into the isolated AgentMail
component. `patch-package` applies the environment-declaration compatibility fix
for `@agentmail/convex@0.1.0` on install; keep the `patches/` directory and run
install scripts when deploying. Sign-in waits for a provider message receipt;
queued, failed, and unconfirmed sends do not advance to code entry.

Register the AgentMail webhook at:

```text
https://your-deployment.convex.site/agentmail/webhook
```

The deployed sender uses a least-privilege inbox-scoped key. The production
`message.received` webhook is registered and its listing-linked reply flow is verified.
For a new deployment, register its webhook separately with appropriately scoped setup
access, set the matching signing secret, and revoke temporary setup credentials.
See the current test evidence in [hackathon.md](./hackathon.md).

OpenAI writes the inquiry drafts through Vercel AI Gateway. Ranking stays deterministic in Convex, so the model
never decides which room is best, only how to ask about it.

```bash
npx convex env set AI_GATEWAY_API_KEY
# Repeat with --prod for the production deployment; never use NEXT_PUBLIC_ for this key.
```

The model is pinned to `openai/gpt-4o-mini`, with a gateway provider allowlist containing
only `openai`. There is no model or provider fallback. Vercel is only the inference
gateway; the frontend and backend remain hosted on Convex. The current key has a $1
non-renewing usage budget. Free-credit eligibility, remaining balance, and rate limits
are managed by Vercel; exhausted limits produce an explicit error, never a substitute draft.

There is no canned or manual fallback for live inquiries. Until `AI_GATEWAY_API_KEY` is set,
the "Write with OpenAI" control stays disabled, and the server refuses to approve or send
any live thread that does not carry model provenance written by the OpenAI action.

Firecrawl is authenticated locally and its key is configured on the Convex deployment. Its
server-side connectivity probe (`npx convex run discovery:probeFirecrawl`) returns a live
status code and page title.

## Worldwide search briefs

New visitors choose their own country/region, city, neighbourhoods, and ISO currency;
they are not assigned a Bengaluru search. Amounts remain in the chosen currency, with
no implicit conversion. A listing must provide matching city/country/currency evidence
and an explicitly monthly price before ranking. Weekly prices currently require review.
Changing location or currency hides pursuits from the previous search without deleting them.
Existing India/INR records remain compatible.

Worldwide briefs are not worldwide inventory: live homes still require permitted local
sources. The UI labels the built-in sweep as a sample demonstration, not a live-home search.

## The sample source

Discovery needs a source that permits it. This deployment publishes its own, at
`/sample-source` on the same `convex.site` host, and grants automated extraction in writing
on the page. It is a fixture, not a claim that an outside portal gave permission, and every
page says so. The listings follow the city, country, areas, and currency in your brief.
Their amounts are illustrative fixtures, not local market prices or converted rents.

The sweep runs through the same permission and host checks as any other source, which is why
it only works against a deployed backend: Firecrawl cannot reach a local Convex backend, and
`scrapeApprovedListing` refuses anything that is not https.

The first real third-party source candidate is `bengaluru.rent`. Firecrawl extracted its terms and confirmed that automated extraction requires written permission. No listings or private contact details were imported. RentPilot attempted a permission request from its configured AgentMail inbox, but the recipient mail server was unreachable and AgentMail returned a delivery-failure notice. Convex records the failed delivery and keeps the source policy-gated until a valid contact path grants written permission.

Do not scrape a source before its policy status is recorded as approved.

## Verification

```bash
npm test
npm run build
npm run lint
npx tsc --noEmit
```

The 56 automated tests cover location and currency isolation, offered-unit extraction, hard budget and amenity
gates, OpenAI request/response handling without fallback, sign-in delivery receipts,
review-before-send UI behavior, and reply matching/idempotency. These use stubs at
external-service boundaries and do not replace a live end-to-end integration test.

The deployed first-visitor flow and signed-in phone/tablet/desktop layouts were checked
in isolated Comet sessions, including 320, 375, 768 and 1280 pixel widths, without
horizontal overflow or console errors. The complete signed-in production flow passed
on September 5: Firecrawl read permitted fictional listings, OpenAI drafted an inquiry,
the tester edited and confirmed it, AgentMail delivered it to a controlled inbox, and a
real reply appeared on the same listing and survived reload. No real landlord was
contacted. This proves the integration loop, not worldwide rental inventory.

Run `npm run build` first. Next generates the route types that `layout.tsx` depends on into `.next/types`, so on a clean checkout `npx tsc --noEmit` fails until a build or `npm run dev` has created them.

## Product and visual rationale

See [brand.md](./brand.md) and [design-thesis.md](./design-thesis.md). The generated concept in `design/` is a design reference only. It is not shipped as a production image.
