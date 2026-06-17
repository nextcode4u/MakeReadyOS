import type { UserLanguage } from "../lib/api";
import { formatTime } from "../lib/dateTime";
import { t } from "../lib/i18n";

type Props = {
  online: boolean;
  degraded: boolean;
  lastIssueAt: string | null;
  pendingSyncCount: number;
  syncing: boolean;
  language: UserLanguage;
  onRetry: () => void;
};

export function ConnectionStatus({ online, degraded, lastIssueAt, pendingSyncCount, syncing, language, onRetry }: Props) {
  if (online && !degraded && pendingSyncCount === 0) {
    return null;
  }

  const title = pendingSyncCount > 0 && online
    ? syncing ? t(language, "connection.syncingOfflineChanges") : t(language, "connection.offlineChangesPending")
    : online ? t(language, "connection.connectionUnstable") : t(language, "connection.offline");
  const description = pendingSyncCount > 0
    ? pendingSyncCount === 1
      ? t(language, "connection.pendingSingle")
      : t(language, "connection.pendingPlural").replace("{count}", String(pendingSyncCount))
    : online
      ? t(language, "connection.apiUnreachable")
      : t(language, "connection.cachedWork");

  return (
    <aside className={online ? "connection-banner degraded" : "connection-banner offline"} data-testid="connection-banner" role="status" aria-live="polite">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
        {lastIssueAt ? <small>{t(language, "connection.lastIssue")} {formatTime(lastIssueAt, undefined, language)}</small> : null}
      </div>
      <button type="button" className="button button-secondary" data-testid="connection-retry" onClick={onRetry}>
        {syncing ? t(language, "connection.syncingNow") : t(language, "connection.retryNow")}
      </button>
    </aside>
  );
}
