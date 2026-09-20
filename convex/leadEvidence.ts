/** User-supplied text is attributed evidence, never independently verified supply. */
export function recipientEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email) && email.length <= 254 ? email : null;
}
export function mailbox(value: string) {
  return recipientEmail(value.match(/<([^<>]+)>/)?.[1] ?? value);
}
export function sourceAge(date: string, now = Date.now()) {
  if (!date) return "unknown";
  if (!Number.isFinite(Date.parse(`${date}T00:00:00Z`))) return "invalid";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return "invalid";
  const age = now - Date.parse(`${date}T00:00:00Z`);
  return age < -86400000 ? "invalid" : age > 30 * 86400000 ? "stale" : "recent";
}
export function verificationQuestions(requirements: string[], sourceDate: string) {
  return [
    "Is this rental still available, and from what date?",
    "What is the monthly rent, every mandatory recurring charge, and the deposit separately?",
    "What exact locality is it in? I have not verified any distance.",
    "Is the offered unit a private room, shared room, studio, or an entire home?",
    ...requirements.map(requirement => `Can you confirm this requirement: ${requirement}? Please state any conditions or extra cost.`),
    ...(sourceDate ? [`Does the information dated ${sourceDate} remain current?`] : ["When was this listing information last updated?"]),
  ];
}
export function verificationDraft(title: string, requirements: string[], sourceDate: string) {
  return { subject: `Questions about ${title}`.slice(0, 160), body: `Hello,\n\nI am checking the rental information you shared for “${title}”. I have not verified the details yet.\n\n${verificationQuestions(requirements, sourceDate).map((q, i) => `${i + 1}. ${q}`).join("\n\n")}\n\nPlease reply with the current details. This is an inquiry, not a booking.\n\nThank you` };
}
