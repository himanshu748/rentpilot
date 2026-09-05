import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, House, ShieldCheck } from "lucide-react";
import "./landing.css";

export const metadata: Metadata = {
  title: "RentPilot | Search rooms by area, budget and must-haves",
  description:
    "Search for rooms in your chosen area, check listing details against your budget and must-haves, and review an AI-written inquiry before sending it.",
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
      "Search your chosen city and areas. Web leads link to the original sites so you can investigate each option.",
  },
  {
    name: "Reviewed",
    detail:
      "For sources that allow extraction, RentPilot checks the rent, area, room type and your must-haves before adding a match.",
  },
  {
    name: "Drafted",
    detail:
      "OpenAI drafts an inquiry from the listing details. Edit the message to ask about availability, rent and what is included.",
  },
  {
    name: "Contacted",
    detail:
      "Check the source-listed email and the saved message, then confirm the send. Delivery status appears beside the inquiry.",
  },
  {
    name: "Replied",
    detail:
      "Replies return to the RentPilot inbox. Automatic reply tracking in your matches is still being tested.",
  },
  {
    name: "Viewing",
    detail:
      "Arrange a visit with the lister and check the room in person. RentPilot does not book appointments for you.",
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
          <a href="#gate">Listing checks</a>
          <a href="#stages">How it works</a>
          <a href="#score">Your requirements</a>
          <a href="#stack">Built with</a>
        </nav>
        <Link className="lp-cta" href="/app">
          Start your search
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </header>

      <main>
        <section className="lp-band lp-hero">
          <div className="lp-row">
            <div className="lp-marker" aria-hidden="true">
              <span>RentPilot</span>
              <span>Room search</span>
            </div>
            <div className="lp-body">
              <div className="lp-hero-grid">
                <div>
                  <span className="lp-eyebrow">Room search, with the details checked</span>
                  <h1 className="lp-h1">
                    Find rooms that fit your <em>budget and must-haves</em>.
                  </h1>
                  <p className="lp-lede">
                    Choose your area, monthly budget and the things you need in a room.
                    Search the web, see which listing details support a match, and review
                    an AI-written inquiry before you send it.
                  </p>
                  <div className="lp-actions">
                    <Link className="lp-cta" href="/app">
                      Start your search
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                    <a className="lp-cta-quiet" href="#gate">
                      See what gets checked
                    </a>
                  </div>
                  <p className="lp-sub">Sign in with an email code to search live sources. Coverage varies by location; some results will be links you need to check yourself.</p>
                </div>

                <div>
                  <div className="lp-specimen">
                    <div className="lp-specimen-head">
                      <span>Fictional example</span>
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
                          <span className="lp-tag">Sample</span>
                        </div>
                        <p className="lp-specimen-place">HSR Layout, Bengaluru · Private room</p>
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
                        This fictional room shows how the score breaks down.
                        It is not an available rental.
                      </p>
                    </div>
                    <div className="lp-note">
                      <p>
                        A fit score describes the listing information.
                        Confirm the price, inclusions and availability with the lister.
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
              <span>Listing checks</span>
            </div>
            <div className="lp-body">
              <h2 className="lp-h2">See what the listing says before you contact anyone.</h2>
              <p className="lp-sub">
                Search snippets can leave out rent, amenities or availability. RentPilot
                separates these unverified leads from matches backed by details on a source page.
              </p>

              <div className="lp-gate">
                <div className="lp-gate-head">
                  <strong>From a search result to a checked match</strong>
                  <span className="lp-stamp">Source evidence required</span>
                </div>
                <ol className="lp-trail">
                  <li>
                    <time>Step 1</time>
                    <p>
                      Open web leads on their original sites.
                      <small>A snippet alone does not confirm that a room meets your needs.</small>
                    </p>
                  </li>
                  <li>
                    <time>Step 2</time>
                    <p>
                      Check details from sources that permit extraction.
                      <small>Other sources stay as links for you to review manually.</small>
                    </p>
                  </li>
                  <li>
                    <time>Step 3</time>
                    <p>
                      Keep only listings that meet every requirement.
                      <small>A missing bed, cooler or other must-have keeps a listing out of your matches until the source supports it.</small>
                    </p>
                  </li>
                  <li>
                    <time>Step 4</time>
                    <p>
                      Review the recipient and message before sending.
                      <small>In-app email needs a source-listed address. You can contact other listers through the original site.</small>
                    </p>
                  </li>
                </ol>
                <p className="lp-gate-foot">
                  These checks use published information. RentPilot has not inspected the
                  property or verified the landlord&apos;s identity. Confirm details before committing to a room.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-band" id="stages">
          <div className="lp-row">
            <div className="lp-marker" aria-hidden="true">
              <span>Record 02</span>
              <span>How it works</span>
            </div>
            <div className="lp-body">
              <h2 className="lp-h2">Keep the listing and your inquiry together.</h2>
              <p className="lp-sub">
                Follow each match from the details you checked to the message you approved.
                You decide whom to contact and whether to arrange a visit.
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
              <span>Your requirements</span>
            </div>
            <div className="lp-body">
              <h2 className="lp-h2">Your budget and must-haves are firm limits.</h2>
              <p className="lp-sub">
                A listing enters your matches only when the source supports your rent range,
                chosen area, room type and every must-have. Each match also shows a score
                breakdown and any missing contact details.
              </p>
              <div className="lp-stack">
                <div className="lp-stack-item">
                  <strong>Budget</strong>
                  <span>Your rent range</span>
                  <p>
                    Rooms above your maximum monthly rent are excluded from matches.
                    Unverified web leads may still mention other prices.
                  </p>
                </div>
                <div className="lp-stack-item">
                  <strong>Locality</strong>
                  <span>Your chosen areas</span>
                  <p>
                    The listing must name an area you selected. Distance from a landmark
                    and commute times are not measured.
                  </p>
                </div>
                <div className="lp-stack-item">
                  <strong>Must-haves</strong>
                  <span>Details in the listing</span>
                  <p>
                    Each required amenity needs supporting text from the source.
                    A room described as furnished does not establish that it has a bed or cooler.
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
              <span>Built with</span>
            </div>
            <div className="lp-body">
              <h2 className="lp-h2">The tools behind your search.</h2>
              <div className="lp-stack">
                <div className="lp-stack-item">
                  <strong>Convex</strong>
                  <span>Saved searches</span>
                  <p>
                    Convex stores your search, matches and drafts. Signing in lets you
                    return to them from another browser.
                  </p>
                </div>
                <div className="lp-stack-item">
                  <strong>Firecrawl</strong>
                  <span>Search and listing details</span>
                  <p>
                    Firecrawl finds web leads and extracts details from approved sources.
                    Permission to extract does not establish a listing&apos;s accuracy.
                  </p>
                </div>
                <div className="lp-stack-item">
                  <strong>AgentMail</strong>
                  <span>Email delivery</span>
                  <p>
                    AgentMail sends sign-in codes and the inquiries you approve.
                    OpenAI writes the inquiry draft for you to review first.
                  </p>
                </div>
              </div>
              <p className="lp-sub">For example, bengaluru.rent requires written permission. Our request could not be delivered, so its listings remain blocked from extraction.</p>
            </div>
          </div>
        </section>

        <section className="lp-band lp-close">
          <div className="lp-row">
            <div className="lp-marker" aria-hidden="true">
              <span>Open</span>
            </div>
            <div className="lp-body">
              <span className="lp-eyebrow">Start with your requirements</span>
              <h2 className="lp-h2">Where do you want to live?</h2>
              <p className="lp-sub">
                Choose your city, areas and currency, then set your budget and must-haves.
                Sign in to search live sources. You may find web leads even where we have no
                approved source for checked matches.
              </p>
              <div className="lp-actions">
                <Link className="lp-cta" href="/app">
                  Start your search
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
              <p className="lp-sub" style={{ marginTop: 18, display: "flex", gap: 7 }}>
                <ShieldCheck size={16} aria-hidden="true" style={{ flex: "0 0 auto", marginTop: 2 }} />
                Every inquiry needs your confirmation. Fictional sample listings are labelled separately from real rentals.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <span>RentPilot, Convex All Gas Hackathon build</span>
        <span>
          <a href="#gate">Listing checks</a> · <Link href="/app">Start your search</Link>
        </span>
      </footer>
    </div>
  );
}
