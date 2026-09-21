export const mailboxWarning = "Mailbox numbers are normally fixed assignments made by the mail provider. Only change or remove one after verifying the assignment with the mail provider. This updates the permanent unit directory and directory-based reports.";

export function confirmMailboxChange(unit: string, before: string | null, after: string | null) {
  return window.confirm(`${mailboxWarning}\n\n${unit}\nCurrent mailbox: ${before || "Not recorded"}\nNew mailbox: ${after || "Not recorded (remove assignment)"}\n\nHave you verified this assignment and want to save it?`);
}
