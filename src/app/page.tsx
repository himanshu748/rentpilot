import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, House, ShieldCheck } from "lucide-react";
import "./landing.css";

export const metadata: Metadata = {
  title: "RentPilot | Rental pursuit control desk",
  description:
    "RentPilot turns scattered room listings into traceable pursuits. Every score shows its evidence, and nothing is fetched or sent until you approve it.",
};

const factors = [
  { label: "Budget", value: 30, max: 30, note: "Inside the selected range" },
  { label: "Locality", value: 28, max: 30, note: "Preferred neighbourhood" },
  { label: "Evidence", value: 24, max: 25, note: "Contact path found" },
  { label: "Freshness", value: 12, max: 15, note: "Seen recently" },
];

const stages = [
  {
    name: "Found",
    detail:
      "A permitted source returns a listing. The canonical URL and a content hash are stored so the same room is never counted twice.",
  },
  {
    name: "Reviewed",
    detail:
      "The listing is scored against your brief. Missing fields are named, not hidden, and they lower the confidence figure.",
  },
  {
    name: "Drafted",
    detail:
      "OpenAI writes a grounded inquiry from the retained evidence. You can edit it, but no live message can become ready without that model-generated draft.",
  },
  {
    name: "Contacted",
    detail:
      "You approve the send. AgentMail takes the message on a durable queue keyed to one request id, so a double click cannot send twice.",
  },
  {
    name: "Replied",
    detail:
      "The landlord answers in the same thread. Delivery state and failures are recorded against the pursuit.",
  },
  {
    name: "Viewing",
    detail:
      "The pursuit closes out with a booked viewing, or it is marked closed with the reason kept on the record.",
  },
];

export default function Home() {
  return (
    <div className="lp">
      <header className="lp-bar">
        <span className="wordmark">
          <span className="brand-mark" aria-hidden="true">
            <House size={17} />
            <span />
          </span>
          <span>RentPilot</span>
        </span>
        <nav className="lp-bar-links" aria-label="Sections">
          <a href="#gate">Policy gate</a>
          <a href="#stages">Stages</a>
          <a href="#score">Scoring</a>
          <a href="#stack">Stack</a>
        </nav>
        <Link className="lp-cta" href="/app">
          Open the cockpit
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </header>

      <main>
        <section className="lp-band lp-hero">
          <div className="lp-row">
            <div className="lp-marker" aria-hidden="true">
              <span>RentPilot</span>
              <span>Pursuit desk</span>
            </div>
            <div className="lp-body">
              <div className="lp-hero-grid">
                <div>
                  <span className="lp-eyebrow">Rental operations, not a listings feed</span>
                  <h1 className="lp-h1">
                    Every room you chase becomes a pursuit with <em>a paper trail</em>.
                  </h1>
                  <p className="lp-lede">
                    RentPilot ranks rooms against your brief, shows the evidence behind
                    every score, and uses OpenAI to draft one inquiry for you to approve. It will not
                    fetch from a source, or email anyone, until the permission for that
                    is on the record.
                  </p>
                  <div className="lp-actions">
                    <Link className="lp-cta" href="/app">
                      Open the cockpit
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                    <a className="lp-cta-quiet" href="#gate">
                      Read the refusal
                    </a>
                  </div>
                </div>

                <div>
                  <div className="lp-specimen">
                    <div className="lp-specimen-head">
                      <span>Pursuit RP-D01</span>
                      <span>Fit 94</span>
                    </div>
                    <div className="lp-specimen-row">
                      <div className="lp-specimen-score">
                        <strong>94</strong>
                        <small>match</small>
                      </div>
                      <div className="lp-specimen-copy">
                        <div className="lp-specimen-title">
                          <b>Sunlit room near 27th Main</b>
                          <span className="lp-tag">Drafted</span>
                        </div>
                        <p className="lp-specimen-place">HSR Layout, private room</p>
                        <div className="lp-specimen-strip">
                          <span>₹24,500</span>
                          <span>Contact found</span>
                        </div>
                      </div>
                    </div>
                    <div className="lp-specimen-foot">
                      {factors.map((factor) => (
                        <div className="lp-factor" key={factor.label}>
                          <span>{factor.label}</span>
                          <span
                            className={
                              factor.value / factor.max < 0.9 ? "lp-meter is-short" : "lp-meter"
                            }
                          >
                            <i style={{ width: `${(factor.value / factor.max) * 100}%` }} />
                          </span>
                          <b>
                            {factor.value}/{factor.max}
                          </b>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lp-notes">
                    <div className="lp-note">
                      <p>
                        <b>94 is not a vibe.</b> It is four measured factors that add up,
                        each with the reason it scored what it did.
                      </p>
                    </div>
                    <div className="lp-note">
                      <p>
                        <b>Freshness scored 12 of 15.</b> The gap stays visible instead of
                        being rounded away into a recommendation.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-band" id="gate">
          <div className="lp-row">
            <div className="lp-marker" aria-hidden="true">
              <span>Record 01</span>
              <span>Source policy</span>
            </div>
            <div className="lp-body">
              <h2 className="lp-h2">The first real source said no. That is on the record.</h2>
              <p className="lp-sub">
                Most tools would have scraped it anyway. RentPilot read the terms, asked
                for written permission, failed to reach anyone, and stopped. Here is the
                trail Convex kept, exactly as the product shows it.
              </p>

              <div className="lp-gate">
                <div className="lp-gate-head">
                  <strong>bengaluru.rent</strong>
                  <span className="lp-stamp">Discovery blocked</span>
                </div>
                <ol className="lp-trail">
                  <li>
                    <time>Step 1</time>
                    <p>
                      Firecrawl fetched the public terms page.
                      <small>No listings and no private contact details were imported.</small>
                    </p>
                  </li>
                  <li>
                    <time>Step 2</time>
                    <p>
                      The terms require written permission for automated extraction.
                      <small>Source recorded as review_required, which blocks every scrape call.</small>
                    </p>
                  </li>
                  <li>
                    <time>Step 3</time>
                    <p>
                      A permission request was sent from the project inbox.
                      <small>One human-approved message, not a campaign.</small>
                    </p>
                  </li>
                  <li>
                    <time>Step 4</time>
                    <p>
                      The recipient mail server was unreachable and AgentMail returned a
                      delivery failure.
                      <small>The failure is stored against the source, not swallowed.</small>
                    </p>
                  </li>
                </ol>
                <p className="lp-gate-foot">
                  The source stays gated until a valid contact path grants written
                  permission. <code>scrapeApprovedListing</code> refuses any source whose
                  status is not <code>approved</code>, and refuses any URL outside that
                  source&apos;s own domain.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-band" id="stages">
          <div className="lp-row">
            <div className="lp-marker" aria-hidden="true">
              <span>Record 02</span>
              <span>Pursuit rail</span>
            </div>
            <div className="lp-body">
              <h2 className="lp-h2">Six stages, and a pursuit only moves when something real happened.</h2>
              <p className="lp-sub">
                The rail in the cockpit is the same sequence. Order matters here, because
                each stage is gated by the one before it.
              </p>
              <div className="lp-stages">
                {stages.map((stage, index) => (
                  <div className="lp-stage" key={stage.name}>
                    <span className="lp-stage-num">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="lp-stage-name">{stage.name}</span>
                    <p>{stage.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="lp-band" id="score">
          <div className="lp-row">
            <div className="lp-marker" aria-hidden="true">
              <span>Record 03</span>
              <span>Explainability</span>
            </div>
            <div className="lp-body">
              <h2 className="lp-h2">A missing detail lowers confidence. It never disappears.</h2>
              <p className="lp-sub">
                Scoring is deterministic and runs in Convex, so the same listing and the
                same brief always produce the same number. There is no model deciding
                what you should want. When a contact path is missing, the evidence factor
                drops from 25 to 14, confidence falls from 92 to 76, and the pursuit says
                so on its face.
              </p>
              <div className="lp-stack">
                <div className="lp-stack-item">
                  <strong>Budget</strong>
                  <span>30 points</span>
                  <p>
                    Full marks inside your range, half marks within twenty percent of the
                    ceiling, nothing above that.
                  </p>
                </div>
                <div className="lp-stack-item">
                  <strong>Locality</strong>
                  <span>30 points</span>
                  <p>
                    Matched against the areas you named, not against a popularity score
                    or a sponsored placement.
                  </p>
                </div>
                <div className="lp-stack-item">
                  <strong>Evidence</strong>
                  <span>25 points</span>
                  <p>
                    Rewards a published contact path. Missing fields are listed on the
                    pursuit so you know what you are deciding without.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-band" id="stack">
          <div className="lp-row">
            <div className="lp-marker" aria-hidden="true">
              <span>Record 04</span>
              <span>Stack</span>
            </div>
            <div className="lp-body">
              <h2 className="lp-h2">Three services, each doing one job.</h2>
              <div className="lp-stack">
                <div className="lp-stack-item">
                  <strong>Convex</strong>
                  <span>State and rules</span>
                  <p>
                    Schema, indexed queries and every mutation. Session-scoped so one
                    browser never reads another visitor&apos;s pursuits, drafts or contacts.
                  </p>
                </div>
                <div className="lp-stack-item">
                  <strong>Firecrawl</strong>
                  <span>Permitted discovery</span>
                  <p>
                    Structured extraction from approved sources only, over https, with the
                    host checked against the source that granted permission.
                  </p>
                </div>
                <div className="lp-stack-item">
                  <strong>AgentMail</strong>
                  <span>Human-approved send</span>
                  <p>
                    A durable outbox with an idempotency guard. Delivery state flows back
                    onto the pursuit, including bounces.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-band lp-close">
          <div className="lp-row">
            <div className="lp-marker" aria-hidden="true">
              <span>Open</span>
            </div>
            <div className="lp-body">
              <span className="lp-eyebrow">Live demo workspace</span>
              <h2 className="lp-h2">Open the cockpit and work a pursuit end to end.</h2>
              <p className="lp-sub">
                The demo workspace is seeded with synthetic listings and labelled as such
                in the product. Set your own city and the queue empties honestly, because
                no source has granted permission for it yet.
              </p>
              <div className="lp-actions">
                <Link className="lp-cta" href="/app">
                  Open the cockpit
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
              <p className="lp-sub" style={{ marginTop: 18, display: "flex", gap: 7 }}>
                <ShieldCheck size={16} aria-hidden="true" style={{ flex: "0 0 auto", marginTop: 2 }} />
                Synthetic recipients are never emailed. The server refuses the send, not
                just the button.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <span>RentPilot, Convex All Gas Hackathon build</span>
        <span>
          <a href="#gate">Source policy</a> · <Link href="/app">Cockpit</Link>
        </span>
      </footer>
    </div>
  );
}
