"use client";

import { animate, stagger } from "animejs";
import type { OutboundId } from "@agentmail/convex";
import { useMutation, useQuery } from "convex/react";
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
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";

const COMPACT_QUERY = "(max-width: 1050px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type SearchCriteria = {
  city: string;
  budgetMin: number;
  budgetMax: number;
  localities: string[];
  bedrooms: string[];
  mustHaves: string[];
};

const defaultCriteria: SearchCriteria = {
  city: "Bengaluru",
  budgetMin: 18000,
  budgetMax: 32000,
  localities: ["HSR Layout", "Koramangala", "Indiranagar"],
  bedrooms: ["Private room", "1 BHK"],
  mustHaves: ["No brokerage", "Move-in before 15 Sep"],
};

const homeTypes = ["Private room", "1 BHK", "2 BHK", "Shared room"];

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

function splitValues(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function compactCurrency(value: number) {
  return `₹${new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

function formatRent(rent: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rent);
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
  const [areas, setAreas] = useState(criteria.localities.join(", "));
  const [budgetMin, setBudgetMin] = useState(String(criteria.budgetMin));
  const [budgetMax, setBudgetMax] = useState(String(criteria.budgetMax));
  const [bedrooms, setBedrooms] = useState(criteria.bedrooms);
  const [mustHaves, setMustHaves] = useState(criteria.mustHaves.join(", "));
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
    if (splitValues(areas).length === 0) nextErrors.areas = "Add at least one preferred area.";
    if (!Number.isFinite(parsedMin) || !Number.isFinite(parsedMax) || parsedMin < 0 || parsedMax <= parsedMin) {
      nextErrors.budget = "Set a maximum budget higher than the minimum.";
    }
    if (bedrooms.length === 0) nextErrors.bedrooms = "Choose at least one home type.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await onSave({
        city: city.trim(),
        budgetMin: parsedMin,
        budgetMax: parsedMax,
        localities: splitValues(areas),
        bedrooms,
        mustHaves: splitValues(mustHaves),
      });
      onOpenChange(false);
      toast.success(`Search brief saved for ${city.trim()}`);
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : "Could not save this search brief." });
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
              <span className="eyebrow">Personal search profile</span>
              <Dialog.Title>Choose your city and areas</Dialog.Title>
              <Dialog.Description id="criteria-dialog-description">RentPilot will rank permitted listings against this brief.</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close search preferences"><X size={18} /></Dialog.Close>
          </div>
          <form className="criteria-form" onSubmit={submit} aria-busy={saving}>
            {errors.form && <div className="form-error" role="alert"><CircleAlert size={15} />{errors.form}</div>}
            <div className="criteria-form-grid">
              <label className="form-field" htmlFor="criteria-city">
                <span>City</span>
                <input id="criteria-city" value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" spellCheck={false} aria-invalid={Boolean(errors.city)} aria-describedby={errors.city ? "criteria-city-error" : undefined} placeholder="Pune" />
                {errors.city && <small id="criteria-city-error" className="field-error">{errors.city}</small>}
              </label>
              <label className="form-field form-field-wide" htmlFor="criteria-areas">
                <span>Preferred areas</span>
                <input id="criteria-areas" value={areas} onChange={(event) => setAreas(event.target.value)} autoComplete="address-level3" spellCheck={false} aria-invalid={Boolean(errors.areas)} aria-describedby={errors.areas ? "criteria-areas-error" : "criteria-areas-hint"} placeholder="Baner, Kothrud, Viman Nagar" />
                {errors.areas ? <small id="criteria-areas-error" className="field-error">{errors.areas}</small> : <small id="criteria-areas-hint">Separate areas with commas.</small>}
              </label>
              <label className="form-field" htmlFor="criteria-budget-min">
                <span>Minimum monthly rent</span>
                <div className="money-input"><span>₹</span><input id="criteria-budget-min" value={budgetMin} onChange={(event) => setBudgetMin(event.target.value)} inputMode="numeric" autoComplete="off" spellCheck={false} aria-invalid={Boolean(errors.budget)} aria-describedby={errors.budget ? "criteria-budget-error" : undefined} /></div>
              </label>
              <label className="form-field" htmlFor="criteria-budget-max">
                <span>Maximum monthly rent</span>
                <div className="money-input"><span>₹</span><input id="criteria-budget-max" value={budgetMax} onChange={(event) => setBudgetMax(event.target.value)} inputMode="numeric" autoComplete="off" spellCheck={false} aria-invalid={Boolean(errors.budget)} aria-describedby={errors.budget ? "criteria-budget-error" : undefined} /></div>
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
              <input id="criteria-must-haves" value={mustHaves} onChange={(event) => setMustHaves(event.target.value)} autoComplete="off" placeholder="No brokerage, furnished, near metro" />
              <small>These improve ranking and explain why a pursuit fits.</small>
            </label>
            <div className="criteria-form-actions">
              <Dialog.Close className="secondary-action" type="button">Cancel</Dialog.Close>
              <button className="primary-action" type="submit" disabled={saving}>{saving ? "Saving brief…" : "Save search brief"}</button>
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
          <span className="pursuit-place"><MapPin size={13} aria-hidden="true" />{pursuit.locality} <span aria-hidden="true">·</span> {pursuit.kind}</span>
          <span className="evidence-strip">
            <span>{formatRent(pursuit.rent)}</span>
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
      aria-label={`Pursuit stage: ${statusLabels[status]}`}
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
  draft: "Save the draft before approving delivery.",
  ready: "Your click is the final human approval for this email.",
  sending: "Handed to AgentMail. Delivery status updates here.",
  sent: "AgentMail confirmed this inquiry left the outbox.",
  failed: "AgentMail could not deliver this inquiry.",
};

function EvidencePanel({
  pursuit,
  inDialog,
  agentmailConfigured,
  onSaveDraft,
  onSend,
  onSyncDelivery,
}: {
  pursuit: Pursuit;
  inDialog: boolean;
  agentmailConfigured: boolean;
  onSaveDraft: (pursuit: Pursuit, subject: string, body: string) => Promise<void>;
  onSend: (pursuit: Pursuit, requestId: string) => Promise<void>;
  onSyncDelivery: (pursuit: Pursuit) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [subject, setSubject] = useState(pursuit.draftSubject);
  const [body, setBody] = useState(pursuit.draftBody);
  const requestIdRef = useRef<string | null>(null);
  const syncedRef = useRef<string | null>(null);

  const delivery = useQuery(
    api.email.deliveryStatus,
    pursuit.outboundId ? { outboundId: pursuit.outboundId as OutboundId } : "skip",
  );

  const sendState: SendStatus = pursuit.sendStatus ?? "draft";
  const editable = sendState !== "sending" && sendState !== "sent";
  const canSave = editable && Boolean(pursuit.contact) && subject.trim().length > 3 && body.trim().length > 20;
  const canSend = Boolean(
    agentmailConfigured &&
    pursuit.threadId &&
    pursuit.contact &&
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

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 8000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  async function saveDraft() {
    if (!canSave) return toast.error("Add a recipient and complete the draft first.");
    setSaving(true);
    try {
      await onSaveDraft(pursuit, subject, body);
      setEditing(false);
      toast.success("Draft saved in Convex and ready for approval");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this draft.");
    } finally {
      setSaving(false);
    }
  }

  async function sendDraft() {
    if (!canSend) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setSending(true);
    try {
      requestIdRef.current ??= crypto.randomUUID();
      await onSend(pursuit, requestIdRef.current);
      toast.success("Approved inquiry queued with AgentMail");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AgentMail could not queue this inquiry.");
    } finally {
      setSending(false);
    }
  }

  const heading = inDialog
    ? <Dialog.Title asChild><h2>{pursuit.title}</h2></Dialog.Title>
    : <h2>{pursuit.title}</h2>;

  const actionNote = pursuit.isDemo
    ? "Demo-safe: synthetic recipients are never emailed."
    : !agentmailConfigured
      ? "AgentMail is waiting for its deployment key."
      : confirming
        ? `This sends a real email to ${pursuit.contact}. Click again to confirm.`
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
        <div><span className="eyebrow">Selected pursuit</span>{heading}</div>
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
      </section>

      <section className="evidence-section draft-section">
        <div className="section-title-row">
          <div><span className="eyebrow">Human approval required</span><h3>Inquiry draft</h3></div>
          {editable && (
            <button className="text-button" type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel" : "Edit"}</button>
          )}
        </div>
        {editing ? (
          <div className="draft-editor">
            <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
            <label>Message<textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} /></label>
            <button className="secondary-action" type="button" onClick={saveDraft} disabled={saving}>{saving ? "Saving…" : "Save draft"}</button>
          </div>
        ) : (
          <div className="draft-preview"><strong>{subject}</strong><p>{body}</p></div>
        )}
        {pursuit.outboundId && (
          <p className={cn("delivery-chip", sendState === "failed" && "is-failed")}>
            <span className="delivery-dot" aria-hidden="true" />
            AgentMail delivery: {delivery ? delivery.status : "checking"}
            {delivery?.errorMessage ? `: ${delivery.errorMessage}` : ""}
          </p>
        )}
        <button
          className={cn("send-action", confirming && "is-confirming")}
          type="button"
          disabled={!canSend || sending}
          onClick={sendDraft}
        >
          <Send size={16} aria-hidden="true" />
          {sending ? "Queueing…" : confirming ? "Confirm send" : "Send with AgentMail"}
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
      <span className="eyebrow">Evidence desk</span>
      <h2>No pursuit selected</h2>
      <p>New {city} listings will appear here with source evidence, fit reasons and a safe next action.</p>
      <button className="secondary-action" type="button" onClick={onEditCriteria}><SlidersHorizontal size={15} aria-hidden="true" />Edit search brief</button>
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
  const saveCriteria = useMutation(api.workspace.saveCriteria);
  const updateDraft = useMutation(api.pursuits.updateDraft);
  const sendApprovedDraft = useMutation(api.email.sendApprovedDraft);
  const syncDeliveryState = useMutation(api.email.syncDeliveryState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | PursuitStatus>("all");
  const [query, setQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const isCompact = useMediaQuery(COMPACT_QUERY);
  const activeCriteria: SearchCriteria = backendCriteria ?? defaultCriteria;
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
      kind: item.bedrooms,
      score: item.score ?? 0,
      confidence: item.scoreConfidence ?? 0,
      status: item.status,
      source: item.sourceName,
      sourceNote: item.isDemo
        ? "Synthetic record from Convex, used for the workflow demonstration"
        : `Evidence retained from ${item.sourceDomain}`,
      discovered: new Date(item.discoveredAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      seen: new Date(item.lastSeenAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      contact: item.contactEmail,
      missing: item.missingFields,
      scoreBreakdown: item.scoreBreakdown.map((part) => ({
        label: part.label,
        score: part.value,
        max: part.label === "Freshness" ? 15 : part.label === "Evidence" ? 25 : 30,
        note: part.note,
      })),
      draftSubject: item.thread?.draftSubject ?? `Viewing request: ${item.title}`,
      draftBody: item.thread?.draftBody ?? "Please complete this draft before sending.",
      sendStatus: item.thread?.sendStatus,
      isDemo: item.isDemo,
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
        source.cities?.some((city) => city.toLowerCase() === activeCriteria.city.toLowerCase()),
      ),
    [activeCriteria.city, backendSources],
  );
  const sweepReady = citySources.some(
    (source) => source.permissionStatus === "approved" && !source.isDemo,
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
    await sendApprovedDraft({ threadId: pursuit.threadId, sessionId: sessionId ?? undefined, requestId });
  }

  const syncPursuitDelivery = useCallback(
    async (pursuit: Pursuit) => {
      if (!pursuit.threadId) return;
      await syncDeliveryState({ threadId: pursuit.threadId, sessionId: sessionId ?? undefined });
    },
    [sessionId, syncDeliveryState],
  );

  async function saveSearchBrief(criteria: SearchCriteria) {
    if (!sessionId) throw new Error("Your search session is still loading. Try again in a moment.");
    await saveCriteria({ sessionId, ...criteria });
    setDetailOpen(false);
    setSelectedId(null);
    setQuery("");
    setStatusFilter("all");
  }

  function explainSourceSweep() {
    if (!integrationStatus?.firecrawlConfigured) {
      toast.info("Firecrawl is waiting for its Convex deployment key.");
      return;
    }
    toast.info(
      sweepReady
        ? `Firecrawl is ready to sweep approved ${activeCriteria.city} sources against this brief.`
        : `No ${activeCriteria.city} source has granted written permission yet, so no sweep can run.`,
    );
  }

  const panel = selected ? (
    <EvidencePanel
      key={selected.id}
      pursuit={selected}
      inDialog={isCompact}
      agentmailConfigured={integrationStatus?.agentmailConfigured ?? false}
      onSaveDraft={savePursuitDraft}
      onSend={sendPursuitDraft}
      onSyncDelivery={syncPursuitDelivery}
    />
  ) : (
    <EmptyEvidencePanel city={activeCriteria.city} onEditCriteria={() => setCriteriaOpen(true)} />
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#pursuits">Skip to pursuits</a>
      <header className="topbar">
        <Wordmark />
        <nav className="desktop-nav" aria-label="Primary"><a className="is-active" href="#pursuits">Pursuits</a><a href="#activity">Activity</a><a href="#sources">Sources</a></nav>
        <div className="topbar-actions">
          <span className="demo-badge"><span aria-hidden="true" />{integrationStatus?.firecrawlConfigured ? "Convex + Firecrawl live" : backendPursuits ? "Convex live" : "Connecting"}</span>
          <button className="icon-button" type="button" aria-label="Edit search preferences" onClick={() => setCriteriaOpen(true)}><Settings2 size={17} aria-hidden="true" /></button>
          <button className="icon-button mobile-menu-button" type="button" aria-label="Menu" aria-expanded={mobileMenuOpen} aria-controls="mobile-menu" onClick={() => setMobileMenuOpen((value) => !value)}><Menu size={19} aria-hidden="true" /></button>
        </div>
        {mobileMenuOpen && (
          <nav className="mobile-menu" id="mobile-menu" aria-label="Mobile" ref={menuRef}>
            <a href="#pursuits" onClick={() => setMobileMenuOpen(false)}>Pursuits</a>
            <a href="#activity" onClick={() => setMobileMenuOpen(false)}>Activity</a>
            <button type="button" onClick={() => { setCriteriaOpen(true); setMobileMenuOpen(false); }}><SlidersHorizontal size={15} aria-hidden="true" />Search brief</button>
          </nav>
        )}
      </header>

      <div className="workspace-grid">
        <aside className="context-rail" aria-label="Search criteria and source status">
          <section className="context-section search-brief">
            <span className="eyebrow">Active search · {activeCriteria.city}</span><p className="rail-lede">Rooms worth pursuing in {activeCriteria.city}, sorted by personal fit, evidence quality and freshness.</p>
            <button className="secondary-action full-width" type="button" onClick={() => setCriteriaOpen(true)}><SlidersHorizontal size={15} aria-hidden="true" />Refine city and areas</button>
          </section>
          <section className="context-section criteria-list">
            <h2>Search brief</h2>
            {sessionId && backendCriteria === undefined ? (
              <div className="criteria-skeleton" aria-label="Loading search brief"><span /><span /><span /></div>
            ) : (
              <>
                <dl><div><dt>City</dt><dd>{activeCriteria.city}</dd></div><div><dt>Budget</dt><dd>{compactCurrency(activeCriteria.budgetMin)} to {compactCurrency(activeCriteria.budgetMax)}</dd></div><div><dt>Areas</dt><dd>{activeCriteria.localities.join(", ")}</dd></div><div><dt>Looking for</dt><dd>{activeCriteria.bedrooms.join(" or ")}</dd></div></dl>
                <div className="must-have-list">{activeCriteria.mustHaves.map((item) => <span key={item}><Check size={12} aria-hidden="true" />{item}</span>)}</div>
              </>
            )}
          </section>
          <section className="context-section" id="sources">
            <div className="section-title-row"><h2>Source health</h2></div>
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
              <div className="source-health-row is-muted"><span className="health-dot" aria-hidden="true" /><div><strong>No {activeCriteria.city} source yet</strong><small>Add a permitted source before discovery</small></div><span className="health-label">Needed</span></div>
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
          <div className="workbench-head">
            <div>
              <span className="eyebrow">Rental control desk</span>
              <h1>Your {activeCriteria.city} pursuits</h1>
              <p aria-live="polite">
                {loadingPursuits
                  ? "Loading your queue…"
                  : visiblePursuits.length === 0
                    ? "Nothing in this view"
                    : `${visiblePursuits.length} ${visiblePursuits.length === 1 ? "option" : "options"} with a clear next step`}
              </p>
            </div>
            <button className={sweepReady ? "primary-action" : "secondary-action sweep-action"} type="button" onClick={explainSourceSweep}>
              <Radar size={16} aria-hidden="true" />
              <span className="action-label">{sweepReady ? `Run ${activeCriteria.city} sweep` : "Check source readiness"}</span>
            </button>
          </div>
          <div className="toolbar">
            <label className="search-box"><Search size={16} aria-hidden="true" /><span className="sr-only">Search pursuits</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search area or listing" /></label>
            <div className="filter-wrap"><Filter size={14} aria-hidden="true" /><label htmlFor="status-filter" className="sr-only">Filter by status</label><select id="status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | PursuitStatus)}><option value="all">All stages</option>{statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}<option value="closed">Closed</option></select><ChevronDown size={14} aria-hidden="true" /></div>
          </div>
          <div className="list-heading" aria-hidden="true"><span>Fit</span><span>Pursuit and evidence</span><span>Open</span></div>
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
              <div className="empty-state"><Search size={22} aria-hidden="true" /><h3>No pursuits match</h3><p>Clear the search or choose another stage.</p><button type="button" onClick={() => { setQuery(""); setStatusFilter("all"); }}>Reset filters</button></div>
            ) : (
              <div className="empty-state"><MapPin size={22} aria-hidden="true" /><h3>No pursuits in {activeCriteria.city} yet</h3><p>Your search brief is saved. Nothing is fetched until a {activeCriteria.city} source grants written permission.</p><button type="button" onClick={explainSourceSweep}>Check source readiness</button></div>
            )}
          </div>
          <section className="decision-note"><Sparkles size={17} aria-hidden="true" /><div><strong>Why this queue is different</strong><p>Each score shows its evidence. Missing contact details reduce confidence instead of disappearing behind a recommendation.</p></div></section>
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
        <a href="#pursuits" className="is-active"><Inbox size={18} aria-hidden="true" /><span>Pursuits</span></a>
        <a href="#activity"><Activity size={18} aria-hidden="true" /><span>Activity</span></a>
        <button type="button" onClick={() => toast.info(integrationStatus?.agentmailConfigured ? `AgentMail is connected as ${integrationStatus.inboxId}.` : "AgentMail inbox is ready and waiting for its deployment key.")}><Mail size={18} aria-hidden="true" /><span>Inbox</span></button>
      </nav>
      <CriteriaDialog key={backendCriteria?._id ?? "default-criteria"} open={criteriaOpen} onOpenChange={setCriteriaOpen} criteria={activeCriteria} onSave={saveSearchBrief} />
    </div>
  );
}
