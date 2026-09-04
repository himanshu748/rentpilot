# RentPilot

RentPilot turns scattered room listings into traceable pursuits. Each pursuit keeps its source evidence, explains its fit score and presents one safe next action from found to viewing.

This repository is the working Convex All Gas Hackathon build.

## What works

- Anonymous by default, with optional sign-in: AgentMail emails a six digit code, and signing in claims everything the anonymous session created onto the account
- Server-derived ownership: a signed-in request ignores any client-supplied session id, so one account cannot read another's pursuits by guessing a key
- Landing page at `/` that states the product, the six pursuit stages and the recorded source-policy refusal
- Geist Sans and Geist Mono self-hosted through `next/font`, matching the brand system
- Responsive pursuit cockpit at `/app` with desktop, tablet and phone compositions
- Session-persistent search briefs for any city, preferred areas, budget, home types and must-haves without requiring account setup
- City-scoped pursuit queues and source readiness, with an honest empty state when a city has no approved source yet
- Convex schema with bounded indexed queries for sources, criteria, listings, threads, activity and validation runs
- Session-isolated reads and writes: a browser session sees its own pursuits plus the shared demo workspace, never another session's
- Live Convex demo dataset, labeled as synthetic in the product, with skeleton rows while the first query resolves
- Explainable ranking with confidence and missing-evidence penalties, computed in Convex and never by a model
- OpenAI drafts the inquiry from the listing evidence and your must-haves, grounded so it cannot invent move-in dates or personal details, and always left for you to edit and approve
- Human-editable inquiry drafts saved through Convex mutations, locked once an inquiry has been sent
- AgentMail component, durable send boundary, stable per-draft idempotency key, two-step human confirmation, live delivery status folded back into the pursuit thread and a webhook route
- Anime.js transitions for pursuit entry and state progress, deferred until the tab is visible and skipped under reduced motion
- Honest credential gates for Firecrawl discovery and AgentMail delivery
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

## Routes

| Route  | What it is                                                        |
| ------ | ----------------------------------------------------------------- |
| `/`    | Landing page. Static, explains the product and the source policy.  |
| `/app` | The pursuit cockpit. Live Convex queries and mutations.            |

## Integration configuration

The AgentMail inbox provisioned for this build is `rentpilot-himanshu@agentmail.to`.

```bash
npx convex env set AGENTMAIL_INBOX_ID rentpilot-himanshu@agentmail.to
npx convex env set AGENTMAIL_API_KEY your_agentmail_key
npx convex env set AGENTMAIL_WEBHOOK_SECRET your_webhook_secret
```

AgentMail also carries the sign-in codes, so no separate email provider is needed.
Until `AGENTMAIL_API_KEY` is set, sign-in reports that it cannot send a code.

Register the AgentMail webhook at:

```text
https://your-deployment.convex.site/agentmail/webhook
```

OpenAI writes the inquiry drafts. Ranking stays deterministic in Convex, so the model
never decides which room is best, only how to ask about it.

```bash
npx convex env set OPENAI_API_KEY your_openai_key
npx convex env set OPENAI_MODEL gpt-4o-mini   # optional, this is the default
```

Until `OPENAI_API_KEY` is set, the "Write with OpenAI" control stays disabled and says so.

Firecrawl is authenticated locally and its key is configured on the Convex deployment. Its
server-side connectivity probe (`npx convex run discovery:probeFirecrawl`) returns a live
status code and page title.

## The sample source

Discovery needs a source that permits it. This deployment publishes its own, at
`/sample-source` on the same `convex.site` host, and grants automated extraction in writing
on the page. It is a fixture, not a claim that an outside portal gave permission, and every
page says so. The listings follow whatever city and areas are in your brief, so the sweep
works for any place you choose.

The sweep runs through the same permission and host checks as any other source, which is why
it only works against a deployed backend: Firecrawl cannot reach a local Convex backend, and
`scrapeApprovedListing` refuses anything that is not https.

The first real third-party source candidate is `bengaluru.rent`. Firecrawl extracted its terms and confirmed that automated extraction requires written permission. No listings or private contact details were imported. RentPilot attempted a permission request from `rentpilot-himanshu@agentmail.to`, but the recipient mail server was unreachable and AgentMail returned a delivery-failure notice. Convex records the failed delivery and keeps the source policy-gated until a valid contact path grants written permission.

Do not scrape a source before its policy status is recorded as approved.

## Verification

```bash
npm run build
npm run lint
npx tsc --noEmit
```

Run `npm run build` first. Next generates the route types that `layout.tsx` depends on into `.next/types`, so on a clean checkout `npx tsc --noEmit` fails until a build or `npm run dev` has created them.

## Product and visual rationale

See [brand.md](./brand.md) and [design-thesis.md](./design-thesis.md). The generated concept in `design/` is a design reference only. It is not shipped as a production image.
