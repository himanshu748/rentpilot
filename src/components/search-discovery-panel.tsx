"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Bookmark, Check, Copy, LoaderCircle, Search } from "lucide-react";
import { formatMoney } from "../../convex/location";

type Brief = { city: string; currency: string; budgetMax: number; budgetMin: number; localities: string[]; bedrooms: string[]; mustHaves: string[] };
type Lead = { url: string; title: string; description: string; status: "matched" | "excluded" | "blocked" | "permission_required"; note: string };
type Run = { query: string; queries?: string[]; results: Lead[]; searchedAt: number; phase?: "searching" | "checking" | "complete" | "failed"; error?: string; warning?: string };

export function questionsForLead(brief: Brief, url: string) {
  return [
    `Hi, I'm asking about this listing: ${url}`,
    `Is it still available? I'm looking for ${brief.bedrooms.join(" or ")} in ${brief.localities.join(" / ")}, ${brief.city}.`,
    `My monthly rent range is ${formatMoney(brief.budgetMin, brief.currency)}–${formatMoney(brief.budgetMax, brief.currency)}. What is the rent, deposit, and any extra monthly charge?`,
    ...brief.mustHaves.map(item => `Is ${item} provided and included in the rent?`),
    "Please share the exact location, current photos, and a time I can view the room.",
  ].join("\n\n");
}

function LeadRow({ lead, brief, saved, onSave }: { lead: Lead; brief: Brief; saved: boolean; onSave: (url: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  async function save() {
    setSaving(true); setSaveError(null);
    try { await onSave(lead.url); } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not save this lead. Try again."); }
    finally { setSaving(false); }
  }
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const matched = lead.status === "matched";
  const questions = questionsForLead(brief, lead.url);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy() {
    try { await navigator.clipboard.writeText(questions); setCopied(true); setManualCopy(false); }
    catch { setManualCopy(true); }
  }
  return <li className="discovery-lead">
    <div className="discovery-lead-meta"><span>{new URL(lead.url).hostname.replace(/^www\./, "")}</span><span className={matched ? "lead-evidence-status" : "lead-unchecked-status"}>{matched ? "Evidence-backed" : lead.status === "excluded" ? "Check incomplete / not a match" : "Needs checking"}</span></div>
    <h3><a href={lead.url} target="_blank" rel="noopener noreferrer">{lead.title}<ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only"> (opens source in a new tab)</span></a></h3>
    <p className="discovery-snippet">{lead.description}</p>
    <details className="lead-checks">
      <summary>{matched ? "What the source supports" : "What needs checking"}</summary>
      <p>{lead.note}</p>
      <dl>{[`${formatMoney(brief.budgetMin, brief.currency)}–${formatMoney(brief.budgetMax, brief.currency)} / month`, brief.localities.join(" / "), brief.bedrooms.join(" or "), ...brief.mustHaves].map((requirement, index) => <div key={`${index}-${requirement}`}><dt>{requirement}</dt><dd>{matched ? "Source-supported" : "Not verified"}</dd></div>)}<div><dt>Available now · lister identity · safety</dt><dd>Not verified</dd></div></dl>
      <p>Search snippets do not prove amenities or availability. Confirm details with the lister before arranging a visit or paying anything.</p>
    </details>
    <div className="discovery-lead-actions"><button type="button" onClick={save} disabled={saved || saving}><Bookmark size={14} aria-hidden="true" />{saved ? "Saved to notebook" : saving ? "Saving…" : "Save lead"}</button><a href={lead.url} target="_blank" rel="noopener noreferrer">Open source <ArrowUpRight size={14} aria-hidden="true" /><span className="sr-only"> (new tab)</span></a><button type="button" onClick={copy}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}<span aria-live="polite">{copied ? "Questions copied" : "Copy questions"}</span></button></div>
    {saveError && <p className="discovery-error" role="alert">{saveError}</p>}
    {manualCopy && <label className="manual-copy">Clipboard unavailable. Select and copy these questions:<textarea readOnly value={questions} onFocus={event => event.currentTarget.select()} rows={7} /></label>}
  </li>;
}

export function SearchDiscoveryPanel({ brief, run, searching, error, onSearch, onEdit, savedUrls, onSaveLead }: { brief: Brief; run: Run | null | undefined; searching: boolean; error: string | null; onSearch: () => void; onEdit: () => void; savedUrls: string[]; onSaveLead: (url: string) => Promise<void> }) {
  const [filter, setFilter] = useState<"all" | "unchecked" | "matched">("all");
  const [now, setNow] = useState(0);
  const serverBusy = run?.phase === "searching" || run?.phase === "checking";
  useEffect(() => {
    if (!serverBusy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [serverBusy]);
  const stale = serverBusy && now - (run?.searchedAt ?? now) > 300_000;
  const busy = searching || (serverBusy && !stale);
  const failed = run?.phase === "failed" || stale;
  const leads = run?.results ?? [];
  const matches = leads.filter(lead => lead.status === "matched").length;
  const visible = leads.filter(lead => filter === "all" || (filter === "matched" ? lead.status === "matched" : lead.status !== "matched"));
  const phase = busy ? run?.phase === "checking" ? "Checking permitted pages" : "Finding source links" : failed ? "Search interrupted" : run ? run.warning ? "Search partially complete" : "Search complete" : "Ready to search";
  return <section className="discovery-panel" aria-labelledby="discovery-title">
    <header className="discovery-heading"><div><h2 id="discovery-title">Explore leads in {brief.localities[0] || brief.city}</h2><p>Up to {formatMoney(brief.budgetMax, brief.currency)} / month · {brief.city}</p></div><button type="button" className="quiet-icon" aria-label="Edit location and requirements" onClick={onEdit}><Search size={18} aria-hidden="true" /></button></header>
    <div className={`discovery-progress${busy ? " is-searching" : ""}`} role="status"><span className="discovery-phase-icon">{busy ? <LoaderCircle size={17} aria-hidden="true" /> : run && !failed ? <Check size={17} aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}</span><div><strong>{phase}</strong><p>{busy ? "Links appear here as the search runs. Your budget and must-haves stay unchanged." : run ? `${leads.length} source ${leads.length === 1 ? "link" : "links"} · ${matches} evidence-backed ${matches === 1 ? "match" : "matches"}` : "Search for room ads, then check each one against your requirements."}</p></div></div>
    {(error || failed) && <div className="discovery-error" role="alert"><p>{error || run?.error || "This search stopped updating. Retry with the same requirements."}</p><button type="button" className="secondary-action" disabled={busy} onClick={onSearch}>Retry search</button></div>}
    {run?.warning && <div className="discovery-warning" role="status"><p>{run.warning}</p><button type="button" className="secondary-action" disabled={busy} onClick={onSearch}>Retry full search</button></div>}
    {leads.length > 0 && <>
      {matches === 0 && <p className="discovery-coverage">These are leads to investigate, not confirmed vacancies. Automated matches need a permitted source that supports every requirement. A sample source cannot establish real coverage.</p>}
      <div className="discovery-filters" aria-label="Filter web leads">{([ ["all", "All leads", leads.length], ["unchecked", "Need checking", leads.length - matches], ["matched", "Evidence-backed", matches] ] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}<span>{count}</span></button>)}</div>
      <ul className="discovery-results">{visible.map(lead => <LeadRow key={lead.url} lead={lead} brief={brief} saved={savedUrls.includes(lead.url)} onSave={onSaveLead} />)}</ul>
      {visible.length === 0 && <p className="discovery-empty">No evidence-backed leads in this search. Open “Need checking” to review source links; none has been promoted to a match.</p>}
    </>}
    {leads.length === 0 && !busy && <div className="discovery-empty"><h3>{run ? "No links returned for this search" : "Start with real source links"}</h3><p>{run ? "This does not mean there are no rooms. Check the locality spelling or add another area you would actually consider. We will not change your rent cap or amenities for you." : "Search combines your area and rent cap with a separate amenities query. A wider set of links does not relax your match requirements."}</p><button type="button" className="secondary-action" onClick={run ? onEdit : onSearch}>{run ? "Review search area" : "Find live leads"}</button></div>}
    {run && <details className="discovery-query"><summary>Search details</summary><p>Last update: <time dateTime={new Date(run.searchedAt).toISOString()}>{new Date(run.searchedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time>. Locality matching does not verify a distance radius.</p>{(run.queries ?? [run.query]).map(query => <p key={query}>{query}</p>)}</details>}
    <details className="discovery-guide"><summary>When can I email a lister?</summary><p>An evidence-backed match must also have an email address published by its source. Sign in, draft an inquiry, then review and confirm the send. For unchecked leads, open the source and use its contact method. Copy questions helps you ask about missing details; it does not send a message or verify a room.</p></details>
  </section>;
}
