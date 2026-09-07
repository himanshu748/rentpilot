"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useAuthActions } from "@convex-dev/auth/react";
import { CircleAlert, Mail, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

/** Matches the server check: enough to catch a typo, not to police addresses. */
function isEmailish(value: string) {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);
}

export function SignInDialog({
  open,
  onOpenChange,
  onSignedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignedIn: () => Promise<void>;
}) {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const operation = useRef(0);
  const inFlight = useRef(false);
  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (!open || !resendAt) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, resendAt]);

  useEffect(() => () => { operation.current++; }, []);

  function cancelPendingUi() {
    operation.current++;
    inFlight.current = false;
    setBusy(false);
  }

  function reset() {
    cancelPendingUi();
    setStep("email");
    setCode("");
    setError(null);
    setNotice(null);
  }

  function enterExistingCode() {
    if (!isEmailish(email.trim())) {
      setError("Enter the email address that received your code.");
      return;
    }
    cancelPendingUi();
    setError(null);
    setNotice(null);
    setStep("code");
  }

  async function requestCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (inFlight.current || Date.now() < resendAt) return;
    const address = email.trim();
    if (!isEmailish(address)) {
      setError("Enter an email address we can send a code to.");
      return;
    }
    const request = ++operation.current;
    inFlight.current = true;
    setEmail(address);
    setNow(Date.now());
    setResendAt(Date.now() + 60_000);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await signIn("agentmail-code", { email: address });
      if (request !== operation.current) return;
      setCode("");
      setNotice(`Our email provider accepted a code email for ${address}. Check your inbox or spam folder.`);
      setStep("code");
    } catch {
      if (request !== operation.current) return;
      setError("We could not confirm delivery. If a code arrived, you can still enter it. Otherwise, wait a minute and request another. Your search preferences are still saved.");
    } finally {
      if (request === operation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const entered = code.trim();
    if (!/^\d{6}$/.test(entered)) {
      setError("Enter the six digit code from your inbox.");
      return;
    }
    const request = ++operation.current;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await signIn("agentmail-code", { email: email.trim(), code: entered });
      if (request !== operation.current) return;
      await onSignedIn();
      if (request !== operation.current) return;
      onOpenChange(false);
      reset();
    } catch {
      if (request !== operation.current) return;
      setError("That code did not match. Check it, or request a new one.");
    } finally {
      if (request === operation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) cancelPendingUi();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="criteria-dialog-overlay" />
        <Dialog.Content
          className="criteria-dialog-content signin-dialog"
          aria-modal="true"
          aria-describedby="signin-dialog-description"
        >
          <div className="criteria-dialog-head">
            <div>
              <span className="eyebrow">Email sign-in</span>
              <Dialog.Title>Sign in to search live listings</Dialog.Title>
              <Dialog.Description id="signin-dialog-description">
                Sign-in is required for web searches, AI drafts and sending inquiries.
                Your saved preferences and matches will follow your account.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close sign in">
              <X size={18} />
            </Dialog.Close>
          </div>

          {step === "email" ? (
            <form key="email" className="criteria-form" onSubmit={requestCode} aria-busy={busy}>
              {error && (
                <div id="signin-error" className="form-error" role="alert">
                  <CircleAlert size={15} aria-hidden="true" />
                  {error}
                </div>
              )}
              <label className="form-field" htmlFor="signin-email">
                <span id="signin-email-label">Email address</span>
                <input
                  id="signin-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  spellCheck={false}
                  disabled={busy}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  aria-invalid={Boolean(error)}
                  aria-labelledby="signin-email-label"
                  aria-describedby={`signin-email-hint${error ? " signin-error" : ""}`}
                />
                <small id="signin-email-hint">We will email you a six-digit sign-in code. You do not need a password.</small>
              </label>
              <div className="criteria-form-actions">
                <Dialog.Close className="secondary-action" type="button">
                  Cancel
                </Dialog.Close>
                <button className="primary-action" type="submit" disabled={busy || cooldown > 0}>
                  <Mail size={15} aria-hidden="true" />
                  {busy ? "Sending code…" : cooldown > 0 ? `Send again in ${cooldown}s` : "Send me a code"}
                </button>
              </div>
              <button className="secondary-action signin-recovery" type="button" onClick={enterExistingCode}>I already have a code</button>
            </form>
          ) : (
            <form key="code" className="criteria-form" onSubmit={verifyCode} aria-busy={busy}>
              {error && (
                <div id="signin-error" className="form-error" role="alert">
                  <CircleAlert size={15} aria-hidden="true" />
                  {error}
                </div>
              )}
              <label className="form-field" htmlFor="signin-code">
                <span id="signin-code-label">Six-digit code</span>
                <input
                  id="signin-code"
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  aria-invalid={Boolean(error)}
                  aria-labelledby="signin-code-label"
                  aria-describedby={`signin-code-hint${error ? " signin-error" : ""}`}
                  disabled={busy}
                />
                <small id="signin-code-hint">Enter the latest code sent to {email.trim()}. Codes expire after 15 minutes.</small>
              </label>
              {notice && <p className="signin-notice" role="status">{notice}</p>}
              <div className="criteria-form-actions">
                <button className="secondary-action" type="button" onClick={reset} disabled={busy}>
                  Use another address
                </button>
                <button className="primary-action" type="submit" disabled={busy}>
                  {busy ? "Checking…" : "Verify and sign in"}
                </button>
              </div>
              <button className="secondary-action signin-recovery" type="button" onClick={() => void requestCode()} disabled={busy || cooldown > 0}>{cooldown > 0 ? `Resend available in ${cooldown}s` : "Send a new code"}</button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
