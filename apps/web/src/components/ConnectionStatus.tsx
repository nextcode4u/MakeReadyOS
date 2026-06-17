import { formatTime } from "../lib/dateTime";

type Props = {
  online: boolean;
  degraded: boolean;
  lastIssueAt: string | null;
  pendingSyncCount: number;
  syncing: boolean;
  onRetry: () => void;
};

export function ConnectionStatus({ online, degraded, lastIssueAt, pendingSyncCount, syncing, onRetry }: Props) {
  if (online && !degraded && pendingSyncCount === 0) {
    return null;
  }

  const title = pendingSyncCount > 0 && online
    ? syncing ? "Syncing offline changes" : "Offline changes pending"
    : online ? "Connection looks unstable" : "You are offline";
  const description = pendingSyncCount > 0
    ? `${pendingSyncCount} queued change${pendingSyncCount === 1 ? "" : "s"} will stay on this device until upload and sync are confirmed.`
    : online
      ? "The app could not reach the API. Existing screen data may be stale until retry succeeds."
      : "You can keep working with cached screens. Queued edits and photo uploads will sync after reconnecting.";

  return (
    <aside className={online ? "connection-banner degraded" : "connection-banner offline"} data-testid="connection-banner" role="status" aria-live="polite">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
        {lastIssueAt ? <small>Last issue {formatTime(lastIssueAt)}</small> : null}
      </div>
      <button type="button" className="button button-secondary" data-testid="connection-retry" onClick={onRetry}>
        {syncing ? "Syncing..." : "Retry now"}
      </button>
    </aside>
  );
}
