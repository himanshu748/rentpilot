"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useAuthActions } from "@convex-dev/auth/react";
import { CircleAlert, Mail, X } from "lucide-react";
import { useState, type FormEvent } from "react";

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

  function reset() {
    setStep("email");
    setCode("");
    setBusy(false);
    setError(null);
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!isEmailish(address)) {
      setError("Enter an email address we can send a code to.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn("agentmail-code", { email: address });
      setStep("code");
    } catch {
      setError("Could not send the code. Check that AgentMail is configured, then try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entered = code.trim();
    if (entered.length < 6) {
      setError("Enter the six digit code from your inbox.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn("agentmail-code", { email: email.trim(), code: entered });
      await onSignedIn();
      onOpenChange(false);
      reset();
    } catch {
      setError("That code did not match. Check it, or request a new one.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
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
              <span className="eyebrow">Keep this search</span>
              <Dialog.Title>Save your pursuits</Dialog.Title>
              <Dialog.Description id="signin-dialog-description">
                Landlords reply hours or days later. An account gives that reply somewhere to land
                that is not one browser.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close sign in">
              <X size={18} />
            </Dialog.Close>
          </div>

          {step === "email" ? (
            <form className="criteria-form" onSubmit={requestCode} aria-busy={busy}>
              {error && (
                <div className="form-error" role="alert">
                  <CircleAlert size={15} aria-hidden="true" />
                  {error}
                </div>
              )}
              <label className="form-field" htmlFor="signin-email">
                <span>Email address</span>
                <input
                  id="signin-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  aria-invalid={Boolean(error)}
                />
                <small>AgentMail sends a six digit code. No password to remember.</small>
              </label>
              <div className="criteria-form-actions">
                <Dialog.Close className="secondary-action" type="button">
                  Cancel
                </Dialog.Close>
                <button className="primary-action" type="submit" disabled={busy}>
                  <Mail size={15} aria-hidden="true" />
                  {busy ? "Sending code…" : "Send me a code"}
                </button>
              </div>
            </form>
          ) : (
            <form className="criteria-form" onSubmit={verifyCode} aria-busy={busy}>
              {error && (
                <div className="form-error" role="alert">
                  <CircleAlert size={15} aria-hidden="true" />
                  {error}
                </div>
              )}
              <label className="form-field" htmlFor="signin-code">
                <span>Six digit code</span>
                <input
                  id="signin-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  aria-invalid={Boolean(error)}
                />
                <small>Sent to {email.trim()}. It expires in 15 minutes.</small>
              </label>
              <div className="criteria-form-actions">
                <button className="secondary-action" type="button" onClick={reset}>
                  Use another address
                </button>
                <button className="primary-action" type="submit" disabled={busy}>
                  {busy ? "Checking…" : "Verify and save"}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
