"use client";

import { animate, stagger } from "animejs";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Filter,
  House,
  Inbox,
  Mail,
  MapPin,
  Menu,
  Radar,
  Search,
  Send,
  LogOut,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import {
  statusLabels,
  statusOrder,
  type Pursuit,
  type PursuitStatus,
  type SendStatus,
} from "@/lib/pursuit";
import { SignInDialog } from "@/components/sign-in-dialog";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import { currencies, formatMoney, validCurrency } from "../../convex/location";

const COMPACT_QUERY = "(max-width: 1050px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type SearchCriteria = {
  city: string;
  country: string;
  currency: string;
  budgetMin: number;
  budgetMax: number;
  localities: string[];
  bedrooms: string[];
  mustHaves: string[];
  contactName: string;
  contactEmail: string | null;
};

const defaultCriteria: SearchCriteria = {
  city: "",
  country: "",
  currency: "USD",
  budgetMin: 0,
  budgetMax: 0,
  localities: [],
  bedrooms: ["Private room"],
  mustHaves: [],
  contactName: "",
  contactEmail: null,
};

/** Deliberately permissive: enough to catch a typo, not to police valid addresses. */
function isEmailish(value: string) {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);
}

const homeTypes = ["Private room", "Studio", "1 bedroom", "2 bedrooms", "Shared room", "1 BHK", "2 BHK"];

function useMediaQuery(queryString: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(queryString);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [queryString],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(queryString).matches,
    () => false,
  );
}

function prefersReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Entry animations move elements from an invisible start state, and a hidden
 * tab never services requestAnimationFrame, so starting one in the background
 * leaves the content stuck at that start state. Defer until the tab is visible.
 */
function runWhenVisible(play: () => void) {
  if (document.visibilityState === "visible") {
    play();
    return () => {};
  }
  function onVisibilityChange() {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    play();
  }
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => document.removeEventListener("visibilitychange", onVisibilityChange);
}

/**
 * Convex wraps server errors with an "Uncaught Error:" prefix and a stack
 * trace. Neither belongs in a toast, so keep only the sentence we wrote.
 */
function readableError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const firstLine = error.message.split("\n")[0] ?? "";
  const cleaned = firstLine.replace(/^(Uncaught\s+)?Error:\s*/i, "").trim();
  return cleaned || fallback;
}

function splitValues(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function CriteriaDialog({
  open,
  onOpenChange,
  criteria,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  criteria: SearchCriteria;
  onSave: (criteria: SearchCriteria) => Promise<void>;
}) {
  const [city, setCity] = useState(criteria.city);
  const [country, setCountry] = useState(criteria.country);
  const [currency, setCurrency] = useState(criteria.currency);
  const [areas, setAreas] = useState(criteria.localities.join(", "));
  const [budgetMin, setBudgetMin] = useState(String(criteria.budgetMin));
  const [budgetMax, setBudgetMax] = useState(String(criteria.budgetMax));
  const [bedrooms, setBedrooms] = useState(criteria.bedrooms);
  const [mustHaves, setMustHaves] = useState(criteria.mustHaves.join(", "));
  const [contactName, setContactName] = useState(criteria.contactName);
  const [contactEmail, setContactEmail] = useState(criteria.contactEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function toggleHomeType(type: string) {
    setBedrooms((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedMin = Number(budgetMin.replace(/,/g, ""));
    const parsedMax = Number(budgetMax.replace(/,/g, ""));
    const nextErrors: Record<string, string> = {};
    if (city.trim().length < 2) nextErrors.city = "Enter the city you want to search.";
    if (country.trim().length < 2) nextErrors.country = "Enter the country or region for this city.";
    if (!validCurrency(currency)) nextErrors.currency = "Choose a currency.";
    if (splitValues(areas).length === 0) nextErrors.areas = "Add at least one preferred area.";
    if (!Number.isFinite(parsedMin) || !Number.isFinite(parsedMax) || parsedMin < 0 || parsedMax <= parsedMin) {
      nextErrors.budget = "Set a maximum budget higher than the minimum.";
    }
    if (bedrooms.length === 0) nextErrors.bedrooms = "Choose at least one home type.";
    if (contactEmail.trim() && !isEmailish(contactEmail.trim())) {
      nextErrors.contactEmail = "Enter an address a landlord could reply to.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const field = Object.keys(nextErrors)[0];
      document.getElementById(`criteria-${field === "budget" ? "budget-max" : field}`)?.focus();
      return;
    }

    setSaving(true);
    try {
      await onSave({
        city: city.trim(),
        country: country.trim(),
        currency,
        budgetMin: parsedMin,
        budgetMax: parsedMax,
        localities: splitValues(areas),
        bedrooms,
        mustHaves: splitValues(mustHaves),
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim() || null,
      });
      onOpenChange(false);
      toast.success(`Search brief saved for ${city.trim()}`);
    } catch (error) {
      setErrors({ form: readableError(error, "Could not save this search brief.") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="criteria-dialog-overlay" />
        <Dialog.Content className="criteria-dialog-content" aria-modal="true" aria-describedby="criteria-dialog-description">
          <div className="criteria-dialog-head">
            <div>
              <span className="eyebrow">Search preferences</span>
              <Dialog.Title>Where do you want to live?</Dialog.Title>
              <Dialog.Description id="criteria-dialog-description">Set your area, budget and must-haves. Sign in after saving to search live sources. Coverage varies by location.</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close search preferences"><X size={18} /></Dialog.Close>
          </div>
          <form className="criteria-form" onSubmit={submit} aria-busy={saving}>
            {errors.form && <div className="form-error" role="alert"><CircleAlert size={15} />{errors.form}</div>}
            <div className="criteria-form-grid">
              <label className="form-field" htmlFor="criteria-country">
                <span>Country or region (required)</span>
                <input id="criteria-country" value={country} onChange={(event) => setCountry(event.target.value)} autoComplete="country-name" maxLength={80} spellCheck={false} aria-invalid={Boolean(errors.country)} aria-describedby={errors.country ? "criteria-country-error" : undefined} placeholder="United Kingdom" />
                {errors.country && <small id="criteria-country-error" className="field-error">{errors.country}</small>}
              </label>
              <label className="form-field" htmlFor="criteria-city">
                <span>City (required)</span>
                <input id="criteria-city" value={city} onChange={(event) => setCity(event.target.value)} maxLength={60} autoComplete="address-level2" spellCheck={false} aria-invalid={Boolean(errors.city)} aria-describedby={errors.city ? "criteria-city-error" : undefined} placeholder="London, Nairobi, Tokyo…" />
                {errors.city && <small id="criteria-city-error" className="field-error">{errors.city}</small>}
              </label>
              <label className="form-field form-field-wide" htmlFor="criteria-areas">
                <span>Preferred areas (required)</span>
                <input id="criteria-areas" value={areas} onChange={(event) => setAreas(event.target.value)} autoComplete="address-level3" spellCheck={false} aria-invalid={Boolean(errors.areas)} aria-describedby={errors.areas ? "criteria-areas-error" : "criteria-areas-hint"} placeholder="Camden, Islington" />
                {errors.areas ? <small id="criteria-areas-error" className="field-error">{errors.areas}</small> : <small id="criteria-areas-hint">Separate areas with commas.</small>}
              </label>
              <label className="form-field form-field-wide" htmlFor="criteria-currency">
                <span>Rent currency (required)</span>
                <select id="criteria-currency" value={currency} onChange={(event) => setCurrency(event.target.value)} aria-describedby="criteria-currency-hint">
                  {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
                <small id="criteria-currency-hint">Enter monthly amounts in this currency. Changing currency does not convert your budget.</small>
              </label>
              <label className="form-field" htmlFor="criteria-budget-min">
                <span>Minimum monthly rent</span>
                <div className="money-input"><span>{currency}</span><input id="criteria-budget-min" value={budgetMin} onChange={(event) => setBudgetMin(event.target.value)} inputMode="decimal" autoComplete="off" spellCheck={false} aria-invalid={Boolean(errors.budget)} aria-describedby={errors.budget ? "criteria-budget-error" : undefined} /></div>
              </label>
              <label className="form-field" htmlFor="criteria-budget-max">
                <span>Maximum monthly rent</span>
                <div className="money-input"><span>{currency}</span><input id="criteria-budget-max" value={budgetMax} onChange={(event) => setBudgetMax(event.target.value)} inputMode="decimal" autoComplete="off" spellCheck={false} aria-invalid={Boolean(errors.budget)} aria-describedby={errors.budget ? "criteria-budget-error" : undefined} /></div>
                {errors.budget && <small id="criteria-budget-error" className="field-error">{errors.budget}</small>}
              </label>
            </div>
            <fieldset className="home-type-fieldset" aria-describedby={errors.bedrooms ? "criteria-bedrooms-error" : undefined}>
              <legend>Home type</legend>
              <div className="home-type-options">
                {homeTypes.map((type) => (
                  <label key={type} className={cn("home-type-option", bedrooms.includes(type) && "is-selected")}>
                    <input type="checkbox" checked={bedrooms.includes(type)} onChange={() => toggleHomeType(type)} />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
              {errors.bedrooms && <small id="criteria-bedrooms-error" className="field-error">{errors.bedrooms}</small>}
            </fieldset>
            <label className="form-field" htmlFor="criteria-must-haves">
              <span>Must-haves <small>optional</small></span>
              <input id="criteria-must-haves" value={mustHaves} onChange={(event) => setMustHaves(event.target.value)} autoComplete="off" placeholder="Bed, cooler, cooking cylinder" />
              <small>Separate with commas. Every must-have needs explicit listing evidence; missing details do not count as a match.</small>
            </label>
            <div className="criteria-form-grid">
              <label className="form-field" htmlFor="criteria-contact-name">
                <span>Your name <small>optional</small></span>
                <input id="criteria-contact-name" value={contactName} onChange={(event) => setContactName(event.target.value)} autoComplete="name" placeholder="Your name" />
              </label>
              <label className="form-field" htmlFor="criteria-contact-email">
                <span>Your reply address <small>optional</small></span>
                <input id="criteria-contact-email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} type="email" inputMode="email" autoComplete="email" spellCheck={false} placeholder="you@example.com" aria-invalid={Boolean(errors.contactEmail)} aria-describedby={errors.contactEmail ? "criteria-contact-email-error" : "criteria-contact-email-hint"} />
                {errors.contactEmail ? <small id="criteria-contact-email-error" className="field-error">{errors.contactEmail}</small> : <small id="criteria-contact-email-hint">Added to your inquiry so a landlord can reply to you directly.</small>}
              </label>
            </div>
            <div className="criteria-form-actions">
              <Dialog.Close className="secondary-action" type="button">Cancel</Dialog.Close>
              <button className="primary-action" type="submit" disabled={saving}>{saving ? "Saving preferences…" : "Save preferences"}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Wordmark() {
  return (
    <span className="wordmark">
      <span className="brand-mark" aria-hidden="true"><House size={17} /><span /></span>
      <span>RentPilot</span>
    </span>
  );
}

function StatusTag({ status }: { status: PursuitStatus }) {
  return <span className={`status-tag status-${status}`}>{statusLabels[status]}</span>;
}

function PursuitRow({ pursuit, selected, onSelect }: { pursuit: Pursuit; selected: boolean; onSelect: (trigger: HTMLButtonElement) => void }) {
  return (
    <li className="pursuit-item">
      <button
        type="button"
        className={cn("pursuit-row pursuit-entry", selected && "is-selected")}
        onClick={(event) => onSelect(event.currentTarget)}
        aria-current={selected ? "true" : undefined}
      >
        <span className="score-cell"><span>{pursuit.score}</span><small>match</small></span>
        <span className="pursuit-copy">
          <span className="pursuit-title-line"><span className="pursuit-title">{pursuit.title}</span><StatusTag status={pursuit.status} /></span>
          {(pursuit.isSample || pursuit.isDemo) && <span className="sample-listing-label">Test listing · not a real vacancy</span>}
          <span className="pursuit-place"><MapPin size={13} aria-hidden="true" />{pursuit.locality} <span aria-hidden="true">·</span> {pursuit.kind}</span>
          <span className="evidence-strip">
            <span>{formatMoney(pursuit.rent, pursuit.currency)}</span>
            <span>{pursuit.contact ? "Contact found" : "Contact missing"}</span>
            <span>Seen {pursuit.seen}</span>
          </span>
        </span>
        <ArrowUpRight className="row-arrow" size={17} aria-hidden="true" />
      </button>
    </li>
  );
}

function PursuitSkeleton() {
  return (
    <ul className="pursuit-list is-loading" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <li className="pursuit-item" key={row}>
          <div className="pursuit-row is-skeleton">
            <span className="score-cell"><span className="shimmer shimmer-score" /></span>
            <span className="pursuit-copy">
              <span className="shimmer shimmer-title" />
              <span className="shimmer shimmer-line" />
              <span className="shimmer shimmer-strip" />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProgressRail({ status }: { status: PursuitStatus }) {
  const isClosed = status === "closed";
  const activeIndex = isClosed ? statusOrder.length - 1 : statusOrder.indexOf(status);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || prefersReducedMotion()) return;
    return runWhenVisible(() => {
      const nodes = rail.querySelectorAll(".rail-node.is-complete");
      if (nodes.length === 0) return;
      animate(nodes, {
        scale: [0.72, 1], opacity: [0.5, 1], delay: stagger(55), duration: 320, ease: "outBack",
      });
    });
  }, [status]);

  return (
    <div
      className={cn("progress-rail", isClosed && "is-closed")}
      ref={railRef}
      role="group"
      aria-label={`Inquiry stage: ${statusLabels[status]}`}
    >
      {statusOrder.map((item, index) => (
        <div className="rail-step" key={item}>
          <span className={cn("rail-node", index <= activeIndex && "is-complete")} aria-hidden="true">{index < activeIndex ? <Check size={11} /> : index + 1}</span>
          <span>{statusLabels[item]}</span>
        </div>
      ))}
      <span className="rail-line" aria-hidden="true" style={{ "--rail-progress": `${(activeIndex / (statusOrder.length - 1)) * 100}%` } as CSSProperties} />
    </div>
  );
}

const deliveryCopy: Record<SendStatus, string> = {
  draft: "Review & send saves your edits first. Nothing is sent until you confirm.",
  ready: "Review the recipient and message, then confirm once to send.",
  sending: "Handed to AgentMail. Delivery status updates here.",
  sent: "AgentMail confirmed this inquiry left the outbox.",
  failed: "AgentMail could not deliver this inquiry.",
};

function EvidencePanel({
  pursuit,
  inDialog,
  agentmailConfigured,
  openaiConfigured,
  onSaveDraft,
  onSend,
  onSyncDelivery,
  onWriteDraft,
}: {
  pursuit: Pursuit;
  inDialog: boolean;
  agentmailConfigured: boolean;
  openaiConfigured: boolean;
  onSaveDraft: (pursuit: Pursuit, subject: string, body: string) => Promise<void>;
  onSend: (pursuit: Pursuit, requestId: string) => Promise<void>;
  onSyncDelivery: (pursuit: Pursuit) => Promise<void>;
  onWriteDraft: (pursuit: Pursuit) => Promise<{ subject: string; body: string; model: string }>;
}) {
  const { isAuthenticated } = useConvexAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [writing, setWriting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [inquiryError, setInquiryError] = useState<string | null>(null);
  const [subject, setSubject] = useState(pursuit.draftSubject);
  const [body, setBody] = useState(pursuit.draftBody);
  const [draftedByModel, setDraftedByModel] = useState(pursuit.draftedByModel);
  const requestIdRef = useRef<string | null>(null);
  const syncedRef = useRef<string | null>(null);

  const delivery = useQuery(
    api.email.deliveryStatus,
    isAuthenticated && pursuit.outboundId && pursuit.threadId
      ? { threadId: pursuit.threadId }
      : "skip",
  );

  const sendState: SendStatus = pursuit.sendStatus ?? "draft";
  const editable = !pursuit.isDemo && sendState !== "sending" && sendState !== "sent";
  const hasModelDraft = Boolean(draftedByModel);
  const hasDraftContent = subject.trim().length >= 3 && body.trim().length >= 20;
  const showDraft = hasDraftContent && (hasModelDraft || Boolean(pursuit.isDemo));
  const canSave = editable && hasModelDraft && Boolean(pursuit.contact) && hasDraftContent;
  const canSend = Boolean(
    agentmailConfigured &&
    pursuit.threadId &&
    pursuit.contact &&
    hasModelDraft &&
    hasDraftContent &&
    !editing &&
    sendState === "ready" &&
    !pursuit.isDemo,
  );

  useEffect(() => {
    if (!delivery || !pursuit.threadId) return;
    const mapped: SendStatus =
      delivery.status === "pending"
        ? "sending"
        : delivery.status === "sent" || delivery.status === "delivered"
          ? "sent"
          : "failed";
    if (mapped === pursuit.sendStatus) return;
    const marker = `${pursuit.threadId}:${mapped}`;
    if (syncedRef.current === marker) return;
    syncedRef.current = marker;
    void onSyncDelivery(pursuit).catch(() => {
      syncedRef.current = null;
    });
  }, [delivery, pursuit, onSyncDelivery]);

  async function writeDraft() {
    setConfirming(false);
    setInquiryError(null);
    setWriting(true);
    try {
      const written = await onWriteDraft(pursuit);
      setSubject(written.subject);
      setBody(written.body);
      setDraftedByModel(written.model);
      setEditing(true);
      toast.success(`${written.model} wrote a draft. Read it before you approve it.`);
    } catch (error) {
      setInquiryError(readableError(error, "OpenAI could not write this draft. Try writing it again."));
    } finally {
      setWriting(false);
    }
  }

  async function saveDraft(review = false) {
    if (!canSave || saving || writing || sending) return;
    setInquiryError(null);
    setSaving(true);
    try {
      await onSaveDraft(pursuit, subject, body);
      setEditing(false);
      setConfirming(review);
      if (!review) toast.success("Draft saved. No email sent.");
    } catch (error) {
      setInquiryError(readableError(error, "Could not save this draft. Your edits are still here; try again."));
    } finally {
      setSaving(false);
    }
  }

  async function sendDraft() {
    if (!canSend || !confirming || sending || saving || writing) return;
    setConfirming(false);
    setInquiryError(null);
    setSending(true);
    try {
      requestIdRef.current ??= crypto.randomUUID();
      await onSend(pursuit, requestIdRef.current);
      toast.success("Approved inquiry queued with AgentMail");
    } catch (error) {
      setInquiryError(readableError(error, "AgentMail could not queue this inquiry. Review the delivery status before retrying."));
    } finally {
      setSending(false);
    }
  }

  const heading = inDialog
    ? <Dialog.Title asChild><h2>{pursuit.title}</h2></Dialog.Title>
    : <h2>{pursuit.title}</h2>;

  const actionNote = pursuit.isDemo
    ? "Demo-safe: synthetic recipients are never emailed."
    : !hasModelDraft && !openaiConfigured
      ? "OpenAI is required. Add its deployment key to generate this inquiry."
      : !hasModelDraft
        ? "Choose Draft inquiry to write a message from the listing details."
    : !pursuit.contact
      ? "No recipient email was found in the source. Open the original listing to contact the lister there; RentPilot will not guess an address."
    : !agentmailConfigured
      ? "AgentMail is waiting for its deployment key."
      : confirming
        ? "Confirming sends this exact saved message through RentPilot’s AgentMail inbox, not your Gmail account."
        : deliveryCopy[sendState];

  return (
    <div className="evidence-panel" data-in-dialog={inDialog || undefined}>
      {inDialog && (
        <div className="mobile-panel-head">
          <Wordmark />
          <Dialog.Close className="icon-button" aria-label="Close pursuit details"><X size={19} /></Dialog.Close>
        </div>
      )}
      <div className="evidence-head">
        <div><span className="eyebrow">Selected match</span>{heading}</div>
        <span className="case-id">{pursuit.caseId}</span>
      </div>
      <ProgressRail status={pursuit.status} />

      <section className="evidence-section fit-section">
        <div className="section-title-row"><h3>Why it ranks here</h3><span className="confidence">{pursuit.confidence}% confidence</span></div>
        <div className="fit-score-lockup"><strong>{pursuit.score}</strong><span>/100 fit</span></div>
        <div className="score-breakdown">
          {pursuit.scoreBreakdown.map((part) => (
            <div className="score-part" key={part.label}>
              <div><span>{part.label}</span><small>{part.note}</small></div>
              <strong>{part.score}<span>/{part.max}</span></strong>
            </div>
          ))}
        </div>
      </section>

      <section className="evidence-section source-section">
        <div className="section-title-row"><h3>Source evidence</h3><ShieldCheck size={16} aria-hidden="true" /></div>
        <div className="source-line"><div className="source-monogram" aria-hidden="true">{pursuit.source.slice(0, 1).toUpperCase()}</div><div><strong>{pursuit.source}</strong><p>{pursuit.sourceNote}</p></div></div>
        <dl className="evidence-facts"><div><dt>Discovered</dt><dd>{pursuit.discovered}</dd></div><div><dt>Contact</dt><dd>{pursuit.contact ?? "Not found"}</dd></div></dl>
        {pursuit.missing.length > 0 && <div className="missing-callout"><CircleAlert size={15} aria-hidden="true" />Missing: {pursuit.missing.join(", ")}</div>}
        {Boolean(pursuit.amenityEvidence?.length) && <div className="amenity-evidence"><h3>Must-have evidence</h3>{pursuit.amenityEvidence?.map((item) => <div key={item.requirement}><strong>{item.requirement}</strong><blockquote>{item.quote}</blockquote></div>)}<small>Quoted from the source, not independently inspected. Confirm inclusions and availability with the lister.</small></div>}
      </section>

      <section className="evidence-section draft-section">
        <div className="section-title-row">
          <div><span className="eyebrow">Draft → Review → Confirm</span><h3>Email the lister</h3></div>
          {editable && (
            <div className="draft-tools">
              <button
                className="write-button"
                type="button"
                onClick={writeDraft}
                disabled={writing || saving || sending || confirming || !openaiConfigured}
                aria-busy={writing}
                title={openaiConfigured ? undefined : "Set AI_GATEWAY_API_KEY on the Convex deployment"}
              >
                <Sparkles size={13} aria-hidden="true" />
                {writing ? "Writing…" : hasModelDraft ? "Rewrite with AI" : "Draft inquiry"}
              </button>
              {hasModelDraft && (
                <button className="text-button" type="button" disabled={writing || saving || sending} onClick={() => { setConfirming(false); setEditing((value) => !value); }}>{editing ? "Preview" : "Edit"}</button>
              )}
            </div>
          )}
        </div>
        {editing ? (
          <div className="draft-editor">
            <label>Subject<input name="subject" maxLength={120} value={subject} disabled={saving || writing || sending} onChange={(event) => setSubject(event.target.value)} /></label>
            <label>Message<textarea name="message" maxLength={5000} rows={5} value={body} disabled={saving || writing || sending} onChange={(event) => setBody(event.target.value)} /></label>
            <button className="secondary-action" type="button" onClick={() => void saveDraft()} disabled={!canSave || saving || writing || sending} aria-busy={saving}>{saving ? "Saving…" : "Save for later"}</button>
          </div>
        ) : showDraft ? (
          <div className="draft-preview"><strong>{subject}</strong><p>{body}</p></div>
        ) : (
          <div className="draft-empty" aria-live="polite">
            <Sparkles size={18} aria-hidden="true" />
            <div><strong>No inquiry yet</strong><p>Choose Draft inquiry, review the message, then confirm when you are ready to send.</p></div>
          </div>
        )}
        {pursuit.outboundId && (
          <p className={cn("delivery-chip", sendState === "failed" && "is-failed")}>
            <span className="delivery-dot" aria-hidden="true" />
            AgentMail delivery: {delivery ? delivery.status : "checking"}
            {delivery?.errorMessage ? `: ${delivery.errorMessage}` : ""}
          </p>
        )}
        {pursuit.lastReplySummary && (
          <div className="reply-card">
            <div className="reply-card-head">
              <span><Mail size={14} aria-hidden="true" />Landlord reply</span>
              {pursuit.lastReplyAt && <time>{pursuit.lastReplyAt}</time>}
            </div>
            <strong>{pursuit.lastReplyFrom ?? "Reply received"}</strong>
            <p>{pursuit.lastReplySummary}</p>
          </div>
        )}
        <p className="inquiry-recipient"><strong>To:</strong> {pursuit.contact ?? "No email listed"}{pursuit.isSample && <span> · Controlled sample contact, not a real rental</span>}</p>
        {inquiryError && <p className="field-error" role="alert">{inquiryError}</p>}
        {confirming && <div className="send-review" role="status"><strong>Ready to send to {pursuit.contact}?</strong><p>The message above is saved. Confirm only after checking the recipient, rent and amenities. Nothing has been sent yet.</p><button className="secondary-action" type="button" onClick={() => { setConfirming(false); setEditing(true); }}>Back to editing</button></div>}
        <button
          className={cn("send-action", confirming && "is-confirming")}
          type="button"
          disabled={confirming ? !canSend || sending || saving || writing : !canSave || !agentmailConfigured || saving || sending || writing}
          aria-busy={sending || saving}
          onClick={confirming ? sendDraft : () => void saveDraft(true)}
        >
          <Send size={16} aria-hidden="true" />
          {sending ? "Queueing…" : saving ? "Saving for review…" : sendState === "sent" ? "Inquiry sent" : sendState === "sending" ? "Sending inquiry…" : confirming ? "Confirm & send email" : "Review & send"}
        </button>
        <p className="action-note"><ShieldCheck size={13} aria-hidden="true" />{actionNote}</p>
      </section>
    </div>
  );
}

function EmptyEvidencePanel({ city, onEditCriteria }: { city: string; onEditCriteria: () => void }) {
  return (
    <div className="empty-evidence-panel">
      <div className="empty-evidence-mark" aria-hidden="true"><MapPin size={20} /></div>
      <span className="eyebrow">Listing details</span>
      <h2>Select a match to see its details</h2>
      <p>Matches in {city} will show the source details, missing information and contact options here.</p>
      <button className="secondary-action" type="button" onClick={onEditCriteria}><SlidersHorizontal size={15} aria-hidden="true" />Edit preferences</button>
    </div>
  );
}

export function RentPilotCockpit() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const backendCriteria = useQuery(api.workspace.getCriteria, sessionId ? { sessionId } : "skip");
  const backendPursuits = useQuery(api.pursuits.list, sessionId ? { sessionId } : "skip");
  const backendSources = useQuery(api.workspace.listSources);
  const backendActivity = useQuery(api.workspace.listActivity, sessionId ? { sessionId } : "skip");
  const integrationStatus = useQuery(api.workspace.integrationStatus);
  const viewer = useQuery(api.workspace.viewer);
  const saveCriteria = useMutation(api.workspace.saveCriteria);
  const updateDraft = useMutation(api.pursuits.updateDraft);
  const sendApprovedDraft = useMutation(api.email.sendApprovedDraft);
  const syncDeliveryState = useMutation(api.email.syncDeliveryState);
  const writeInquiry = useAction(api.drafting.writeInquiry);
  const sweepSampleSource = useAction(api.discovery.sweepSampleSource);
  const searchWeb = useAction(api.webSearch.search);
  const latestSearch = useQuery(api.webSearch.latest, sessionId ? { sessionId } : "skip");
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [webSearchError, setWebSearchError] = useState<string | null>(null);
  const claimAnonymousSession = useMutation(api.workspace.claimAnonymousSession);
  const { signOut } = useAuthActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | PursuitStatus>("all");
  const [query, setQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const restoreIdentity = viewer && sessionId ? `${viewer.email ?? "account"}:${sessionId}` : null;
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const isCompact = useMediaQuery(COMPACT_QUERY);
  const activeCriteria: SearchCriteria = backendCriteria ?? defaultCriteria;
  const cityLabel = activeCriteria.city || "your chosen city";
  const hasSearch = Boolean(backendCriteria);
  const loadingPursuits = backendPursuits === undefined;

  useEffect(() => {
    const storageKey = "rentpilot-search-session";
    let existing: string | null = null;
    try {
      existing = window.localStorage.getItem(storageKey);
    } catch {
      existing = null;
    }
    const nextSessionId = existing ?? crypto.randomUUID();
    if (!existing) {
      try {
        window.localStorage.setItem(storageKey, nextSessionId);
      } catch {
        // A private-mode browser still gets a working in-memory session.
      }
    }
    const timer = window.setTimeout(() => setSessionId(nextSessionId), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // signIn() resolves when tokens are stored, before the WebSocket auth
  // handshake completes. A non-null viewer is the server's acknowledgement.
  // The mutation is idempotent, so reload also recovers a previously failed claim.
  useEffect(() => {
    if (!restoreIdentity || !sessionId) return;
    let active = true;
    void claimAnonymousSession({ sessionId }).then((moved) => {
      if (!active) return;
      setRestoreError(null);
      if (moved.criteria || moved.listings) toast.success("Your saved search now follows your account.");
    }).catch((error) => {
      if (active) setRestoreError(readableError(error, "Your anonymous search could not be restored. It has not been deleted."));
    });
    return () => { active = false; };
  }, [restoreIdentity, sessionId, restoreAttempt, claimAnonymousSession]);

  const pursuits = useMemo<Pursuit[]>(() => {
    if (!backendPursuits) return [];
    return backendPursuits.map((item) => ({
      id: item._id,
      caseId: `RP-${item.externalListingId?.replace("demo-", "D0") ?? item._id.slice(-4).toUpperCase()}`,
      listingId: item._id,
      threadId: item.thread?._id,
      outboundId: item.thread?.agentmailOutboundId ?? null,
      title: item.title,
      locality: item.locality,
      rent: item.rent,
      currency: item.currency ?? "INR",
      kind: item.bedrooms,
      score: item.score ?? 0,
      confidence: item.scoreConfidence ?? 0,
      status: item.status,
      source: item.sourceName,
      sourceNote: item.isDemo
        ? "Synthetic record from Convex, used for the workflow demonstration"
        : item.isSample
          ? "Sample evidence fetched with Firecrawl from RentPilot's permitted source"
        : `Evidence retained from ${item.sourceDomain}`,
      discovered: new Date(item.discoveredAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      seen: new Date(item.lastSeenAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      contact: item.contactEmail,
      missing: item.missingFields,
      amenityEvidence: item.amenityEvidence,
      scoreBreakdown: item.scoreBreakdown.map((part) => ({
        label: part.label,
        score: part.value,
        max: part.label === "Freshness" ? 15 : part.label === "Evidence" ? 25 : 30,
        note: part.note,
      })),
      draftSubject:
        item.isDemo || item.thread?.draftedByModel ? (item.thread?.draftSubject ?? "") : "",
      draftBody:
        item.isDemo || item.thread?.draftedByModel ? (item.thread?.draftBody ?? "") : "",
      draftedByModel: item.thread?.draftedByModel ?? null,
      sendStatus: item.thread?.sendStatus,
      lastReplySummary: item.thread?.lastReplySummary ?? null,
      lastReplyFrom: item.thread?.lastReplyFrom ?? null,
      lastReplyAt: item.thread?.lastReplyAt
        ? new Date(item.thread.lastReplyAt).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
      isDemo: item.isDemo,
      isSample: item.isSample,
    }));
  }, [backendPursuits]);

  const visiblePursuits = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return pursuits.filter((pursuit) => {
      const matchesStatus = statusFilter === "all" || pursuit.status === statusFilter;
      const matchesQuery = !normalized || `${pursuit.title} ${pursuit.locality} ${pursuit.kind}`.toLowerCase().includes(normalized);
      return matchesStatus && matchesQuery;
    });
  }, [pursuits, query, statusFilter]);

  const selected =
    pursuits.find((pursuit) => pursuit.id === selectedId) ?? visiblePursuits[0] ?? pursuits[0] ?? null;

  const visibleActivity = useMemo(
    () =>
      (backendActivity ?? []).map((item) => ({
        id: item._id as string,
        time: new Date(item.createdAt).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        text: item.message,
        meta: item.isDemo
          ? "Convex demo evidence"
          : item.type === "system"
            ? "Source policy trail"
            : `Live ${item.type} event`,
      })),
    [backendActivity],
  );

  const citySources = useMemo(
    () =>
      (backendSources ?? []).filter((source) =>
        source.cities?.some(
          (city) =>
            city === "Any city" ||
            city.toLowerCase() === activeCriteria.city.toLowerCase(),
        ),
      ),
    [activeCriteria.city, backendSources],
  );

  useEffect(() => {
    const list = listRef.current;
    if (!list || prefersReducedMotion()) return;
    return runWhenVisible(() => {
      const rows = list.querySelectorAll(".pursuit-entry");
      if (rows.length === 0) return;
      animate(rows, {
        opacity: [0, 1], y: [10, 0], delay: stagger(45), duration: 360, ease: "outQuad",
      });
    });
  }, [statusFilter, query, pursuits]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMobileMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileMenuOpen]);

  function choosePursuit(id: string, trigger: HTMLButtonElement) {
    detailTriggerRef.current = trigger;
    setSelectedId(id);
    setDetailOpen(true);
  }

  /** Radix restores focus to whatever was focused at mount, which is the body
   *  when the panel is opened by a mouse click. Put it back on the row. */
  function closeDetail(open: boolean) {
    setDetailOpen(open);
    if (open) return;
    const trigger = detailTriggerRef.current;
    if (!trigger) return;
    window.setTimeout(() => {
      if (trigger.isConnected) trigger.focus();
    }, 0);
  }

  async function savePursuitDraft(pursuit: Pursuit, subject: string, body: string) {
    if (!pursuit.threadId) throw new Error("This pursuit has no inquiry thread yet.");
    await updateDraft({ threadId: pursuit.threadId, sessionId: sessionId ?? undefined, subject, body });
  }

  async function sendPursuitDraft(pursuit: Pursuit, requestId: string) {
    if (!pursuit.threadId) throw new Error("This pursuit has no inquiry thread yet.");
    if (pursuit.isDemo) throw new Error("Synthetic demo recipients cannot be emailed.");
    await sendApprovedDraft({ threadId: pursuit.threadId, requestId });
  }

  const syncPursuitDelivery = useCallback(
    async (pursuit: Pursuit) => {
      if (!pursuit.threadId) return;
      await syncDeliveryState({ threadId: pursuit.threadId });
    },
    [syncDeliveryState],
  );

  async function writePursuitDraft(pursuit: Pursuit) {
    if (!pursuit.listingId) throw new Error("This pursuit is not saved in Convex yet.");
    if (!viewer) {
      setSignInOpen(true);
      throw new Error("Sign in before using OpenAI to write a live inquiry.");
    }
    if (pursuit.isDemo) {
      throw new Error("Shared demo pursuits are read-only. Run a source sweep first.");
    }
    return await writeInquiry({ listingId: pursuit.listingId });
  }

  async function claimSessionAfterSignIn() {
    toast.info("Signed in. Restoring your saved search…");
  }

  async function saveSearchBrief(criteria: SearchCriteria) {
    if (!sessionId) throw new Error("Your search session is still loading. Try again in a moment.");
    await saveCriteria({
      sessionId,
      ...criteria,
      contactEmail: criteria.contactEmail ?? undefined,
    });
    setDetailOpen(false);
    setSelectedId(null);
    setQuery("");
    setStatusFilter("all");
  }

  async function runSourceSweep() {
    if (!hasSearch) {
      setCriteriaOpen(true);
      return;
    }
    if (!viewer) {
      setSignInOpen(true);
      toast.info("Sign in to run the live Firecrawl sweep.");
      return;
    }
    if (!integrationStatus?.firecrawlConfigured) {
      toast.info("Firecrawl is waiting for its Convex deployment key.");
      return;
    }
    setSweeping(true);
    try {
      const result = await sweepSampleSource({
        city: activeCriteria.city,
        areas: activeCriteria.localities,
      });
      if (result.failed === result.attempted) {
        toast.error(readableError(new Error(result.firstError ?? ""), "Firecrawl could not reach the source."));
      } else {
        toast.success(
          `Firecrawl read ${result.attempted - result.failed} of ${result.attempted} pages in ${Math.round(result.durationMs / 100) / 10}s. ${result.inserted} new, ${result.updated} refreshed.${integrationStatus.sampleContactConfigured ? "" : " Add SAMPLE_SOURCE_CONTACT to test delivery."}`,
        );
      }
    } catch (error) {
      toast.error(readableError(error, "The sweep could not run."));
    } finally {
      setSweeping(false);
    }
  }

  async function findLiveLeads() {
    if (!hasSearch) { setCriteriaOpen(true); return; }
    if (!viewer) { setSignInOpen(true); toast.info("Sign in to search live sources. Your brief will be kept."); return; }
    setSearchingWeb(true);
    setWebSearchError(null);
    try {
      const result = await searchWeb({});
      toast.success(`${result.results.length} web leads found. Only evidence-backed matches enter your pursuit queue.`);
    } catch (error) {
      setWebSearchError(readableError(error, "Live search failed. Your brief is safe; try again."));
    } finally { setSearchingWeb(false); }
  }


  const panel = selected ? (
    <EvidencePanel
      key={selected.id}
      pursuit={selected}
      inDialog={isCompact}
      agentmailConfigured={integrationStatus?.agentmailConfigured ?? false}
      openaiConfigured={integrationStatus?.openaiConfigured ?? false}
      onSaveDraft={savePursuitDraft}
      onSend={sendPursuitDraft}
      onSyncDelivery={syncPursuitDelivery}
      onWriteDraft={writePursuitDraft}
    />
  ) : (
    <EmptyEvidencePanel city={cityLabel} onEditCriteria={() => setCriteriaOpen(true)} />
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#pursuits">Skip to matches</a>
      <header className="topbar">
        <Wordmark />
        <nav className="desktop-nav" aria-label="Primary"><a className="is-active" href="#pursuits">Matches</a><a href="#activity">Activity</a><a href="#sources">Sources</a></nav>
        <div className="topbar-actions">
          <span className="demo-badge"><span aria-hidden="true" />{integrationStatus?.firecrawlConfigured ? "Convex + Firecrawl live" : backendPursuits ? "Convex live" : "Connecting"}</span>
          {viewer ? (
            <span className="account-chip">
              <span className="account-email" title={viewer.email ?? undefined}>{viewer.email ?? "Signed in"}</span>
              <button className="quiet-icon" type="button" aria-label="Sign out" onClick={() => { void signOut(); }}><LogOut size={14} aria-hidden="true" /></button>
            </span>
          ) : (
            <button className="save-search-button" type="button" onClick={() => setSignInOpen(true)}>Sign in</button>
          )}
          <button className="icon-button" type="button" aria-label="Edit search preferences" onClick={() => setCriteriaOpen(true)}><Settings2 size={17} aria-hidden="true" /></button>
          <button className="icon-button mobile-menu-button" type="button" aria-label="Menu" aria-expanded={mobileMenuOpen} aria-controls="mobile-menu" onClick={() => setMobileMenuOpen((value) => !value)}><Menu size={19} aria-hidden="true" /></button>
        </div>
        {mobileMenuOpen && (
          <nav className="mobile-menu" id="mobile-menu" aria-label="Mobile" ref={menuRef}>
            <a href="#pursuits" onClick={() => setMobileMenuOpen(false)}>Matches</a>
            <a href="#activity" onClick={() => setMobileMenuOpen(false)}>Activity</a>
            <button type="button" onClick={() => { setCriteriaOpen(true); setMobileMenuOpen(false); }}><SlidersHorizontal size={15} aria-hidden="true" />Search preferences</button>
          </nav>
        )}
      </header>

      <div className="workspace-grid">
        <aside className="context-rail" aria-label="Search criteria and source status">
          <section className="context-section search-brief">
            <span className="eyebrow">{hasSearch ? `Active search · ${cityLabel}` : "Start your room search"}</span><p className="rail-lede">{hasSearch ? `Your requirements for rooms in ${cityLabel}, ${activeCriteria.country}.` : "Choose where you want to live and how much you want to spend."}</p>
            <button className="secondary-action full-width" type="button" onClick={() => setCriteriaOpen(true)}><SlidersHorizontal size={15} aria-hidden="true" />{hasSearch ? "Change location and budget" : "Choose your location"}</button>
          </section>
          <section className="context-section criteria-list">
            <h2>Search preferences</h2>
            {sessionId && backendCriteria === undefined ? (
              <div className="criteria-skeleton" aria-label="Loading search brief"><span /><span /><span /></div>
            ) : (
              <>
                <dl><div><dt>Location</dt><dd>{hasSearch ? `${cityLabel}, ${activeCriteria.country}` : "Not chosen yet"}</dd></div><div><dt>Budget</dt><dd>{hasSearch ? `${formatMoney(activeCriteria.budgetMin, activeCriteria.currency, true)} to ${formatMoney(activeCriteria.budgetMax, activeCriteria.currency, true)}` : "Choose your currency and range"}</dd></div><div><dt>Areas</dt><dd>{activeCriteria.localities.join(", ") || "Choose your neighbourhoods"}</dd></div><div><dt>Looking for</dt><dd>{activeCriteria.bedrooms.join(" or ")}</dd></div></dl>
                <div className="must-have-list">{activeCriteria.mustHaves.map((item) => <span key={item}><Check size={12} aria-hidden="true" />{item}</span>)}</div>
              </>
            )}
          </section>
          <section className="context-section" id="sources">
            <div className="section-title-row"><h2>Source health</h2></div>
            <p className="rail-empty">Sample sources test the workflow. They do not establish live coverage in {cityLabel}.</p>
            {citySources.map((source) => (
              <div
                className={cn("source-health-row", source.permissionStatus !== "approved" && "is-muted")}
                key={source._id}
              >
                <span className={cn("health-dot", source.permissionStatus === "approved" && "is-live")} aria-hidden="true" />
                <div>
                  <strong>{source.name}</strong>
                  <small>{source.isDemo ? "Convex demo records" : source.notes}</small>
                </div>
                <span className="health-label">
                  {source.permissionStatus === "approved"
                    ? "Ready"
                    : source.permissionStatus === "blocked"
                      ? "Blocked"
                      : "Waiting"}
                </span>
              </div>
            ))}
            {!backendSources && (
              <div className="source-health-row is-muted"><span className="health-dot" aria-hidden="true" /><div><strong>Convex sources</strong><small>Connecting</small></div><span className="health-label">Sync</span></div>
            )}
            {backendSources && citySources.length === 0 && (
              <div className="source-health-row is-muted"><span className="health-dot" aria-hidden="true" /><div><strong>No local source yet</strong><small>Real listings need a permitted source for {cityLabel}</small></div><span className="health-label">Needed</span></div>
            )}
          </section>
          <section className="context-section mini-activity">
            <div className="section-title-row"><h2>Today</h2><Activity size={14} aria-hidden="true" /></div>
            {visibleActivity.length > 0 ? (
              visibleActivity.slice(0, 3).map((item) => <div className="activity-row" key={item.id}><time>{item.time}</time><div><strong>{item.text}</strong><small>{item.meta}</small></div></div>)
            ) : (
              <p className="rail-empty">{backendActivity ? "Nothing recorded yet today." : "Loading activity…"}</p>
            )}
          </section>
        </aside>

        <main className="pursuit-workbench" id="pursuits" tabIndex={-1}>
          {restoreError && <div className="form-error" role="alert"><p>{restoreError}</p><button className="secondary-action" type="button" onClick={() => { setRestoreError(null); setRestoreAttempt((attempt) => attempt + 1); }}>Retry restoring search</button></div>}
          <div className="workbench-head">
            <div>
              <span className="eyebrow">Your room search</span>
              <h1>{hasSearch ? `Your ${cityLabel} matches` : "Where do you want to live?"}</h1>
              <p aria-live="polite">
                {loadingPursuits
                  ? "Loading your matches…"
                  : visiblePursuits.length === 0
                    ? hasSearch ? "Review web leads below and check which listings meet your requirements." : "Choose your area and budget, then sign in to search live sources."
                    : `${visiblePursuits.length} ${visiblePursuits.length === 1 ? "option" : "options"} with a clear next step`}
              </p>
            </div>
            <button className="primary-action" type="button" onClick={findLiveLeads} disabled={searchingWeb || sweeping || backendCriteria === undefined} aria-busy={searchingWeb}>
              <Radar size={16} aria-hidden="true" />
              <span className="action-label">{searchingWeb ? "Searching the web…" : hasSearch ? "Find live leads" : "Choose your location"}</span>
            </button>
          </div>
          {hasSearch && <section className="live-leads" aria-labelledby="live-leads-title" aria-busy={searchingWeb}>
            <div className="section-title-row"><h2 id="live-leads-title">Web leads <span className="eyebrow">Links to investigate, not verified rooms</span></h2><Search size={16} aria-hidden="true" /></div>
            <p>Open these links to investigate each room. A listing enters your matches only when an approved source supports every requirement.</p>
            <details className="verification-guide"><summary>How listing checks and email work</summary><dl><div><dt>Unverified lead</dt><dd>A search snippet only. Open the source to check details or contact the lister there. RentPilot does not guess email addresses.</dd></div><div><dt>Evidence-backed match</dt><dd>A permitted page supports your budget, area, room type and every must-have. Landlord identity, safety and current availability remain unverified.</dd></div><div><dt>Email-ready</dt><dd>A match also needs a source-listed email and your sign-in. Choose Draft inquiry, edit if needed, then Review &amp; send and Confirm &amp; send email. Missing contact details keep email disabled.</dd></div></dl><p>RentPilot has not inspected these properties. Confirm availability and inclusions with the lister. Sample listings remain fictional.</p></details>
            <p className="lead-location-note">Locality matching: {activeCriteria.localities.join(" / ")}. No distance radius is verified.</p>
            {searchingWeb && <p role="status">Finding source links and checking permitted pages…</p>}
            {webSearchError && <div role="alert" className="field-error"><p>{webSearchError}</p><button className="secondary-action" type="button" onClick={findLiveLeads} disabled={searchingWeb}>Retry live search</button></div>}
            {latestSearch ? <>
              <details><summary>Search query and time</summary><p>{latestSearch.query}</p><time dateTime={new Date(latestSearch.searchedAt).toISOString()}>{new Date(latestSearch.searchedAt).toLocaleString()}</time></details>
              {latestSearch.results.length ? <ul className="web-lead-list">{latestSearch.results.map((lead) => <li key={lead.url}>
                <span className="eyebrow">{lead.status === "matched" ? "Evidence-backed match" : lead.status === "excluded" ? "Not a match / check incomplete" : lead.status === "blocked" ? "Source blocked · unverified" : "Unverified lead"} · {new URL(lead.url).hostname}</span>
                <h3><a href={lead.url} target="_blank" rel="noopener noreferrer">{lead.title}<ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only"> (opens source in a new tab)</span></a></h3>
                <p>{lead.description}</p><small>{lead.note}</small>
              </li>)}</ul> : <p>No web leads found for this brief. Try another locality or edit your requirements; nothing was substituted.</p>}
            </> : !searchingWeb && <p>No live search yet. Choose “Find live leads” to start.</p>}
          </section>}
          <div className="toolbar">
            <label className="search-box"><Search size={16} aria-hidden="true" /><span className="sr-only">Filter matches</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter matches by area or title" /></label>
            <div className="filter-wrap"><Filter size={14} aria-hidden="true" /><label htmlFor="status-filter" className="sr-only">Filter by status</label><select id="status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | PursuitStatus)}><option value="all">All stages</option>{statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}<option value="closed">Closed</option></select><ChevronDown size={14} aria-hidden="true" /></div>
          </div>
          <div className="list-heading" aria-hidden="true"><span>Fit</span><span>Match and listing details</span><span>Open</span></div>
          <div ref={listRef}>
            {loadingPursuits ? (
              <PursuitSkeleton />
            ) : visiblePursuits.length > 0 ? (
              <ul className="pursuit-list">
                {visiblePursuits.map((pursuit) => (
                  <PursuitRow key={pursuit.id} pursuit={pursuit} selected={pursuit.id === selected?.id} onSelect={(trigger) => choosePursuit(pursuit.id, trigger)} />
                ))}
              </ul>
            ) : query || statusFilter !== "all" ? (
              <div className="empty-state"><Search size={22} aria-hidden="true" /><h3>No matches with these filters</h3><p>Clear the text filter or choose another stage.</p><button type="button" onClick={() => { setQuery(""); setStatusFilter("all"); }}>Reset filters</button></div>
            ) : (
              <div className="empty-state"><MapPin size={22} aria-hidden="true" /><h3>{hasSearch ? `No evidence-backed matches in ${cityLabel} yet` : "Start with your area and budget"}</h3><p>{hasSearch ? "Matches need source evidence for your rent range, area, room type and every must-have. You can still investigate the web leads above or adjust your preferences." : "Add your preferred areas, rent range and must-haves. You can choose any city; available sources vary by location."}</p><button type="button" onClick={() => setCriteriaOpen(true)}>Edit location and requirements</button>{hasSearch && <button type="button" onClick={runSourceSweep} disabled={sweeping || searchingWeb}>{sweeping ? "Checking sample…" : "Test fictional sample pages (same hard filters)"}</button>}</div>
            )}
          </div>
          <section className="decision-note"><Sparkles size={17} aria-hidden="true" /><div><strong>Check the details before you contact a lister</strong><p>Each match shows its score breakdown and missing contact details. Confirm availability, inclusions and any extra charges with the lister.</p></div></section>
          <section className="mobile-activity" id="activity" aria-label="Recent activity">
            <div className="section-title-row"><h2>Recent activity</h2><Clock3 size={15} aria-hidden="true" /></div>
            {visibleActivity.length > 0 ? (
              visibleActivity.map((item) => <div className="activity-row" key={item.id}><time>{item.time}</time><div><strong>{item.text}</strong><small>{item.meta}</small></div></div>)
            ) : (
              <p className="rail-empty">{backendActivity ? "Nothing recorded yet." : "Loading activity…"}</p>
            )}
          </section>
        </main>

        {isCompact ? (
          <Dialog.Root open={detailOpen} onOpenChange={closeDetail}>
            <Dialog.Portal>
              <Dialog.Overlay className="detail-overlay" />
              <Dialog.Content
                className="detail-dialog"
                aria-modal="true"
                aria-describedby={undefined}
                onCloseAutoFocus={(event) => {
                  const trigger = detailTriggerRef.current;
                  if (!trigger?.isConnected) return;
                  event.preventDefault();
                  trigger.focus();
                }}
              >
                {selected ? panel : <><Dialog.Title className="sr-only">No pursuit selected</Dialog.Title>{panel}</>}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        ) : (
          <div className="detail-shell">{panel}</div>
        )}
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile primary">
        <a href="#pursuits" className="is-active"><Inbox size={18} aria-hidden="true" /><span>Matches</span></a>
        <a href="#activity"><Activity size={18} aria-hidden="true" /><span>Activity</span></a>
        <button type="button" onClick={() => toast.info(integrationStatus?.agentmailConfigured ? "AgentMail delivery is connected." : "AgentMail inbox is ready and waiting for its deployment key.")}><Mail size={18} aria-hidden="true" /><span>Inbox</span></button>
      </nav>
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} onSignedIn={claimSessionAfterSignIn} />
      <CriteriaDialog key={backendCriteria?._id ?? "default-criteria"} open={criteriaOpen} onOpenChange={setCriteriaOpen} criteria={activeCriteria} onSave={saveSearchBrief} />
    </div>
  );
}
