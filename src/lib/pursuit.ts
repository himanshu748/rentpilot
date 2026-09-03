import type { Id } from "../../convex/_generated/dataModel";

export type PursuitStatus =
  | "new"
  | "reviewing"
  | "drafted"
  | "contacted"
  | "replied"
  | "viewing"
  | "closed";
export type SendStatus = "draft" | "ready" | "sending" | "sent" | "failed";

export type Pursuit = {
  id: string;
  caseId: string;
  listingId?: Id<"listings">;
  threadId?: Id<"threads">;
  outboundId: string | null;
  title: string;
  locality: string;
  rent: number;
  kind: string;
  score: number;
  confidence: number;
  status: PursuitStatus;
  source: string;
  sourceNote: string;
  discovered: string;
  seen: string;
  contact: string | null;
  missing: string[];
  scoreBreakdown: { label: string; score: number; max: number; note: string }[];
  draftSubject: string;
  draftBody: string;
  sendStatus?: SendStatus;
  isDemo?: boolean;
};

/** Progress stages shown on the pursuit rail. "closed" is terminal, not a stage. */
export const statusOrder: PursuitStatus[] = [
  "new",
  "reviewing",
  "drafted",
  "contacted",
  "replied",
  "viewing",
];

export const statusLabels: Record<PursuitStatus, string> = {
  new: "Found",
  reviewing: "Reviewed",
  drafted: "Drafted",
  contacted: "Contacted",
  replied: "Replied",
  viewing: "Viewing",
  closed: "Closed",
};
