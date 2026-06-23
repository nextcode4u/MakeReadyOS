import { useEffect, useMemo, useState } from "react";
import type { ManagedUser, MetaResponse, Property, UserLanguage, UserRole } from "../lib/api";
import { languageOptions, t, translateUserRole } from "../lib/i18n";
import { BackupTransferPanel } from "./BackupTransferPanel";
import { ConfirmDialog } from "./ConfirmDialog";
import { IntegrationsPanel } from "./IntegrationsPanel";
import { StatusState } from "./StatusState";
import { StorageSettingsPanel } from "./StorageSettingsPanel";

const roles: UserRole[] = ["ADMIN", "MANAGER", "TECH", "LEASING", "CLEANER", "VIEWER"];
const roleFilterOptions = ["ALL", ...roles] as const;
const statusFilterOptions = ["ALL", "ACTIVE", "INACTIVE"] as const;

type Props = {
  users: ManagedUser[];
  properties: Property[];
  appInfo: MetaResponse["app"] | null;
  currentUserId: string;
  language: UserLanguage;
  loading?: boolean;
  successMessage?: string;
  errorMessage?: string;
  onCreateUser: (input: {
    fullName: string;
    username: string;
    email?: string | null;
    role: UserRole;
    language: UserLanguage;
    password: string;
    isActive: boolean;
    propertyIds: string[];
    sendInviteEmail?: boolean;
  }) => Promise<void>;
  onUpdateUser: (id: string, input: {
    fullName?: string;
    username?: string;
    email?: string | null;
    role?: UserRole;
    language?: UserLanguage;
    isActive?: boolean;
  }) => Promise<void>;
  onResetPassword: (id: string, password: string) => Promise<void>;
  onDeactivateUser: (id: string) => Promise<void>;
  onUpdatePropertyAccess: (id: string, propertyIds: string[]) => Promise<void>;
  onBackupImported: () => Promise<void>;
};

function propertyIdsForUser(user: ManagedUser) {
  return user.propertyAccess.map((access) => access.propertyId);
}

export function AdminPanel({
  users,
  properties,
  appInfo,
  currentUserId,
  language,
  loading,
  successMessage,
  errorMessage,
  onCreateUser,
  onUpdateUser,
  onResetPassword,
  onDeactivateUser,
  onUpdatePropertyAccess,
  onBackupImported,
}: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<(typeof roleFilterOptions)[number]>("ALL");
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilterOptions)[number]>("ALL");
  const [createState, setCreateState] = useState({
    fullName: "",
    username: "",
    email: "",
    role: "TECH" as UserRole,
    language: "en" as UserLanguage,
    password: "",
    isActive: true,
    propertyIds: [] as string[],
    sendInviteEmail: false,
  });
  const [editState, setEditState] = useState({
    fullName: "",
    username: "",
    email: "",
    role: "TECH" as UserRole,
    language: "en" as UserLanguage,
    isActive: true,
    propertyIds: [] as string[],
    password: "",
  });
  const [confirmAction, setConfirmAction] = useState<null | "role" | "deactivate" | "password">(null);
  const [copiedCommand, setCopiedCommand] = useState<"standard" | "pull" | null>(null);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch = !search || [user.fullName, user.username, user.email ?? "", user.role]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && user.isActive) ||
        (statusFilter === "INACTIVE" && !user.isActive);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, search, statusFilter, users]);
  const activeFilteredUsers = useMemo(() => filteredUsers.filter((user) => user.isActive), [filteredUsers]);
  const inactiveFilteredUsers = useMemo(() => filteredUsers.filter((user) => !user.isActive), [filteredUsers]);

  const selectedUser = useMemo(
    () => filteredUsers.find((user) => user.id === selectedUserId)
      ?? users.find((user) => user.id === selectedUserId)
      ?? filteredUsers[0]
      ?? users[0]
      ?? null,
    [filteredUsers, selectedUserId, users],
  );

  const isSelf = selectedUser?.id === currentUserId;
  const roleChanged = Boolean(selectedUser && editState.role !== selectedUser.role);
  const propertyAccessChanged = Boolean(
    selectedUser
    && propertyIdsForUser(selectedUser).sort().join("|") !== [...editState.propertyIds].sort().join("|"),
  );

  useEffect(() => {
    if (!selectedUserId && filteredUsers[0]) {
      setSelectedUserId(filteredUsers[0].id);
    }
  }, [filteredUsers, selectedUserId]);

  useEffect(() => {
    if (!selectedUser) {
      return;
    }

    setEditState({
      fullName: selectedUser.fullName,
      username: selectedUser.username,
      email: selectedUser.email ?? "",
      role: selectedUser.role,
      language: selectedUser.language,
      isActive: selectedUser.isActive,
      propertyIds: propertyIdsForUser(selectedUser),
      password: "",
    });
  }, [selectedUser]);

  const toggleCreateProperty = (propertyId: string) => {
    setCreateState((current) => ({
      ...current,
      propertyIds: current.propertyIds.includes(propertyId)
        ? current.propertyIds.filter((id) => id !== propertyId)
        : [...current.propertyIds, propertyId],
    }));
  };

  const toggleEditProperty = (propertyId: string) => {
    setEditState((current) => ({
      ...current,
      propertyIds: current.propertyIds.includes(propertyId)
        ? current.propertyIds.filter((id) => id !== propertyId)
        : [...current.propertyIds, propertyId],
    }));
  };

  const copyCommand = async (mode: "standard" | "pull") => {
    const command = mode === "pull" ? appInfo?.updatePullCommand : appInfo?.updateCommand;
    if (!command || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(command);
    setCopiedCommand(mode);
    window.setTimeout(() => setCopiedCommand((current) => (current === mode ? null : current)), 1800);
  };

  const translateRoleFilter = (option: (typeof roleFilterOptions)[number]) => {
    if (option === "ALL") return t(language, "admin.allRoles");
    return translateUserRole(language, option);
  };

  const translateStatusFilter = (option: (typeof statusFilterOptions)[number]) => {
    if (option === "ALL") return t(language, "admin.allStatuses");
    if (option === "ACTIVE") return t(language, "admin.activeOnly");
    return t(language, "admin.inactiveOnly");
  };

  const renderUserTable = (userList: ManagedUser[]) => (
    <div className="admin-user-table-wrap">
      <table className="admin-user-table">
        <thead>
          <tr>
            <th>{t(language, "admin.name")}</th>
            <th>{t(language, "admin.username")}</th>
            <th>{t(language, "admin.email")}</th>
            <th>{t(language, "admin.role")}</th>
            <th>{t(language, "language.label")}</th>
            <th>{t(language, "admin.status")}</th>
          </tr>
        </thead>
        <tbody>
          {userList.map((user) => (
            <tr
              key={user.id}
              data-testid={`admin-user-row-${user.username.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`}
              className={selectedUser?.id === user.id ? "selected" : ""}
              onClick={() => setSelectedUserId(user.id)}
            >
              <td>{user.fullName}{user.id === currentUserId ? ` (${t(language, "admin.you")})` : ""}</td>
              <td>{user.username}</td>
              <td>{user.email || t(language, "admin.noEmail")}</td>
              <td>{translateUserRole(language, user.role)}</td>
              <td>{languageOptions.find((option) => option.value === user.language)?.nativeLabel ?? user.language}</td>
              <td>
                <span className={user.isActive ? "status-chip active" : "status-chip inactive"}>
                  {user.isActive ? t(language, "admin.active") : t(language, "admin.inactive")}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="admin-shell" data-testid="admin-panel">
      <section className="admin-card">
        <header className="admin-card-header">
          <div>
            <p className="eyebrow">Admin</p>
            <h2>{t(language, "admin.userManagement")}</h2>
          </div>
          <span className="subtitle">{t(language, "admin.userManagementCopy")}</span>
        </header>

        {successMessage ? <div className="admin-message success">{successMessage}</div> : null}
        {errorMessage ? <div className="admin-message error">{errorMessage}</div> : null}

        <div className="admin-grid">
          <section className="admin-section">
            <h3>{t(language, "admin.createUser")}</h3>
            <div className="admin-form-grid">
              <label>
                {t(language, "admin.fullName")}
                <input
                  data-testid="admin-create-full-name"
                  value={createState.fullName}
                  onChange={(event) => setCreateState((current) => ({ ...current, fullName: event.target.value }))}
                />
              </label>
              <label>
                {t(language, "admin.username")}
                <input
                  data-testid="admin-create-username"
                  value={createState.username}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) => setCreateState((current) => ({ ...current, username: event.target.value }))}
                />
                <span className="field-help">{t(language, "admin.usernameHelp")}</span>
              </label>
              <label>
                {t(language, "auth.email")}
                <input
                  data-testid="admin-create-email"
                  type="email"
                  value={createState.email}
                  onChange={(event) => setCreateState((current) => {
                    const email = event.target.value;
                    return {
                      ...current,
                      email,
                      sendInviteEmail: email.trim() ? current.sendInviteEmail : false,
                    };
                  })}
                />
              </label>
              <label>
                {t(language, "admin.role")}
                <select
                  data-testid="admin-create-role"
                  value={createState.role}
                  onChange={(event) => setCreateState((current) => ({ ...current, role: event.target.value as UserRole }))}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {translateUserRole(language, role)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t(language, "auth.password")}
                <input
                  data-testid="admin-create-password"
                  type="password"
                  value={createState.password}
                  onChange={(event) => setCreateState((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
              <label>
                {t(language, "language.label")}
                <select
                  data-testid="admin-create-language"
                  value={createState.language}
                  onChange={(event) => setCreateState((current) => ({ ...current, language: event.target.value as UserLanguage }))}
                >
                  {languageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.nativeLabel}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="toggle-row">
              <input
                data-testid="admin-create-active"
                type="checkbox"
                checked={createState.isActive}
                onChange={(event) => setCreateState((current) => ({ ...current, isActive: event.target.checked }))}
              />
              {t(language, "admin.activeAccount")}
            </label>

            <label className="toggle-row" title={t(language, "admin.sendInviteEmailHelp")}>
              <input
                data-testid="admin-create-send-invite"
                type="checkbox"
                checked={createState.sendInviteEmail}
                disabled={!createState.email.trim()}
                onChange={(event) => setCreateState((current) => ({ ...current, sendInviteEmail: event.target.checked }))}
              />
              {t(language, "admin.sendInviteEmail")}
            </label>

            <div className="property-access-block">
              <p className="section-label">{t(language, "admin.propertyAccess")}</p>
              {properties.length === 0 ? (
                <div className="admin-empty-state">{t(language, "admin.noActivePropertiesForAssignment")}</div>
              ) : (
                <div className="checkbox-grid">
                  {properties.map((property) => (
                    <label key={property.id} className="checkbox-pill">
                      <input
                        data-testid={`admin-create-property-${property.code}`}
                        type="checkbox"
                        checked={createState.propertyIds.includes(property.id)}
                        disabled={createState.role === "ADMIN"}
                        onChange={() => toggleCreateProperty(property.id)}
                      />
                      <span>{property.code}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              data-testid="admin-create-user-button"
              className="button button-primary"
              disabled={loading}
              onClick={() => onCreateUser(createState).then(() => {
                setCreateState({
                  fullName: "",
                  username: "",
                  email: "",
                  role: "TECH",
                  language: "en",
                  password: "",
                  isActive: true,
                  propertyIds: [],
                  sendInviteEmail: false,
                });
              })}
            >
              {t(language, "admin.createUserButton")}
            </button>
          </section>

          <section className="admin-section">
            <div className="admin-section-head">
              <h3>{t(language, "admin.users")}</h3>
              <span className="subtitle">{filteredUsers.length} shown · {users.length} total</span>
            </div>

            <div className="admin-filter-grid">
              <input data-testid="admin-user-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(language, "admin.searchUsersPlaceholder")} />
              <select data-testid="admin-role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as (typeof roleFilterOptions)[number])}>
                {roleFilterOptions.map((option) => (
                  <option key={option} value={option}>
                    {translateRoleFilter(option)}
                  </option>
                ))}
              </select>
              <select data-testid="admin-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as (typeof statusFilterOptions)[number])}>
                {statusFilterOptions.map((option) => (
                  <option key={option} value={option}>
                    {translateStatusFilter(option)}
                  </option>
                ))}
              </select>
            </div>

            {filteredUsers.length === 0 ? (
              <StatusState title={t(language, "admin.noMatchingUsers")} description={t(language, "admin.noMatchingUsersCopy")} tone="subtle" />
            ) : (
              <div className="stack gap-sm">
                <div className="section-header">
                  <strong>{t(language, "admin.activeOnly")}</strong>
                  <span className="muted">{activeFilteredUsers.length}</span>
                </div>
                {activeFilteredUsers.length ? renderUserTable(activeFilteredUsers) : <p className="muted">{language === "es" ? "Ningún usuario activo coincide con los filtros." : "No active users match these filters."}</p>}
                {inactiveFilteredUsers.length ? (
                  <div className="stack gap-sm" style={{ marginTop: 16 }}>
                    <div className="section-header">
                      <strong>{t(language, "admin.inactiveOnly")}</strong>
                      <span className="muted">{inactiveFilteredUsers.length}</span>
                    </div>
                    {renderUserTable(inactiveFilteredUsers)}
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>

        {selectedUser ? (
          <section className="admin-section admin-editor">
            <div className="admin-section-head">
              <h3>{t(language, "admin.editUser")}</h3>
              <span className="subtitle">{selectedUser.username}</span>
            </div>

            {isSelf ? (
              <div className="admin-message warning">
                {t(language, "admin.selfWarning")}
              </div>
            ) : null}

            <div className="admin-form-grid">
              <label>
                {t(language, "admin.fullName")}
                <input
                  data-testid="admin-edit-full-name"
                  value={editState.fullName}
                  onChange={(event) => setEditState((current) => ({ ...current, fullName: event.target.value }))}
                />
              </label>
              <label>
                {t(language, "admin.username")}
                <input
                  data-testid="admin-edit-username"
                  value={editState.username}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) => setEditState((current) => ({ ...current, username: event.target.value }))}
                />
                <span className="field-help">{t(language, "admin.usernameHelp")}</span>
              </label>
              <label>
                {t(language, "auth.email")}
                <input
                  data-testid="admin-edit-email"
                  type="email"
                  value={editState.email ?? ""}
                  onChange={(event) => setEditState((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label>
                {t(language, "admin.role")}
                <select
                  data-testid="admin-edit-role"
                  value={editState.role}
                  disabled={isSelf}
                  onChange={(event) => setEditState((current) => ({ ...current, role: event.target.value as UserRole }))}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {translateUserRole(language, role)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t(language, "language.label")}
                <select
                  data-testid="admin-edit-language"
                  value={editState.language}
                  onChange={(event) => setEditState((current) => ({ ...current, language: event.target.value as UserLanguage }))}
                >
                  {languageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.nativeLabel}
                    </option>
                  ))}
                </select>
                <span className="field-help">{t(language, "admin.languageHelp")}</span>
              </label>
              <label className="toggle-row">
                <input
                  data-testid="admin-edit-active"
                  type="checkbox"
                  checked={editState.isActive}
                  disabled={isSelf}
                  onChange={(event) => setEditState((current) => ({ ...current, isActive: event.target.checked }))}
                />
                {t(language, "admin.activeAccount")}
              </label>
            </div>

            <div className="admin-actions">
              <button
                data-testid="admin-save-user-button"
                className="button button-primary"
                disabled={loading}
                onClick={async () => {
                  if (selectedUser && roleChanged) {
                    setConfirmAction("role");
                    return;
                  }
                  await onUpdateUser(selectedUser.id, {
                    fullName: editState.fullName,
                    username: editState.username,
                    email: editState.email,
                    role: editState.role,
                    language: editState.language,
                    isActive: editState.isActive,
                  });
                }}
              >
                {t(language, "admin.saveUser")}
              </button>

              {selectedUser.isActive ? (
                <button
                  data-testid="admin-deactivate-user-button"
                  className="button button-danger"
                  disabled={loading || isSelf}
                  onClick={() => setConfirmAction("deactivate")}
                >
                  {t(language, "admin.deactivateUser")}
                </button>
              ) : (
                <button
                  data-testid="admin-reactivate-user-button"
                  className="button button-secondary"
                  disabled={loading}
                  onClick={async () => {
                    await onUpdateUser(selectedUser.id, { isActive: true });
                  }}
                >
                  {t(language, "admin.reactivateUser")}
                </button>
              )}
            </div>

            <div className="property-access-block">
              <p className="section-label">{t(language, "admin.propertyAccess")}</p>
              {properties.length === 0 ? (
                <div className="admin-empty-state">{t(language, "admin.noPropertiesForAssignment")}</div>
              ) : (
                <div className="checkbox-grid">
                  {properties.map((property) => (
                    <label key={property.id} className="checkbox-pill">
                      <input
                        data-testid={`admin-edit-property-${property.code}`}
                        type="checkbox"
                        checked={editState.propertyIds.includes(property.id)}
                        disabled={editState.role === "ADMIN"}
                        onChange={() => toggleEditProperty(property.id)}
                      />
                      <span>{property.code}</span>
                    </label>
                  ))}
                </div>
              )}
              <button
                data-testid="admin-save-property-access-button"
                className="button button-secondary"
                disabled={loading || editState.role === "ADMIN" || !propertyAccessChanged}
                onClick={() => selectedUser && onUpdatePropertyAccess(selectedUser.id, editState.propertyIds)}
              >
                {t(language, "admin.savePropertyAccess")}
              </button>
            </div>

            <div className="property-access-block">
              <p className="section-label">{t(language, "admin.resetPassword")}</p>
              <div className="admin-inline-form">
                <input
                  data-testid="admin-reset-password-input"
                  type="password"
                  value={editState.password}
                  onChange={(event) => setEditState((current) => ({ ...current, password: event.target.value }))}
                  placeholder={t(language, "admin.enterStrongPassword")}
                />
                <button
                  data-testid="admin-reset-password-button"
                  className="button button-secondary"
                  disabled={loading || !editState.password}
                  onClick={() => setConfirmAction("password")}
                >
                  {t(language, "admin.resetPasswordButton")}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="admin-section">
            <StatusState title={t(language, "admin.noUserSelected")} description={t(language, "admin.noUserSelectedCopy")} tone="subtle" />
          </section>
        )}
      </section>

      <section className="admin-card" data-testid="admin-updates-panel">
        <header className="admin-card-header">
          <div>
            <p className="eyebrow">{language === "es" ? "Actualizaciones" : "Updates"}</p>
            <h2>{language === "es" ? "Actualizaciones de despliegue" : "Deployment updates"}</h2>
          </div>
          <span className="subtitle">{language === "es" ? "Detalles de la instalacion actual y los comandos preferidos de actualizacion del lado del servidor." : "Current install details and the preferred server-side update commands."}</span>
        </header>

        <div className="admin-grid">
          <section className="admin-section">
            <h3>{language === "es" ? "Build instalado" : "Installed build"}</h3>
            <div className="admin-form-grid">
              <label>
                {language === "es" ? "Version instalada" : "Installed version"}
                <input value={appInfo?.version ?? (language === "es" ? "Desconocida" : "Unknown")} readOnly />
              </label>
              <label>
                {language === "es" ? "Canal de lanzamiento" : "Release channel"}
                <input value={appInfo?.releaseChannel ?? (language === "es" ? "Desconocido" : "Unknown")} readOnly />
              </label>
              <label>
                {language === "es" ? "Referencia del build" : "Build ref"}
                <input value={appInfo?.buildRef ?? (language === "es" ? "No capturada" : "Not captured")} readOnly />
              </label>
              <label>
                {language === "es" ? "Fecha del build" : "Build date"}
                <input value={appInfo?.buildDate ?? (language === "es" ? "No capturada" : "Not captured")} readOnly />
              </label>
            </div>
            <div className="admin-message warning">
              {language === "es"
                ? "MakeReadyOS todavia se actualiza desde el servidor host, no desde una accion de navegador de un clic. Este panel mantiene visible la version actual y da a los administradores los comandos exactos para ejecutar."
                : "MakeReadyOS still updates from the host server, not from a one-click browser action. This panel keeps the current version visible and gives admins the exact commands to run."}
            </div>
            {appInfo?.latestRelease ? (
              <div className={appInfo.latestRelease.updateAvailable ? "admin-message warning" : "admin-message success"}>
                {appInfo.latestRelease.updateAvailable
                  ? (language === "es"
                    ? `La ultima version publicada ${appInfo.latestRelease.tag} es mas nueva que esta instalacion.`
                    : `Latest published release ${appInfo.latestRelease.tag} is newer than this install.`)
                  : (language === "es"
                    ? `Esta instalacion coincide con la ultima version publicada ${appInfo.latestRelease.tag}.`
                    : `This install matches the latest published release ${appInfo.latestRelease.tag}.`)}
                {appInfo.latestRelease.publishedAt ? (language === "es" ? ` Publicada ${new Date(appInfo.latestRelease.publishedAt).toLocaleString()}.` : ` Published ${new Date(appInfo.latestRelease.publishedAt).toLocaleString()}.`) : ""}
                {appInfo.latestRelease.url ? <> <a href={appInfo.latestRelease.url} target="_blank" rel="noreferrer">{language === "es" ? "Abrir pagina de lanzamiento" : "Open release page"}</a>.</> : null}
              </div>
            ) : null}
            <h3>{language === "es" ? "Diagnosticos de origen" : "Origin diagnostics"}</h3>
            <div className="admin-form-grid">
              <label>
                APP_URL
                <input value={appInfo?.deployment.appUrl ?? (language === "es" ? "No configurada" : "Not configured")} readOnly />
              </label>
              <label>
                {language === "es" ? "Origen actual" : "Current origin"}
                <input value={appInfo?.deployment.currentOrigin ?? (language === "es" ? "No disponible" : "Unavailable")} readOnly />
              </label>
              <label>
                {language === "es" ? "Entorno" : "Environment"}
                <input value={appInfo?.deployment.environment ?? (language === "es" ? "Desconocido" : "Unknown")} readOnly />
              </label>
              <label>
                {language === "es" ? "Proxy confiable" : "Trusted proxy"}
                <input value={appInfo?.deployment.trustedProxy ? (language === "es" ? "Habilitado" : "Enabled") : (language === "es" ? "Deshabilitado" : "Disabled")} readOnly />
              </label>
              <label>
                {language === "es" ? "Cookies seguras" : "Secure cookies"}
                <input value={appInfo?.deployment.secureCookies ? (language === "es" ? "Habilitadas" : "Enabled") : (language === "es" ? "Deshabilitadas" : "Disabled")} readOnly />
              </label>
              <label>
                {language === "es" ? "Dominio de cookie" : "Cookie domain"}
                <input value={appInfo?.deployment.cookieDomain ?? (language === "es" ? "Solo host" : "Host-only")} readOnly />
              </label>
            </div>
            <div className="admin-message success">
              {language === "es" ? "Origenes permitidos:" : "Allowed origins:"} <code>{appInfo?.deployment.allowedOrigins.join(", ") || (language === "es" ? "Ninguno" : "None")}</code>
            </div>
            {appInfo?.deployment.extraAllowedOrigins.length ? (
              <div className="admin-message success">
                {language === "es" ? "Origenes adicionales permitidos:" : "Extra allowed origins:"} <code>{appInfo.deployment.extraAllowedOrigins.join(", ")}</code>
              </div>
            ) : null}
            {appInfo?.deployment.startupWarnings.length ? (
              <div className="admin-message warning">
                {appInfo.deployment.startupWarnings.join(" ")}
              </div>
            ) : null}
          </section>

          <section className="admin-section">
            <h3>{language === "es" ? "Comandos preferidos" : "Preferred commands"}</h3>
            <div className="admin-inline-form">
              <code className="admin-command-block">{appInfo?.updateCommand ?? "./update.sh --yes"}</code>
              <button type="button" className="button button-secondary" onClick={() => void copyCommand("standard")}>
                {copiedCommand === "standard" ? (language === "es" ? "Copiado" : "Copied") : (language === "es" ? "Copiar comando" : "Copy command")}
              </button>
            </div>
            <div className="admin-inline-form">
              <code className="admin-command-block">{appInfo?.updatePullCommand ?? "./update.sh --pull --yes"}</code>
              <button type="button" className="button button-secondary" onClick={() => void copyCommand("pull")}>
                {copiedCommand === "pull" ? (language === "es" ? "Copiado" : "Copied") : (language === "es" ? "Copiar pull-latest" : "Copy pull-latest")}
              </button>
            </div>
            <p className="subtitle">{language === "es" ? "Usa el primer comando para un checkout ya actualizado. Usa la variante con pull cuando esta instalacion deba obtener los ultimos cambios de `main` antes de reconstruir." : "Use the first command for an already-updated checkout. Use the pull variant when this install should fetch the latest `main` changes before rebuilding."}</p>
            <div className="admin-message success">
              {language === "es" ? "Guia de despliegue:" : "Deployment guide:"} <code>{appInfo?.deploymentDocsPath ?? "docs/DEPLOYMENT.md"}</code>
            </div>
          </section>
        </div>
      </section>

      <IntegrationsPanel properties={properties} language={language} />
      <StorageSettingsPanel language={language} />
      <BackupTransferPanel onImported={onBackupImported} language={language} />

      <ConfirmDialog
        open={confirmAction === "role" && Boolean(selectedUser)}
        language={language}
        title={language === "es" ? "Confirmar cambio de rol" : "Confirm role change"}
        description={language === "es"
          ? `Cambiar a ${selectedUser?.fullName ?? "este usuario"} de ${selectedUser?.role ?? "su rol actual"} a ${editState.role}?`
          : `Change ${selectedUser?.fullName ?? "this user"} from ${selectedUser?.role ?? "their current role"} to ${editState.role}?`}
        confirmLabel={language === "es" ? "Cambiar rol" : "Change role"}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (!selectedUser) {
            return;
          }
          await onUpdateUser(selectedUser.id, {
            fullName: editState.fullName,
            email: editState.email,
            username: editState.username,
            role: editState.role,
            language: editState.language,
            isActive: editState.isActive,
          });
          setConfirmAction(null);
        }}
      />

      <ConfirmDialog
        open={confirmAction === "deactivate" && Boolean(selectedUser)}
        language={language}
        title={language === "es" ? "Desactivar usuario" : "Deactivate user"}
        description={language === "es"
          ? `Desactivar a ${selectedUser?.fullName ?? "este usuario"}? Esto es una eliminacion suave y los futuros inicios de sesion se bloquearan hasta reactivarlo.`
          : `Deactivate ${selectedUser?.fullName ?? "this user"}? This is a soft delete and future sign-ins will be blocked until reactivated.`}
        confirmLabel={language === "es" ? "Desactivar usuario" : "Deactivate user"}
        tone="danger"
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (!selectedUser) {
            return;
          }
          await onDeactivateUser(selectedUser.id);
          setConfirmAction(null);
        }}
      />

      <ConfirmDialog
        open={confirmAction === "password" && Boolean(selectedUser)}
        language={language}
        title={language === "es" ? "Restablecer contrasena" : "Reset password"}
        description={language === "es"
          ? `Restablecer la contrasena de ${selectedUser?.fullName ?? "este usuario"}? Las sesiones existentes seran revocadas.`
          : `Reset the password for ${selectedUser?.fullName ?? "this user"}? Existing sessions will be revoked.`}
        confirmLabel={language === "es" ? "Restablecer contrasena" : "Reset password"}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (!selectedUser) {
            return;
          }
          await onResetPassword(selectedUser.id, editState.password);
          setEditState((current) => ({ ...current, password: "" }));
          setConfirmAction(null);
        }}
      />
    </div>
  );
}
