# RentPilot evidence and consent audit — 20 September 2026

## Current source permission evidence

A fresh read of production `workspace:listSources` at `ceaseless-pigeon-981.convex.cloud` returned exactly two approved sources:

- `ceaseless-pigeon-981.convex.site`: RentPilot-operated sample pages. Written extraction permission applies to these fictional records, not real rental supply. The registry's `isDemo: false` describes extraction mode; it does not establish real inventory.
- `demo.rentpilot.local`: explicitly synthetic demo feed.

No authorized real extraction feed or consenting lister inventory was established. Roomies' current terms, section 3.1, continue to restrict scraping: https://www.roomies.co.in/terms. Housing's terms were inspected at https://housing.com/terms-of-use; no affirmative extraction permission was obtained. Neither site was scraped for listings during this audit. Historical ads in `inventory-evidence.md` are not current vacancies or permission grants.

## New private workflow (deployed 20 September 2026)

1. Sign in and save a rental brief.
2. Add original text you own or have permission to use. Record its origin, permission basis and source date; unknown dates are allowed and visible. This does not fetch a third-party URL.
3. Save the unverified listing. Original text, source date and original requirements are retained across later searches. Repeating the same import returns the existing record.
4. Review original evidence and missing requirements. All supplied facts remain unverified. Locality names do not establish measured distance. Rent, mandatory recurring charges and deposit are separate questions.
5. If the lister permits contact and a valid recipient is recorded, choose **Ask to verify**. Review the full factual message, recipient and uncertainties, check the acknowledgement, then explicitly confirm sending. No AI service is needed for these questions.
6. An AgentMail enqueue is labelled queued, not contacted or delivered. A provider receipt updates delivery status. Duplicate clicks cannot enqueue another inquiry for that saved lead.
7. A reply must match the configured inbox, recorded thread and permitted sender. Its message identity is deduplicated, including different webhook event IDs for the same message. Early replies retry while the outbound thread receipt is pending. Reply text is attributed correspondence, never independent property or landlord verification.
8. Reload to see the saved brief, immutable source text, inquiry and replies. The existing source-link notebook and manual notes remain separate. Manually recording a viewing does not establish a provider-confirmed appointment.

Fictional practice imports cannot send mail. Revocation blocks new inquiries and inbound association; an already-enqueued provider message cannot be recalled by this version. There is one inquiry per supplied lead; a failed send does not automatically trigger another inquiry.

## Interpretation and confirmed matches

Quotation matching no longer certifies a model's classification. Supported amenity interpretations are deterministic and conservative; unfamiliar or conditional language abstains. Explicit negation is not inclusion. Contradictory room types do not certify a private room. A single room is not automatically a private room.

A confirmed match also requires known mandatory recurring charges within the total budget. The initial cost parser deliberately accepts only unambiguous numeric `Mandatory monthly charges: ...` and `Deposit: ...` lines; conflicting or additional fee descriptions abstain. Broader free-text fees stay in the unverified workflow. Legacy listings without charge evidence are excluded until rechecked, rather than migrated to an invented zero. Deposit is not added to monthly rent. Fetch time earns no freshness points and does not establish availability.

Source approval is rechecked when persisting extraction, reading confirmed matches, drafting, and sending. Revocation during extraction prevents persistence. The existing source-domain checks remain in place.

## Verification boundary and rollout

See `verification-2026-09-20.md` for exact local results. Automated integration tests use explicitly named fictional fixtures and mock AgentMail receipts; they establish application logic, not real email delivery. No new lister was contacted, no vacancy or appointment was fabricated, and no renter testimonial exists.

A real trial requires a willing renter and a lister-authorized original listing, then specific recipient/send approval. Ask the renter to import incomplete information, explain the difference between a lead and a confirmed match, inspect costs, review the inquiry, and reload after the consenting lister replies. Record observed failures and the participant's actual words only with their consent. No independent renter trial has happened in this audit.

For future rollouts: review the additive tables and stricter legacy-match behavior; deploy Convex functions/schema; build and deploy the static export; verify signed-in import and mobile review; complete one consenting lister round trip. Do not modify shared AgentMail inbox configuration or another project's webhooks. Recheck that public submission claims describe what is actually deployed.

## Area guidance and phone fallback

Search preferences explain how to choose a neighbourhood, sector or street and explicitly add surrounding areas. Inquiries ask for the street/sector and nearest landmark; this does not assert measured distance. When email is missing, a valid source-backed or user-supplied number is displayed. Permitted non-fictional contacts have a manual call link and supplied leads expose questions to ask by phone. No phone call is placed automatically and it does not create email delivery or viewing activity. Numbers are validated without inventing a country code; extraction retains only numbers found in source text.
