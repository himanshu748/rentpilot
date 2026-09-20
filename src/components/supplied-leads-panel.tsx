"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { sourceAge } from "../../convex/leadEvidence";

type Lead = FunctionReturnType<typeof api.suppliedLeads.list>[number];
export function SuppliedLeadCard({ lead }: { lead: Lead }) {
  const send = useMutation(api.suppliedLeads.sendInquiry);
  const revoke = useMutation(api.suppliedLeads.revoke);
  const [review, setReview] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const permitted = lead.contactPermission && !!lead.recipient && !lead.revokedAt && !lead.isFixture;
  async function confirm() {
    setBusy(true); setError("");
    try { await send({ id: lead._id, recipient: lead.recipient, requestId, confirmed: true, reviewedUncertainty: acknowledged }); setReview(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Inquiry failed."); }
    finally { setBusy(false); }
  }
  return <li className="saved-lead supplied-lead">
    <div className="discovery-lead-meta"><span>{lead.isFixture ? "Fictional practice listing" : "User-supplied · unverified"}</span><span>{lead.revokedAt ? "Permission revoked" : "Not a confirmed match"}</span></div>
    <h3>{lead.title}</h3>
    <p>Source date: {lead.sourceDate || "Unknown"}{sourceAge(lead.sourceDate) === "stale" ? " · Older than 30 days" : ""}. Availability remains unknown.</p>
    <details><summary>Review original evidence and missing requirements</summary>
      <p><strong>Origin:</strong> {lead.provenance}</p><p><strong>Permission recorded by you:</strong> {lead.permissionBasis}</p>
      <blockquote className="supplied-original">{lead.originalText}</blockquote>
      <p>These saved requirements still need lister confirmation:</p><ul>{lead.requirements.map((r, i) => <li key={i}>{r} — unverified</li>)}</ul>
      <p>Rent, mandatory monthly charges and deposit must be confirmed separately. Locality names do not establish measured distance. New searches do not change this saved brief.</p>
    </details>
    {lead.inquiry ? <p role="status">Email: {lead.inquiry.status === "queued" ? "Queued; provider delivery not confirmed" : lead.inquiry.status === "sent" ? `Provider reported ${lead.inquiry.providerStatus}` : "Provider reported a failure"}. The listing remains unverified.</p> : <button type="button" className="secondary-action" disabled={!permitted || busy} onClick={() => { setReview(true); setAcknowledged(false); }}>Ask to verify</button>}
    {!permitted && !lead.inquiry && <p>No email will be sent without an authorized recipient and active contact permission. Fictional practice listings never send mail.</p>}
    {review && !lead.inquiry && <section className="verification-review" aria-label="Review inquiry">
      <h4>Review this inquiry</h4><p><strong>To:</strong> {lead.recipient}</p><p><strong>Subject:</strong> {lead.draft.subject}</p><p className="supplied-original">{lead.draft.body}</p>
      <label><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} /> I reviewed the recipient, original evidence, unknown or old source date, and complete message. I have permission to contact this person.</label>
      <div className="discovery-lead-actions"><button type="button" disabled={busy || !acknowledged || !permitted} onClick={confirm}>{busy ? "Queueing…" : "Confirm & send email"}</button><button type="button" disabled={busy} onClick={() => setReview(false)}>Cancel</button></div>
    </section>}
    {lead.replies.map(reply => <blockquote key={reply._id} className="supplied-original"><strong>Lister reply from {reply.from}</strong><br />{reply.text}<footer>Received {new Date(reply.receivedAt).toLocaleString()}. Attributable correspondence, not independent verification of the property or person.</footer></blockquote>)}
    {!lead.revokedAt && <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await revoke({ id: lead._id }); setReview(false); } catch(e) { setError(e instanceof Error ? e.message : "Could not revoke permission."); } finally { setBusy(false); } }}>Revoke contact permission</button>}
    <p className="saved-lead-date">Revocation stops new inquiries. It cannot recall an email already queued with the provider.</p>
    {error && <p role="alert">{error}</p>}
  </li>;
}
export function SuppliedLeadsPanel() {
  const leads = useQuery(api.suppliedLeads.list);
  const importListing = useMutation(api.suppliedLeads.importListing);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    setBusy(true); setError("");
    try { await importListing({ title: value("title"), originalText: value("originalText"), provenance: value("provenance"), sourceDate: value("sourceDate"), permissionBasis: value("permissionBasis"), recipient: value("recipient"), contentPermission: data.has("contentPermission"), contactPermission: data.has("contactPermission"), isFixture: data.has("isFixture") }); form.reset(); }
    catch(e) { setError(e instanceof Error ? e.message : "Could not save listing."); }
    finally { setBusy(false); }
  }
  return <section className="saved-leads-panel" aria-labelledby="supplied-title">
    <h2 id="supplied-title">A listing someone shared with you</h2>
    <p>Keep incomplete information and ask factual questions. This does not create a verified match.</p>
    <details><summary>Add a permission-backed listing</summary><form className="saved-notes-form" onSubmit={save}>
      <p>Use your own listing text or text the lister authorized you to use. Do not copy restricted platform content or contact details without permission.</p>
      <label>Title<input name="title" required minLength={3} maxLength={120} /></label>
      <label>Original listing text<textarea name="originalText" required minLength={20} maxLength={12000} rows={6} /></label>
      <label>Where did it come from?<input name="provenance" required minLength={3} maxLength={500} placeholder="For example, a message shared directly by the lister" /></label>
      <label>Source date, if known<input type="date" name="sourceDate" /></label>
      <label>Permission basis<textarea name="permissionBasis" required minLength={10} maxLength={1000} rows={2} placeholder="Who permitted this use, and when?" /></label>
      <label>Permitted contact email, if known<input name="recipient" type="email" maxLength={254} /></label>
      <label><input type="checkbox" name="contentPermission" required /> I own this text or have permission to use it here.</label>
      <label><input type="checkbox" name="contactPermission" /> The lister permits an inquiry at this email.</label>
      <label><input type="checkbox" name="isFixture" /> This is a fictional practice listing. Never send email.</label>
      <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save unverified listing"}</button>
      {error && <p role="alert">{error}</p>}
    </form></details>
    <ul className="discovery-results">{leads?.map(lead => <SuppliedLeadCard key={lead._id} lead={lead} />)}</ul>
  </section>;
}
