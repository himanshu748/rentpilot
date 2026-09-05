type Delivery = { status: string; agentmailMessageId: string | null } | null;

/** Queued is not sent. Only a provider receipt allows the code-entry step. */
export async function waitForCodeAcceptance(
  getStatus: () => Promise<Delivery>,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 750)),
  attempts = 20,
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const delivery = await getStatus();
    if (!delivery) throw new Error("The sign-in email could not be tracked. Request a new code.");
    if (["failed", "bounced", "rejected", "complained"].includes(delivery.status)) {
      throw new Error("AgentMail could not send the sign-in email. Please try again later.");
    }
    if (["sent", "delivered"].includes(delivery.status) && delivery.agentmailMessageId) return;
    if (attempt < attempts - 1) await pause();
  }
  throw new Error("Sending is not confirmed yet. Wait a minute before requesting another code.");
}
