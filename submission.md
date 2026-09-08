# RentPilot submission packet

Status: [published on Vibe Apps](https://vibeapps.dev/s/rentpilot) on September 5, 2026. The public record, app, repository, video and sponsor-tagged X post were rechecked September 8. Luma registration and personal eligibility are based on the earlier confirmation records. The public page does not expose the organizer's internal judging-group record.

## Project copy

**Name:** RentPilot

**One-line summary:** Find room leads by area, budget and must-haves, then track source evidence, approved inquiries and replies in one place.

Looking for a room near Bithauli for ₹8,000 sounds specific enough. Then every listing leaves something out: Is there a bed? Is the cooler included? Does “kitchen available” include an LPG cylinder?

I built RentPilot to keep those requirements attached to the search. You choose your country, city, areas, currency and budget. Firecrawl finds web leads. Permitted pages can become matches only when their evidence meets the hard filters. Missing details stay unknown. Scores come from reproducible code in Convex.

Once a match has a published contact, OpenAI drafts an inquiry. You can edit it and review the exact saved message before confirming. AgentMail sends it, and a reply updates that listing in the live interface. Convex stores the search, derives account ownership on the server and coordinates the workflow.

The complete flow has passed on the deployed app using clearly labelled fictional listings and controlled inboxes. Live inventory depends on source permissions and coverage. RentPilot does not verify a landlord's identity, guarantee availability or measure distance from a neighbourhood name.

I used OpenAI Codex throughout development to implement features, debug integrations and run end-to-end checks. Codex helped build the app; OpenAI gpt-4o-mini writes inquiry drafts inside the app.

**Saved Vibe Apps tags:** `Firecrawl`, `AgentMail`, `convex`, `codex`, `AllGasHackathon`. OpenAI's role is described in the project text and tagged in the published X post.

## Public links

- App: https://ceaseless-pigeon-981.convex.site
- Product: https://ceaseless-pigeon-981.convex.site/app
- Repository: https://github.com/himanshu748/rentpilot
- Build log: https://github.com/himanshu748/rentpilot/blob/main/hackathon.md
- Video: [2:30 product walkthrough](https://youtu.be/TjNKa9jboJo)
- Published submission: https://vibeapps.dev/s/rentpilot
- Published X post: https://x.com/jhahimanshu653/status/2096278313539092555
- Official event: https://www.convex.dev/hackathons/all-gas
- Submission destination: https://vibeapps.dev/judging/convex-all-gas-hackathon-openai/submit
- Registration: https://luma.com/convex-allgas-hackathon
- Real-ad research and unresolved requirements: [inventory evidence](./docs/inventory-evidence.md)
- Vibe Apps profile: https://vibeapps.dev/himanshu748 (username set and verified September 5)

## Submission verification

The public page records a September 5 submission, a screenshot, a one-person team,
the Convex app, public GitHub repository, YouTube demo, X post and saved tags listed
above. YouTube reports a duration of approximately 150 seconds and a playable video.
The X post mentions Convex, OpenAI, Firecrawl and AgentMail, plus Wayne Sutton and Codex.
The LinkedIn field is a profile link, not a published post; the official rules allow
X or LinkedIn, so the X post supplies the social requirement.

## Judge walkthrough

1. Open the app and choose a country, city, areas, currency, budget and home type. No invite is required. Sign in with an email code to run integrations.
2. For a real-search example, use India / Lucknow / Bithauli, Bhitauli / INR / maximum 8,000 / Private room / Cooler, Bed, LPG cooking cylinder. Choose Find live leads. Read the distinction between unverified source links and evidence-backed matches; zero eligible matches is a valid result.
3. For a repeatable integration demonstration, use a separate test search with United Kingdom / London / Camden / GBP / maximum 30,000 / Private room / no must-haves. The sample amounts are arbitrary fixture values, not London rental prices.
4. Open the source controls and select Test fictional sample pages (same hard filters). The September 5 run produced two private-room matches and excluded the whole-apartment fixture. A rerun may refresh existing rows rather than create new ones.
5. Select a sample match. Inspect its source, hard-filter evidence and deterministic score. Generate an OpenAI draft. Do not describe the confidence percentage as verified safety or availability.
6. Edit the draft to state that it is a fictional workflow test. Review & send saves it; Confirm & send email is the separate send boundary. Sample inquiries go to the controlled sample contact, not a landlord.
7. The presenter replies from the controlled recipient inbox. Watch the reply attach to the same listing and the stage change to Replied. Reload to show persistence. Judges can see sending without access to that private inbox; the presenter must drive the inbound reply during the recorded demonstration.

Do not publish credentials, login codes or session tokens in the recording. Sign in before recording. Do not fabricate results or change filters invisibly to make an empty search look successful.

## Original recording plan: 2 minutes 40 seconds

The following is the original recording plan. The published cut is approximately 2:30 and records the September 5 build. It predates the September 7 search and sign-in improvements. For a new recording, use the deployed product, readable browser text and no unrelated tabs. Mark cuts that remove provider waiting time.

| Time | Show | Narration |
| --- | --- | --- |
| 0:00–0:15 | Landing page, then real Bithauli requirements | “I wanted a room near Bithauli for ₹8,000 with a bed, cooler and cooking cylinder. Listings kept leaving out the details I needed.” |
| 0:15–0:35 | Preferences and live leads | “RentPilot keeps the area, budget and must-haves attached to the search. These are leads to investigate. A page becomes a match only when a permitted source supports every requirement.” |
| 0:35–0:55 | Explicit transition to fictional sample search and source notice | “To demonstrate the complete email flow safely, I'm switching to our clearly labelled sample listings and a controlled inbox. These prices and rooms are fictional.” |
| 0:55–1:15 | Run real sample extraction; two private rooms, excluded whole flat | “Firecrawl reads these permitted pages. A private room in a shared three-bedroom flat is still a private room. Unknown amenities and whole-apartment offers do not slip through the filter.” |
| 1:15–1:35 | Score breakdown and real OpenAI draft | “Convex calculates the score. OpenAI writes the inquiry from the listing evidence. I can change the message before approving it.” |
| 1:35–1:55 | Edit test disclaimer, Review & send, then Confirm | “Review saves this exact draft. Nothing sends until I confirm. AgentMail now reports that the inquiry left the outbox.” |
| 1:55–2:20 | Controlled inbox reply, then listing's Replied stage and reply text | “I'm replying from the sample inbox. The signed webhook attaches the reply to this listing, and Convex updates the page. Reloading keeps the conversation.” |
| 2:20–2:40 | Mobile view and final app/repo links | “You can set a search for your city and currency. Coverage still depends on permitted sources. The app is live on Convex, and the code and test results are public.” |

Record the actual generation, send and reply. If a provider fails, show the error or repeat the recording after resolving it; never replace it with a simulated success. Keep the finished cut under three minutes.

## Social copy

The sponsor-tagged X post is published at the link above. The alternatives below are retained drafts, not additional published posts.

### X: three-post thread

1. I built RentPilot for room searches with actual requirements: area, budget, bed, cooler, cooking cylinder. It keeps source evidence, inquiries and replies together. Built for All Gas with @convex @OpenAI @firecrawl @agentmail.

2. I used #Codex to build, debug and test RentPilot. Firecrawl finds leads; Convex checks evidence; OpenAI drafts inquiries; AgentMail sends after approval and brings replies back. The full loop passed with fictional listings and controlled inboxes.

3. Live: https://ceaseless-pigeon-981.convex.site
Code: https://github.com/himanshu748/rentpilot
You can choose your city and currency. Inventory depends on permitted sources; missing amenities stay unknown. Try your requirements and tell me where the flow gets confusing.

### LinkedIn alternative

I built RentPilot after trying to find a room near Bithauli for ₹8,000 with a bed, cooler and cooking cylinder. “Furnished” did not answer what was included.

RentPilot keeps those requirements attached to the search. Firecrawl finds leads and extracts permitted pages. Convex applies the hard filters and calculates the score. OpenAI drafts an inquiry for you to edit and approve. AgentMail sends it, then a reply appears on the same listing.

The full deployed flow passed with clearly labelled fictional listings and controlled inboxes. You can choose your city and currency, but live inventory depends on source permissions and coverage. Missing details do not count as matches.

Built for the Convex All Gas Hackathon with Convex, OpenAI, Firecrawl and AgentMail. [Select the four official company mentions in the LinkedIn composer before publishing.]

I used OpenAI Codex throughout the build for implementation, debugging and end-to-end checks. #Codex #AllGasHackathon

Try it: https://ceaseless-pigeon-981.convex.site
Code: https://github.com/himanshu748/rentpilot

## Submission gates

- [x] Live app and public repository
- [x] Real sponsor integration loop verified on controlled fixtures
- [x] 75 automated tests, build and typecheck pass on September 8; four generated-file lint warnings remain
- [x] Verify Luma registration (August 26 confirmation email checked September 5)
- [x] Participant confirms personal eligibility under the official rules (September 5)
- [x] Record, inspect and publicly host the under-three-minute video
- [ ] Obtain owner-confirmed, permission-backed real listing evidence before claiming a live inventory integration
- [x] Publish X post with required sponsor tags; record URL
- [x] Add video and social URLs to this file and hackathon.md
- [x] Verify the resulting public Vibe Apps submission page
- [ ] Repeat the authenticated provider search after the September 7 discovery update

The event deadline is September 22, 2026 at 12 PM Pacific, per the official event page checked September 8. Do not mark a gate complete merely because its draft exists.
