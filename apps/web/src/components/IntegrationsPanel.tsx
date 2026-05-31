import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { ApiTokenScope, Property, WebhookEventType } from "../lib/api";
import {
  createApiToken,
  createWebhook,
  createWebhookTestPayload,
  getWebhookDeliveries,
  getWebhookHealth,
  getIntegrations,
  revokeApiToken,
  revokeWebhook,
} from "../lib/api";
import { formatDateTime } from "../lib/dateTime";
import { ConfirmDialog } from "./ConfirmDialog";
import { StatusState } from "./StatusState";

type Props = {
  properties: Property[];
};

const defaultTokenScopes: ApiTokenScope[] = ["read:items"];
const defaultWebhookEvents: WebhookEventType[] = ["item.updated"];

export function IntegrationsPanel({ properties }: Props) {
  const queryClient = useQueryClient();
  const integrations = useQuery({ queryKey: ["integrations"], queryFn: getIntegrations });
  const availableProperties = integrations.data?.properties ?? properties;
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [createdWebhookSecret, setCreatedWebhookSecret] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tokenState, setTokenState] = useState({
    name: "",
    scopes: defaultTokenScopes,
    propertyIds: [] as string[],
  });
  const [webhookState, setWebhookState] = useState({
    name: "",
    url: "",
    eventTypes: defaultWebhookEvents,
    propertyIds: [] as string[],
  });
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { type: "token" | "webhook"; id: string; label: string }>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["integrations"] });

  const tokenMutation = useMutation({
    mutationFn: createApiToken,
    onSuccess: async (result) => {
      setErrorMessage(null);
      setCreatedToken(result.token);
      setTokenState({ name: "", scopes: defaultTokenScopes, propertyIds: [] });
      await refresh();
    },
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : "Unable to create API token"),
  });

  const webhookMutation = useMutation({
    mutationFn: createWebhook,
    onSuccess: async (result) => {
      setErrorMessage(null);
      setCreatedWebhookSecret(result.secret);
      setWebhookState({ name: "", url: "", eventTypes: defaultWebhookEvents, propertyIds: [] });
      await refresh();
    },
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : "Unable to create webhook"),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: revokeApiToken,
    onSuccess: refresh,
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : "Unable to revoke API token"),
  });
  const revokeWebhookMutation = useMutation({
    mutationFn: revokeWebhook,
    onSuccess: refresh,
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : "Unable to disable webhook"),
  });
  const webhookTestMutation = useMutation({
    mutationFn: ({ id, eventType, enqueue }: { id: string; eventType?: WebhookEventType; enqueue: boolean }) =>
      createWebhookTestPayload(id, { eventType, enqueue }),
    onSuccess: async (result) => {
      setErrorMessage(null);
      setWebhookMessage(`${result.delivery.status}: ${result.notice}`);
      await queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", result.delivery.webhookId] });
      await queryClient.invalidateQueries({ queryKey: ["webhook-health", result.delivery.webhookId] });
      await refresh();
    },
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : "Unable to create webhook test payload"),
  });

  const scopes = integrations.data?.scopes ?? [];
  const webhookEvents = integrations.data?.webhookEvents ?? [];
  const apiTokens = integrations.data?.apiTokens ?? [];
  const webhooks = integrations.data?.webhooks ?? [];
  const selectedWebhook = webhooks.find((webhook) => webhook.id === selectedWebhookId) ?? null;
  const webhookDeliveries = useQuery({
    queryKey: ["webhook-deliveries", selectedWebhookId],
    queryFn: () => getWebhookDeliveries(selectedWebhookId ?? "", { limit: 10, offset: 0 }),
    enabled: Boolean(selectedWebhookId),
  });
  const webhookHealthDetails = useQuery({
    queryKey: ["webhook-health", selectedWebhookId],
    queryFn: () => getWebhookHealth(selectedWebhookId ?? ""),
    enabled: Boolean(selectedWebhookId),
  });
  const busy =
    tokenMutation.isPending ||
    webhookMutation.isPending ||
    revokeTokenMutation.isPending ||
    revokeWebhookMutation.isPending ||
    webhookTestMutation.isPending;

  const activeTokenCount = useMemo(() => apiTokens.filter((token) => token.isActive).length, [apiTokens]);

  const toggleTokenScope = (scope: ApiTokenScope) => {
    setTokenState((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((value) => value !== scope)
        : [...current.scopes, scope],
    }));
  };

  const toggleWebhookEvent = (eventType: WebhookEventType) => {
    setWebhookState((current) => ({
      ...current,
      eventTypes: current.eventTypes.includes(eventType)
        ? current.eventTypes.filter((value) => value !== eventType)
        : [...current.eventTypes, eventType],
    }));
  };

  const toggleProperty = (target: "token" | "webhook", propertyId: string) => {
    if (target === "token") {
      setTokenState((current) => ({
        ...current,
        propertyIds: current.propertyIds.includes(propertyId)
          ? current.propertyIds.filter((id) => id !== propertyId)
          : [...current.propertyIds, propertyId],
      }));
      return;
    }
    setWebhookState((current) => ({
      ...current,
      propertyIds: current.propertyIds.includes(propertyId)
        ? current.propertyIds.filter((id) => id !== propertyId)
        : [...current.propertyIds, propertyId],
    }));
  };

  const webhookHealth = (webhook: (typeof webhooks)[number]) => {
    if (!webhook.isEnabled) return { label: "DISABLED", className: "status-muted" };
    if (webhook.failureCount > 0) return { label: "FAILING", className: "status-danger" };
    if ((webhook.deliveryAttemptCount ?? 0) === 0) return { label: "READY", className: "status-info" };
    return { label: "HEALTHY", className: "status-active" };
  };

  const formatDate = (value: string | null) => formatDateTime(value);

  return (
    <section className="admin-card" data-testid="integrations-panel">
      <header className="admin-card-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>Integrations</h2>
        </div>
        <span className="subtitle">Create scoped API tokens and register webhook endpoints for future delivery.</span>
      </header>

      {integrations.isLoading ? <StatusState title="Loading integrations" description="Loading token and webhook metadata." /> : null}
      {errorMessage ? <div className="admin-message error">{errorMessage}</div> : null}

      <div className="admin-grid integrations-grid">
        <section className="admin-section">
          <h3>Create API Token</h3>
          <p className="helper-text">Tokens are shown once. Store them in a password manager or deployment secret store.</p>
          {createdToken ? (
            <div className="admin-message success">
              <strong>New token, shown once:</strong>
              <input data-testid="api-token-once" readOnly value={createdToken} onFocus={(event) => event.currentTarget.select()} />
            </div>
          ) : null}
          <label>
            Token name
            <input
              data-testid="api-token-name"
              value={tokenState.name}
              onChange={(event) => setTokenState((current) => ({ ...current, name: event.target.value }))}
              placeholder="Reporting adapter"
            />
          </label>
          <div className="property-access-block">
            <p className="section-label">Scopes</p>
            <div className="checkbox-grid">
              {scopes.map((scope) => (
                <label key={scope} className="checkbox-pill compact-checkbox">
                  <input
                    data-testid={`api-token-scope-${scope.replace(":", "-")}`}
                    type="checkbox"
                    checked={tokenState.scopes.includes(scope)}
                    onChange={() => toggleTokenScope(scope)}
                  />
                  <span>{scope}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="property-access-block">
            <p className="section-label">Property scope</p>
            <p className="helper-text">Leave empty for all properties allowed to the creating admin.</p>
            <div className="checkbox-grid">
              {availableProperties.map((property) => (
                <label key={property.id} className="checkbox-pill compact-checkbox">
                  <input
                    data-testid={`api-token-property-${property.code}`}
                    type="checkbox"
                    checked={tokenState.propertyIds.includes(property.id)}
                    onChange={() => toggleProperty("token", property.id)}
                  />
                  <span>{property.code}</span>
                </label>
              ))}
            </div>
          </div>
          <button
            data-testid="api-token-create"
            className="button button-primary"
            disabled={busy || tokenState.scopes.length === 0 || !tokenState.name.trim()}
            onClick={() => tokenMutation.mutate(tokenState)}
          >
            Create API Token
          </button>
        </section>

        <section className="admin-section">
          <h3>Register Webhook</h3>
          <p className="helper-text">Webhook endpoints can queue signed payloads for the explicit run-webhooks.sh delivery runner.</p>
          {createdWebhookSecret ? (
            <div className="admin-message success">
              <strong>Webhook secret, shown once:</strong>
              <input data-testid="webhook-secret-once" readOnly value={createdWebhookSecret} onFocus={(event) => event.currentTarget.select()} />
            </div>
          ) : null}
          <label>
            Webhook name
            <input
              data-testid="webhook-name"
              value={webhookState.name}
              onChange={(event) => setWebhookState((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ops event receiver"
            />
          </label>
          <label>
            Endpoint URL
            <input
              data-testid="webhook-url"
              value={webhookState.url}
              onChange={(event) => setWebhookState((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://example.com/makereadyos/webhooks"
            />
          </label>
          <div className="property-access-block">
            <p className="section-label">Events</p>
            <div className="checkbox-grid">
              {webhookEvents.map((eventType) => (
                <label key={eventType} className="checkbox-pill compact-checkbox">
                  <input
                    data-testid={`webhook-event-${eventType.replace(/\./g, "-")}`}
                    type="checkbox"
                    checked={webhookState.eventTypes.includes(eventType)}
                    onChange={() => toggleWebhookEvent(eventType)}
                  />
                  <span>{eventType}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="property-access-block">
            <p className="section-label">Property scope</p>
            <div className="checkbox-grid">
              {availableProperties.map((property) => (
                <label key={property.id} className="checkbox-pill compact-checkbox">
                  <input
                    type="checkbox"
                    checked={webhookState.propertyIds.includes(property.id)}
                    onChange={() => toggleProperty("webhook", property.id)}
                  />
                  <span>{property.code}</span>
                </label>
              ))}
            </div>
          </div>
          <button
            data-testid="webhook-create"
            className="button button-secondary"
            disabled={busy || webhookState.eventTypes.length === 0 || !webhookState.name.trim() || !webhookState.url.trim()}
            onClick={() => webhookMutation.mutate(webhookState)}
          >
            Register Webhook
          </button>
        </section>
      </div>

      <section className="admin-section integration-list">
        <div className="admin-section-head">
          <h3>API Tokens</h3>
          <span className="subtitle">{activeTokenCount} active</span>
        </div>
        {apiTokens.length === 0 ? (
          <div className="admin-empty-state">No API tokens have been created.</div>
        ) : (
          apiTokens.map((token) => (
            <div key={token.id} className="integration-row" data-testid="api-token-row">
              <div>
                <strong>{token.name}</strong>
                <p className="helper-text">
                  {token.tokenPrefix}...{token.tokenLastFour} · {token.scopes.join(", ")} · {token.properties.length ? token.properties.map((property) => property.code).join(", ") : "all properties"}
                </p>
                <p className="helper-text">Last used: {formatDate(token.lastUsedAt)}</p>
              </div>
              <div className="row-actions">
                <span className={`status-pill ${token.isActive ? "status-active" : "status-muted"}`}>{token.isActive ? "ACTIVE" : "REVOKED"}</span>
                {token.isActive ? (
                  <button
                    className="button button-danger"
                    onClick={() => setConfirm({ type: "token", id: token.id, label: token.name })}
                  >
                    Revoke
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="admin-section integration-list">
        <div className="admin-section-head">
          <h3>Webhooks</h3>
          <span className="subtitle">Delivery: {integrations.data?.webhookDelivery ?? "scaffolded"}</span>
        </div>
        {webhooks.length === 0 ? (
          <div className="admin-empty-state">No webhook endpoints are registered.</div>
        ) : (
          webhooks.map((webhook) => {
            const health = webhookHealth(webhook);
            return (
              <div key={webhook.id} className="integration-row integration-row-stacked" data-testid="webhook-row">
                <div className="integration-row-main">
                  <div>
                    <strong>{webhook.name}</strong>
                    <p className="helper-text">{webhook.url}</p>
                    <p className="helper-text">
                      {webhook.eventTypes.join(", ")} · secret ends {webhook.secretLastFour} ·{" "}
                      {webhook.properties.length ? webhook.properties.map((property) => property.code).join(", ") : "all properties"}
                    </p>
                    <p className="helper-text">
                      Last delivered: {formatDate(webhook.lastDeliveryAt)} · attempts {webhook.deliveryAttemptCount ?? 0} · failures {webhook.failureCount}
                    </p>
                  </div>
                  <div className="row-actions">
                    <span className={`status-pill ${health.className}`}>{health.label}</span>
                    <button
                      className="button button-secondary"
                      data-testid="webhook-deliveries-toggle"
                      onClick={() => setSelectedWebhookId((current) => (current === webhook.id ? null : webhook.id))}
                    >
                      {selectedWebhookId === webhook.id ? "Hide deliveries" : "View deliveries"}
                    </button>
                    <button
                      className="button"
                      disabled={busy || !webhook.isEnabled}
                      onClick={() => webhookTestMutation.mutate({ id: webhook.id, eventType: webhook.eventTypes[0], enqueue: false })}
                    >
                      Dry-run test
                    </button>
                    <button
                      className="button button-primary"
                      disabled={busy || !webhook.isEnabled}
                      onClick={() => webhookTestMutation.mutate({ id: webhook.id, eventType: webhook.eventTypes[0], enqueue: true })}
                    >
                      Queue test
                    </button>
                    {webhook.isEnabled ? (
                      <button
                        className="button button-danger"
                        onClick={() => setConfirm({ type: "webhook", id: webhook.id, label: webhook.name })}
                      >
                        Disable
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
        {webhookMessage ? <div className="admin-message success">{webhookMessage}</div> : null}
        {selectedWebhook ? (
          <div className="webhook-delivery-panel" data-testid="webhook-delivery-panel">
            <div className="admin-section-head">
              <div>
                <h4>Recent deliveries: {selectedWebhook.name}</h4>
                <p className="helper-text">Queued payloads are delivered only when `./run-webhooks.sh` runs.</p>
              </div>
              <button className="button button-secondary" onClick={() => webhookDeliveries.refetch()} disabled={webhookDeliveries.isFetching}>
                Refresh
              </button>
            </div>
            {webhookDeliveries.isLoading ? <StatusState title="Loading deliveries" description="Fetching recent webhook attempts." /> : null}
            {webhookHealthDetails.data ? (
              <div className="webhook-health-summary" data-testid="webhook-health-summary">
                <span>Health: <strong>{webhookHealthDetails.data.health.state}</strong></span>
                <span>Pending: <strong>{webhookHealthDetails.data.health.pendingCount}</strong></span>
                <span>Total attempts: <strong>{webhookHealthDetails.data.health.total}</strong></span>
                <span>Failures: <strong>{webhookHealthDetails.data.health.failureCount}</strong></span>
                {webhookHealthDetails.data.health.oldestPendingAt ? <span>Oldest pending: {formatDate(webhookHealthDetails.data.health.oldestPendingAt)}</span> : null}
              </div>
            ) : null}
            {webhookDeliveries.isError ? (
              <div className="admin-message error">Unable to load webhook deliveries.</div>
            ) : webhookDeliveries.data && webhookDeliveries.data.deliveries.length === 0 ? (
              <div className="admin-empty-state">No delivery attempts recorded yet. Use Dry-run test or Queue test to create one.</div>
            ) : webhookDeliveries.data ? (
              <div className="webhook-delivery-list">
                {webhookDeliveries.data.deliveries.map((delivery) => (
                  <div key={delivery.id} className="webhook-delivery-row">
                    <div>
                      <strong>{delivery.eventType}</strong>
                      <p className="helper-text">
                        {delivery.deliveryId} · created {formatDate(delivery.createdAt)} · attempt {delivery.attemptNumber}
                      </p>
                      {delivery.errorMessage ? <p className="helper-text webhook-error-text">{delivery.errorMessage}</p> : null}
                    </div>
                    <div className="webhook-delivery-meta">
                      <span className={`status-pill status-${delivery.status.toLowerCase().replace("_", "-")}`}>{delivery.status}</span>
                      <span>{delivery.responseStatus ? `HTTP ${delivery.responseStatus}` : "No response"}</span>
                      <span>{delivery.deliveredAt ? `Delivered ${formatDate(delivery.deliveredAt)}` : delivery.nextAttemptAt ? `Retry ${formatDate(delivery.nextAttemptAt)}` : ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.type === "token" ? "Revoke API token?" : "Disable webhook?"}
        description={confirm ? `${confirm.label} will stop working immediately.` : ""}
        confirmLabel={confirm?.type === "token" ? "Revoke" : "Disable"}
        tone="danger"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          if (confirm.type === "token") await revokeTokenMutation.mutateAsync(confirm.id);
          else await revokeWebhookMutation.mutateAsync(confirm.id);
          setConfirm(null);
        }}
      />
    </section>
  );
}
