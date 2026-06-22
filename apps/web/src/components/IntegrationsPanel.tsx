import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { ApiTokenScope, Property, UserLanguage, WebhookEventType } from "../lib/api";
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
  language: UserLanguage;
};

const defaultTokenScopes: ApiTokenScope[] = ["read:items"];
const defaultWebhookEvents: WebhookEventType[] = ["item.updated"];
const webhookStatusOrder = ["PENDING", "FAILED", "DELIVERED", "GAVE_UP", "DRY_RUN"] as const;

function webhookStatusPillClass(status: string) {
  return `status-${status.toLowerCase().replace(/_/g, "-")}`;
}

export function IntegrationsPanel({ properties, language }: Props) {
  const isSpanish = language === "es";
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
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : isSpanish ? "No se pudo crear el token de API." : "Unable to create API token"),
  });

  const webhookMutation = useMutation({
    mutationFn: createWebhook,
    onSuccess: async (result) => {
      setErrorMessage(null);
      setCreatedWebhookSecret(result.secret);
      setWebhookState({ name: "", url: "", eventTypes: defaultWebhookEvents, propertyIds: [] });
      await refresh();
    },
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : isSpanish ? "No se pudo crear el webhook." : "Unable to create webhook"),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: revokeApiToken,
    onSuccess: refresh,
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : isSpanish ? "No se pudo revocar el token de API." : "Unable to revoke API token"),
  });
  const revokeWebhookMutation = useMutation({
    mutationFn: revokeWebhook,
    onSuccess: refresh,
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : isSpanish ? "No se pudo desactivar el webhook." : "Unable to disable webhook"),
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
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : isSpanish ? "No se pudo crear la prueba del webhook." : "Unable to create webhook test payload"),
  });

  const scopes = integrations.data?.scopes ?? [];
  const webhookEvents = integrations.data?.webhookEvents ?? [];
  const apiTokens = integrations.data?.apiTokens ?? [];
  const webhooks = integrations.data?.webhooks ?? [];
  const apiTokenRateLimit = integrations.data?.apiTokenRateLimit ?? null;
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
    if (!webhook.isEnabled) return { label: isSpanish ? "DESACTIVADO" : "DISABLED", className: "status-muted" };
    if (webhook.failureCount > 0) return { label: isSpanish ? "CON FALLAS" : "FAILING", className: "status-danger" };
    if ((webhook.deliveryAttemptCount ?? 0) === 0) return { label: isSpanish ? "LISTO" : "READY", className: "status-info" };
    return { label: isSpanish ? "SALUDABLE" : "HEALTHY", className: "status-active" };
  };

  const formatDate = (value: string | null) => formatDateTime(value);
  const healthStatusEntries = webhookHealthDetails.data
    ? webhookStatusOrder
      .filter((status) => Number(webhookHealthDetails.data?.health.statusCounts[status] ?? 0) > 0)
      .map((status) => ({ status, count: Number(webhookHealthDetails.data?.health.statusCounts[status] ?? 0) }))
    : [];
  const healthEventEntries = webhookHealthDetails.data
    ? Object.entries(webhookHealthDetails.data.health.eventCounts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    : [];

  return (
    <section className="admin-card" data-testid="integrations-panel">
      <header className="admin-card-header">
        <div>
          <p className="eyebrow">{isSpanish ? "Admin" : "Admin"}</p>
          <h2>{isSpanish ? "Integraciones" : "Integrations"}</h2>
        </div>
        <span className="subtitle">{isSpanish ? "Cree tokens de API con alcance limitado y registre endpoints de webhook para entregas futuras." : "Create scoped API tokens and register webhook endpoints for future delivery."}</span>
      </header>

      {integrations.isLoading ? <StatusState title={isSpanish ? "Cargando integraciones" : "Loading integrations"} description={isSpanish ? "Cargando metadatos de tokens y webhooks." : "Loading token and webhook metadata."} /> : null}
      {errorMessage ? <div className="admin-message error">{errorMessage}</div> : null}

      <div className="admin-grid integrations-grid">
        <section className="admin-section">
          <h3>{isSpanish ? "Crear token de API" : "Create API Token"}</h3>
          <p className="helper-text">{isSpanish ? "Los tokens se muestran una sola vez. Guárdelos en un administrador de contraseñas o almacén seguro de despliegue." : "Tokens are shown once. Store them in a password manager or deployment secret store."}</p>
          {createdToken ? (
            <div className="admin-message success">
              <strong>{isSpanish ? "Nuevo token, se muestra una sola vez:" : "New token, shown once:"}</strong>
              <input data-testid="api-token-once" readOnly value={createdToken} onFocus={(event) => event.currentTarget.select()} />
            </div>
          ) : null}
          <label>
            {isSpanish ? "Nombre del token" : "Token name"}
            <input
              data-testid="api-token-name"
              value={tokenState.name}
              onChange={(event) => setTokenState((current) => ({ ...current, name: event.target.value }))}
              placeholder={isSpanish ? "Adaptador de reportes" : "Reporting adapter"}
            />
          </label>
          <div className="property-access-block">
            <p className="section-label">{isSpanish ? "Permisos" : "Scopes"}</p>
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
            <p className="section-label">{isSpanish ? "Alcance por propiedad" : "Property scope"}</p>
            <p className="helper-text">{isSpanish ? "Déjelo vacío para incluir todas las propiedades permitidas para el administrador que lo crea." : "Leave empty for all properties allowed to the creating admin."}</p>
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
            {isSpanish ? "Crear token de API" : "Create API Token"}
          </button>
        </section>

        <section className="admin-section">
          <h3>{isSpanish ? "Registrar webhook" : "Register Webhook"}</h3>
          <p className="helper-text">{isSpanish ? "Los endpoints webhook pueden poner en cola cargas firmadas para el ejecutor explícito `run-webhooks.sh`." : "Webhook endpoints can queue signed payloads for the explicit run-webhooks.sh delivery runner."}</p>
          {createdWebhookSecret ? (
            <div className="admin-message success">
              <strong>{isSpanish ? "Secreto del webhook, se muestra una sola vez:" : "Webhook secret, shown once:"}</strong>
              <input data-testid="webhook-secret-once" readOnly value={createdWebhookSecret} onFocus={(event) => event.currentTarget.select()} />
            </div>
          ) : null}
          <label>
            {isSpanish ? "Nombre del webhook" : "Webhook name"}
            <input
              data-testid="webhook-name"
              value={webhookState.name}
              onChange={(event) => setWebhookState((current) => ({ ...current, name: event.target.value }))}
              placeholder={isSpanish ? "Receptor de eventos operativos" : "Ops event receiver"}
            />
          </label>
          <label>
            {isSpanish ? "URL del endpoint" : "Endpoint URL"}
            <input
              data-testid="webhook-url"
              value={webhookState.url}
              onChange={(event) => setWebhookState((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://example.com/makereadyos/webhooks"
            />
          </label>
          <div className="property-access-block">
            <p className="section-label">{isSpanish ? "Eventos" : "Events"}</p>
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
            <p className="section-label">{isSpanish ? "Alcance por propiedad" : "Property scope"}</p>
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
            {isSpanish ? "Registrar webhook" : "Register Webhook"}
          </button>
        </section>
      </div>

      <section className="admin-section integration-list">
        <div className="admin-section-head">
          <div>
            <h3>{isSpanish ? "Tokens de API" : "API Tokens"}</h3>
            {apiTokenRateLimit ? (
              <p className="helper-text">
                {isSpanish ? "Límite compartido: " : "Shared rate limit: "}{apiTokenRateLimit.max} {isSpanish ? "solicitudes" : "requests"} / {apiTokenRateLimit.windowMinutes} {isSpanish ? `minuto${apiTokenRateLimit.windowMinutes === 1 ? "" : "s"}` : `minute${apiTokenRateLimit.windowMinutes === 1 ? "" : "s"}`} {isSpanish ? "por token." : "per token."}
              </p>
            ) : null}
          </div>
          <span className="subtitle">{activeTokenCount} {isSpanish ? "activos" : "active"}</span>
        </div>
        {apiTokens.length === 0 ? (
          <div className="admin-empty-state">{isSpanish ? "No se han creado tokens de API." : "No API tokens have been created."}</div>
        ) : (
          apiTokens.map((token) => (
            <div key={token.id} className="integration-row" data-testid="api-token-row">
              <div>
                <strong>{token.name}</strong>
                <p className="helper-text">
                  {token.tokenPrefix}...{token.tokenLastFour} · {token.scopes.join(", ")} · {token.properties.length ? token.properties.map((property) => property.code).join(", ") : isSpanish ? "todas las propiedades" : "all properties"}
                </p>
                <p className="helper-text">
                  {isSpanish ? "Usos" : "Uses"}: {token.useCount} · {isSpanish ? "Último uso" : "Last used"}: {formatDate(token.lastUsedAt)}
                  {token.lastUsedMethod && token.lastUsedPath ? ` · ${token.lastUsedMethod} ${token.lastUsedPath}` : ""}
                </p>
              </div>
              <div className="row-actions">
                <span className={`status-pill ${token.isActive ? "status-active" : "status-muted"}`}>{token.isActive ? (isSpanish ? "ACTIVO" : "ACTIVE") : (isSpanish ? "REVOCADO" : "REVOKED")}</span>
                {token.isActive ? (
                  <button
                    className="button button-danger"
                    onClick={() => setConfirm({ type: "token", id: token.id, label: token.name })}
                  >
                    {isSpanish ? "Revocar" : "Revoke"}
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="admin-section integration-list">
        <div className="admin-section-head">
          <h3>{isSpanish ? "Webhooks" : "Webhooks"}</h3>
          <span className="subtitle">{isSpanish ? "Entrega" : "Delivery"}: {integrations.data?.webhookDelivery ?? (isSpanish ? "preparado" : "scaffolded")}</span>
        </div>
        {webhooks.length === 0 ? (
          <div className="admin-empty-state">{isSpanish ? "No hay endpoints webhook registrados." : "No webhook endpoints are registered."}</div>
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
                      {webhook.properties.length ? webhook.properties.map((property) => property.code).join(", ") : isSpanish ? "todas las propiedades" : "all properties"}
                    </p>
                    <p className="helper-text">
                      {isSpanish ? "Última entrega" : "Last delivered"}: {formatDate(webhook.lastDeliveryAt)} · {isSpanish ? "intentos" : "attempts"} {webhook.deliveryAttemptCount ?? 0} · {isSpanish ? "fallas" : "failures"} {webhook.failureCount}
                    </p>
                  </div>
                  <div className="row-actions">
                    <span className={`status-pill ${health.className}`}>{health.label}</span>
                    <button
                      className="button button-secondary"
                      data-testid="webhook-deliveries-toggle"
                      onClick={() => setSelectedWebhookId((current) => (current === webhook.id ? null : webhook.id))}
                    >
                      {selectedWebhookId === webhook.id ? (isSpanish ? "Ocultar entregas" : "Hide deliveries") : (isSpanish ? "Ver entregas" : "View deliveries")}
                    </button>
                    <button
                      className="button"
                      disabled={busy || !webhook.isEnabled}
                      onClick={() => webhookTestMutation.mutate({ id: webhook.id, eventType: webhook.eventTypes[0], enqueue: false })}
                    >
                      {isSpanish ? "Prueba simulada" : "Dry-run test"}
                    </button>
                    <button
                      className="button button-primary"
                      disabled={busy || !webhook.isEnabled}
                      onClick={() => webhookTestMutation.mutate({ id: webhook.id, eventType: webhook.eventTypes[0], enqueue: true })}
                    >
                      {isSpanish ? "Poner prueba en cola" : "Queue test"}
                    </button>
                    {webhook.isEnabled ? (
                      <button
                        className="button button-danger"
                        onClick={() => setConfirm({ type: "webhook", id: webhook.id, label: webhook.name })}
                      >
                        {isSpanish ? "Desactivar" : "Disable"}
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
                <h4>{isSpanish ? "Entregas recientes" : "Recent deliveries"}: {selectedWebhook.name}</h4>
                <p className="helper-text">{isSpanish ? "Las cargas en cola solo se entregan cuando se ejecuta `./run-webhooks.sh`." : "Queued payloads are delivered only when `./run-webhooks.sh` runs."}</p>
              </div>
              <button className="button button-secondary" onClick={() => webhookDeliveries.refetch()} disabled={webhookDeliveries.isFetching}>
                {isSpanish ? "Actualizar" : "Refresh"}
              </button>
            </div>
            {webhookDeliveries.isLoading ? <StatusState title={isSpanish ? "Cargando entregas" : "Loading deliveries"} description={isSpanish ? "Consultando intentos recientes del webhook." : "Fetching recent webhook attempts."} /> : null}
            {webhookHealthDetails.data ? (
              <>
                <div className="webhook-health-summary" data-testid="webhook-health-summary">
                  <span>{isSpanish ? "Salud" : "Health"}: <strong>{webhookHealthDetails.data.health.state}</strong></span>
                  <span>{isSpanish ? "Pendientes" : "Pending"}: <strong>{webhookHealthDetails.data.health.pendingCount}</strong></span>
                  <span>{isSpanish ? "Intentos totales" : "Total attempts"}: <strong>{webhookHealthDetails.data.health.total}</strong></span>
                  <span>{isSpanish ? "Fallas" : "Failures"}: <strong>{webhookHealthDetails.data.health.failureCount}</strong></span>
                  {webhookHealthDetails.data.health.oldestPendingAt ? <span>{isSpanish ? "Pendiente más antiguo" : "Oldest pending"}: {formatDate(webhookHealthDetails.data.health.oldestPendingAt)}</span> : null}
                  {webhookHealthDetails.data.health.lastDeliveryAt ? <span>{isSpanish ? "Última entrega" : "Last delivery"}: {formatDate(webhookHealthDetails.data.health.lastDeliveryAt)}</span> : null}
                </div>
                {healthStatusEntries.length ? (
                  <div className="webhook-health-grid">
                    <section className="webhook-health-card">
                      <h5>{isSpanish ? "Desglose por estado" : "Status Breakdown"}</h5>
                      <div className="webhook-chip-row">
                        {healthStatusEntries.map((entry) => (
                          <span key={entry.status} className={`status-pill ${webhookStatusPillClass(entry.status)}`}>
                            {entry.status}: {entry.count}
                          </span>
                        ))}
                      </div>
                    </section>
                    <section className="webhook-health-card">
                      <h5>{isSpanish ? "Eventos vistos" : "Events Seen"}</h5>
                      <div className="webhook-metric-list">
                        {healthEventEntries.map(([eventType, count]) => (
                          <div key={eventType} className="webhook-metric-row">
                            <strong>{eventType}</strong>
                            <span>{count}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                    {webhookHealthDetails.data.health.latestFailure ? (
                      <section className="webhook-health-card webhook-health-card-danger">
                        <h5>{isSpanish ? "Última falla" : "Latest Failure"}</h5>
                        <div className="webhook-failure-stack">
                          <strong>{webhookHealthDetails.data.health.latestFailure.eventType}</strong>
                          <span>{formatDate(webhookHealthDetails.data.health.latestFailure.updatedAt)}</span>
                          <span>{webhookHealthDetails.data.health.latestFailure.responseStatus ? `HTTP ${webhookHealthDetails.data.health.latestFailure.responseStatus}` : isSpanish ? "Sin respuesta HTTP" : "No HTTP response"}</span>
                          {webhookHealthDetails.data.health.latestFailure.errorMessage ? <p>{webhookHealthDetails.data.health.latestFailure.errorMessage}</p> : null}
                        </div>
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
            {webhookDeliveries.isError ? (
              <div className="admin-message error">{isSpanish ? "No se pudieron cargar las entregas del webhook." : "Unable to load webhook deliveries."}</div>
            ) : webhookDeliveries.data && webhookDeliveries.data.deliveries.length === 0 ? (
              <div className="admin-empty-state">{isSpanish ? "Todavía no hay intentos de entrega registrados. Use una prueba simulada o en cola para crear uno." : "No delivery attempts recorded yet. Use Dry-run test or Queue test to create one."}</div>
            ) : webhookDeliveries.data ? (
              <div className="webhook-delivery-list">
                {webhookDeliveries.data.deliveries.map((delivery) => (
                  <div key={delivery.id} className="webhook-delivery-row">
                    <div>
                      <strong>{delivery.eventType}</strong>
                      <p className="helper-text">
                        {delivery.deliveryId} · {isSpanish ? "creado" : "created"} {formatDate(delivery.createdAt)} · {isSpanish ? "intento" : "attempt"} {delivery.attemptNumber}
                      </p>
                      {delivery.errorMessage ? <p className="helper-text webhook-error-text">{delivery.errorMessage}</p> : null}
                    </div>
                    <div className="webhook-delivery-meta">
                      <span className={`status-pill status-${delivery.status.toLowerCase().replace("_", "-")}`}>{delivery.status}</span>
                      <span>{delivery.responseStatus ? `HTTP ${delivery.responseStatus}` : isSpanish ? "Sin respuesta" : "No response"}</span>
                      <span>{delivery.deliveredAt ? `${isSpanish ? "Entregado" : "Delivered"} ${formatDate(delivery.deliveredAt)}` : delivery.nextAttemptAt ? `${isSpanish ? "Reintento" : "Retry"} ${formatDate(delivery.nextAttemptAt)}` : ""}</span>
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
        language={isSpanish ? "es" : "en"}
        title={confirm?.type === "token" ? (isSpanish ? "¿Revocar token de API?" : "Revoke API token?") : (isSpanish ? "¿Desactivar webhook?" : "Disable webhook?")}
        description={confirm ? `${confirm.label} ${isSpanish ? "dejará de funcionar de inmediato." : "will stop working immediately."}` : ""}
        confirmLabel={confirm?.type === "token" ? (isSpanish ? "Revocar" : "Revoke") : (isSpanish ? "Desactivar" : "Disable")}
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
