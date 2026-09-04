import { AgentMail } from "@agentmail/convex";
import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth, type EmailConfig } from "@convex-dev/auth/server";
import { components } from "./_generated/api";

const agentmail = new AgentMail(components.agentmail);

/**
 * Sign-in codes ride the same AgentMail inbox the inquiries do. Verifying the
 * address is what makes the reply path trustworthy: a landlord answers days
 * later, so a pursuit needs an owner that outlives one browser's localStorage.
 */
function sixDigitCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0]! % 1_000_000).padStart(6, "0");
}

type SendParams = { identifier: string; token: string; expires: Date };

/**
 * The package types this callback with one argument while the runtime passes
 * the action ctx as a second, so the signature is declared here and cast once.
 */
async function sendSignInCode(
  { identifier: email, token, expires }: SendParams,
  ctx: unknown,
) {
  const inboxId = process.env.AGENTMAIL_INBOX_ID;
  if (!process.env.AGENTMAIL_API_KEY || !inboxId) {
    throw new Error(
      "AgentMail is not configured, so sign-in codes cannot be sent. Set AGENTMAIL_API_KEY and AGENTMAIL_INBOX_ID on the deployment.",
    );
  }
  const minutes = Math.max(1, Math.round((expires.getTime() - Date.now()) / 60000));
  await agentmail.sendMessage(
    ctx as Parameters<typeof agentmail.sendMessage>[0],
    inboxId,
    {
      to: email,
      subject: `${token} is your RentPilot sign-in code`,
      text: [
        `Your RentPilot sign-in code is ${token}.`,
        `It expires in ${minutes} minutes.`,
        "",
        "If you did not ask to sign in, you can ignore this message.",
      ].join("\n"),
      labels: ["rentpilot", "sign-in"],
    },
  );
}

export const AgentMailCode = Email({
  id: "agentmail-code",
  maxAge: 60 * 15,
  generateVerificationToken: async () => sixDigitCode(),
  sendVerificationRequest:
    sendSignInCode as unknown as EmailConfig["sendVerificationRequest"],
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [AgentMailCode],
});
