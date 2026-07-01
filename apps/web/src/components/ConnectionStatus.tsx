import type { UserLanguage } from "../lib/api";
import { formatTime } from "../lib/dateTime";
import { t } from "../lib/i18n";

type Props = {
  online: boolean;
  degraded: boolean;
  lastIssueAt: string | null;
  pendingSyncCount: number;
  retryingCount: number;
  blockedCount: number;
  conflictCount: number;
  syncing: boolean;
  language: UserLanguage;
  onRetry: () => void;
  onReviewQueue: () => void;
};

export function ConnectionStatus({ online, degraded, lastIssueAt, pendingSyncCount, retryingCount, blockedCount, conflictCount, syncing, language, onRetry, onReviewQueue }: Props) {
  if (online && !degraded && pendingSyncCount === 0) {
    return null;
  }

  const title = blockedCount > 0 && online
    ? conflictCount > 0
      ? t(language, "connection.syncConflicts")
      : t(language, "connection.syncBlocked")
    : retryingCount > 0 && online
    ? t(language, "connection.syncRetrying")
    : pendingSyncCount > 0 && online
    ? syncing ? t(language, "connection.syncingOfflineChanges") : t(language, "connection.offlineChangesPending")
    : online ? t(language, "connection.connectionUnstable") : t(language, "connection.offline");
  const description = blockedCount > 0
    ? conflictCount > 0
      ? t(language, "connection.syncConflictsDescription").replace("{count}", String(blockedCount))
      : t(language, "connection.syncBlockedDescription").replace("{count}", String(blockedCount))
    : retryingCount > 0
    ? t(language, "connection.syncRetryingDescription").replace("{count}", String(retryingCount))
    : pendingSyncCount > 0
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
      {blockedCount > 0 ? (
        <button type="button" className="button button-secondary" data-testid="connection-review-queue" onClick={onReviewQueue}>
          {t(language, "connection.reviewQueue")}
        </button>
      ) : null}
    </aside>
  );
}
