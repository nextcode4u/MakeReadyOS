import { formatTime } from "../lib/dateTime";

type Props = {
  online: boolean;
  degraded: boolean;
  lastIssueAt: string | null;
  onRetry: () => void;
};

export function ConnectionStatus({ online, degraded, lastIssueAt, onRetry }: Props) {
  if (online && !degraded) {
    return null;
  }

  const title = online ? "Connection looks unstable" : "You are offline";
  const description = online
    ? "The app could not reach the API. Existing screen data may be stale until retry succeeds."
    : "Keep this screen open. Full offline editing is not enabled yet, so save changes after reconnecting.";

  return (
    <aside className={online ? "connection-banner degraded" : "connection-banner offline"} data-testid="connection-banner" role="status" aria-live="polite">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
        {lastIssueAt ? <small>Last issue {formatTime(lastIssueAt)}</small> : null}
      </div>
      <button type="button" className="button button-secondary" data-testid="connection-retry" onClick={onRetry}>
        Retry now
      </button>
    </aside>
  );
}
