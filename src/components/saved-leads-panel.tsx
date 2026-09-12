"use client";

import { useId, useState } from "react";
import { ArrowUpRight, Bookmark, Pencil, Trash2 } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

type SavedLead = FunctionReturnType<typeof api.webSearch.savedLeads>[number];
type Update = (lead: SavedLead, stage: SavedLead["stage"], notes: string, revision: number) => Promise<void>;
const stages = { to_check: "To check", contacted: "Contacted by me", viewing: "Viewing arranged", not_suitable: "Not suitable" } as const;

function SavedLeadRow({ lead, onUpdate, onRemove }: { lead: SavedLead; onUpdate: Update; onRemove: (lead: SavedLead) => Promise<void> }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [stage, setStage] = useState(lead.stage);
  const [notes, setNotes] = useState(lead.notes);
  const [revision, setRevision] = useState(lead.updatedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function edit() {
    setNotes(lead.notes); setStage(lead.stage); setRevision(lead.updatedAt);
    setEditing(true); setError(null);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await onUpdate(lead, stage, notes, revision); setEditing(false); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save your notes."); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError(null);
    try { await onRemove(lead); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not remove this lead."); setBusy(false); }
  }
  return <li className="saved-lead">
    <div className="discovery-lead-meta"><span>{lead.city} · {new URL(lead.lead.url).hostname.replace(/^www\./, "")}</span><span className="saved-stage">{stages[lead.stage]}</span></div>
    <h3><a href={lead.lead.url} target="_blank" rel="noopener noreferrer">{lead.lead.title} <ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only"> (opens source in a new tab)</span></a></h3>
    <p className="saved-lead-date">Source snapshot from <time dateTime={new Date(lead.searchedAt).toISOString()}>{new Date(lead.searchedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</time>. Availability is not verified.</p>
    <details className="saved-source"><summary>Original source and requirements</summary><p>{lead.lead.description}</p><p>{lead.lead.note}</p><ul>{lead.requirements.map((requirement, index) => <li key={`${index}-${requirement}`}>{requirement} <span>· {lead.lead.status === "matched" ? "Source-supported at save" : "Not verified"}</span></li>)}</ul><p>These are the requirements you saved with this link. New searches do not change this snapshot.</p></details>
    {editing ? <form className="saved-notes-form" onSubmit={save}>
      <label htmlFor={`${id}-stage`}>My progress<select id={`${id}-stage`} value={stage} onChange={event => setStage(event.target.value as SavedLead["stage"])}>{Object.entries(stages).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label htmlFor={`${id}-notes`}>My notes<textarea id={`${id}-notes`} value={notes} onChange={event => setNotes(event.target.value)} maxLength={3000} rows={4} placeholder="What did the lister confirm? Rent, deposit, amenities, viewing time…" /></label>
      <p>Notes and stages are your own records. They do not verify a listing or send a message.</p>
      <div className="discovery-lead-actions"><button className="secondary-action" type="submit" disabled={busy}>{busy ? "Saving…" : "Save notes"}</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setError(null); }}>Cancel</button></div>
    </form> : <>
      {lead.notes && <p className="saved-notes"><strong>My notes</strong>{lead.notes}</p>}
      <div className="discovery-lead-actions"><button type="button" onClick={edit}><Pencil size={14} aria-hidden="true" />{lead.notes ? "Edit notes & progress" : "Add notes & progress"}</button><button type="button" disabled={busy} onClick={remove}><Trash2 size={14} aria-hidden="true" />Remove from saved</button></div>
    </>}
    {error && <p className="discovery-error" role="alert">{error}</p>}
  </li>;
}

export function SavedLeadsPanel({ leads, onUpdate, onRemove }: { leads: SavedLead[]; onUpdate: Update; onRemove: (lead: SavedLead) => Promise<void> }) {
  const [filter, setFilter] = useState<"all" | SavedLead["stage"]>("all");
  const visible = leads.filter(lead => filter === "all" || lead.stage === filter);
  return <section className="saved-leads-panel" id="saved-leads" aria-labelledby="saved-leads-title">
    <header className="discovery-heading"><div><h2 id="saved-leads-title"><Bookmark size={18} aria-hidden="true" /> Saved leads <span>{leads.length}/50</span></h2><p>Your notebook stays with your account across searches.</p></div></header>
    {leads.length === 0 ? <p className="discovery-empty">Save a source link above to keep it here. Record what you learn from the lister, then track your next step.</p> : <>
      <div className="discovery-filters" aria-label="Filter saved leads">{(["all", ...Object.keys(stages)] as ("all" | SavedLead["stage"])[]).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All saved" : stages[value]}<span>{value === "all" ? leads.length : leads.filter(lead => lead.stage === value).length}</span></button>)}</div>
      <ul className="discovery-results">{visible.map(lead => <SavedLeadRow key={lead._id} lead={lead} onUpdate={onUpdate} onRemove={onRemove} />)}</ul>
      {visible.length === 0 && <p className="discovery-empty">No saved leads at this stage. Choose another filter to see your notebook.</p>}
    </>}
  </section>;
}
