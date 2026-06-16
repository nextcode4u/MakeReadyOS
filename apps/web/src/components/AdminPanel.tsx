import { useEffect, useMemo, useState } from "react";
import type { ManagedUser, MetaResponse, Property, UserLanguage, UserRole } from "../lib/api";
import { languageOptions, t } from "../lib/i18n";
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
  loading?: boolean;
  successMessage?: string;
  errorMessage?: string;
  onCreateUser: (input: {
    fullName: string;
    email: string;
    role: UserRole;
    language: UserLanguage;
    password: string;
    isActive: boolean;
    propertyIds: string[];
  }) => Promise<void>;
  onUpdateUser: (id: string, input: {
    fullName?: string;
    email?: string;
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
    email: "",
    role: "TECH" as UserRole,
    language: "en" as UserLanguage,
    password: "",
    isActive: true,
    propertyIds: [] as string[],
  });
  const [editState, setEditState] = useState({
    fullName: "",
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
      const matchesSearch = !search || [user.fullName, user.email, user.role]
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
      email: selectedUser.email,
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

  return (
    <div className="admin-shell" data-testid="admin-panel">
      <section className="admin-card">
        <header className="admin-card-header">
          <div>
            <p className="eyebrow">Admin</p>
            <h2>{t(createState.language, "admin.userManagement")}</h2>
          </div>
          <span className="subtitle">{t(createState.language, "admin.userManagementCopy")}</span>
        </header>

        {successMessage ? <div className="admin-message success">{successMessage}</div> : null}
        {errorMessage ? <div className="admin-message error">{errorMessage}</div> : null}

        <div className="admin-grid">
          <section className="admin-section">
            <h3>{t(createState.language, "admin.createUser")}</h3>
            <div className="admin-form-grid">
              <label>
                {t(createState.language, "admin.fullName")}
                <input
                  data-testid="admin-create-full-name"
                  value={createState.fullName}
                  onChange={(event) => setCreateState((current) => ({ ...current, fullName: event.target.value }))}
                />
              </label>
              <label>
                {t(createState.language, "auth.email")}
                <input
                  data-testid="admin-create-email"
                  type="email"
                  value={createState.email}
                  onChange={(event) => setCreateState((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label>
                {t(createState.language, "admin.role")}
                <select
                  data-testid="admin-create-role"
                  value={createState.role}
                  onChange={(event) => setCreateState((current) => ({ ...current, role: event.target.value as UserRole }))}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t(createState.language, "auth.password")}
                <input
                  data-testid="admin-create-password"
                  type="password"
                  value={createState.password}
                  onChange={(event) => setCreateState((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
              <label>
                {t(createState.language, "language.label")}
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
              {t(createState.language, "admin.activeAccount")}
            </label>

            <div className="property-access-block">
              <p className="section-label">{t(createState.language, "admin.propertyAccess")}</p>
              {properties.length === 0 ? (
                <div className="admin-empty-state">No active properties are available for assignment yet.</div>
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
                  email: "",
                  role: "TECH",
                  language: "en",
                  password: "",
                  isActive: true,
                  propertyIds: [],
                });
              })}
            >
              {t(createState.language, "admin.createUserButton")}
            </button>
          </section>

          <section className="admin-section">
            <div className="admin-section-head">
              <h3>{t(createState.language, "admin.users")}</h3>
              <span className="subtitle">{filteredUsers.length} shown · {users.length} total</span>
            </div>

            <div className="admin-filter-grid">
              <input data-testid="admin-user-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, or role" />
              <select data-testid="admin-role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as (typeof roleFilterOptions)[number])}>
                {roleFilterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "ALL" ? "All roles" : option}
                  </option>
                ))}
              </select>
              <select data-testid="admin-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as (typeof statusFilterOptions)[number])}>
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active only</option>
                <option value="INACTIVE">Inactive only</option>
              </select>
            </div>

            {filteredUsers.length === 0 ? (
              <StatusState title="No matching users" description="Try widening the search or switching the active role and status filters." tone="subtle" />
            ) : (
              <div className="admin-user-table-wrap">
                <table className="admin-user-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>{t(createState.language, "language.label")}</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        data-testid={`admin-user-row-${user.email.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`}
                        className={selectedUser?.id === user.id ? "selected" : ""}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <td>{user.fullName}{user.id === currentUserId ? " (You)" : ""}</td>
                        <td>{user.email}</td>
                        <td>{user.role}</td>
                        <td>{languageOptions.find((option) => option.value === user.language)?.nativeLabel ?? user.language}</td>
                        <td>
                          <span className={user.isActive ? "status-chip active" : "status-chip inactive"}>
                            {user.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {selectedUser ? (
          <section className="admin-section admin-editor">
            <div className="admin-section-head">
              <h3>{t(editState.language, "admin.editUser")}</h3>
              <span className="subtitle">{selectedUser.email}</span>
            </div>

            {isSelf ? (
              <div className="admin-message warning">
                Your own account cannot be deactivated here, and your role cannot be changed from this panel.
              </div>
            ) : null}

            <div className="admin-form-grid">
              <label>
                {t(editState.language, "admin.fullName")}
                <input
                  data-testid="admin-edit-full-name"
                  value={editState.fullName}
                  onChange={(event) => setEditState((current) => ({ ...current, fullName: event.target.value }))}
                />
              </label>
              <label>
                {t(editState.language, "auth.email")}
                <input
                  data-testid="admin-edit-email"
                  type="email"
                  value={editState.email}
                  onChange={(event) => setEditState((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label>
                {t(editState.language, "admin.role")}
                <select
                  data-testid="admin-edit-role"
                  value={editState.role}
                  disabled={isSelf}
                  onChange={(event) => setEditState((current) => ({ ...current, role: event.target.value as UserRole }))}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t(editState.language, "language.label")}
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
                <span className="field-help">{t(editState.language, "admin.languageHelp")}</span>
              </label>
              <label className="toggle-row">
                <input
                  data-testid="admin-edit-active"
                  type="checkbox"
                  checked={editState.isActive}
                  disabled={isSelf}
                  onChange={(event) => setEditState((current) => ({ ...current, isActive: event.target.checked }))}
                />
                {t(editState.language, "admin.activeAccount")}
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
                    email: editState.email,
                    role: editState.role,
                    language: editState.language,
                    isActive: editState.isActive,
                  });
                }}
              >
                {t(editState.language, "admin.saveUser")}
              </button>

              {selectedUser.isActive ? (
                <button
                  data-testid="admin-deactivate-user-button"
                  className="button button-danger"
                  disabled={loading || isSelf}
                  onClick={() => setConfirmAction("deactivate")}
                >
                  Deactivate User
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
                  Reactivate User
                </button>
              )}
            </div>

            <div className="property-access-block">
              <p className="section-label">{t(editState.language, "admin.propertyAccess")}</p>
              {properties.length === 0 ? (
                <div className="admin-empty-state">No properties are available for assignment.</div>
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
                Save Property Access
              </button>
            </div>

            <div className="property-access-block">
              <p className="section-label">Reset password</p>
              <div className="admin-inline-form">
                <input
                  data-testid="admin-reset-password-input"
                  type="password"
                  value={editState.password}
                  onChange={(event) => setEditState((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Enter a strong new password"
                />
                <button
                  data-testid="admin-reset-password-button"
                  className="button button-secondary"
                  disabled={loading || !editState.password}
                  onClick={() => setConfirmAction("password")}
                >
                  Reset Password
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="admin-section">
            <StatusState title="No user selected" description="Pick a user from the table or create a new account to start editing access and role settings." tone="subtle" />
          </section>
        )}
      </section>

      <section className="admin-card" data-testid="admin-updates-panel">
        <header className="admin-card-header">
          <div>
            <p className="eyebrow">Updates</p>
            <h2>Deployment updates</h2>
          </div>
          <span className="subtitle">Current install details and the preferred server-side update commands.</span>
        </header>

        <div className="admin-grid">
          <section className="admin-section">
            <h3>Installed build</h3>
            <div className="admin-form-grid">
              <label>
                Installed version
                <input value={appInfo?.version ?? "Unknown"} readOnly />
              </label>
              <label>
                Release channel
                <input value={appInfo?.releaseChannel ?? "Unknown"} readOnly />
              </label>
              <label>
                Build ref
                <input value={appInfo?.buildRef ?? "Not captured"} readOnly />
              </label>
              <label>
                Build date
                <input value={appInfo?.buildDate ?? "Not captured"} readOnly />
              </label>
            </div>
            <div className="admin-message warning">
              MakeReadyOS still updates from the host server, not from a one-click browser action. This panel keeps the current version visible and gives admins the exact commands to run.
            </div>
            {appInfo?.latestRelease ? (
              <div className={appInfo.latestRelease.updateAvailable ? "admin-message warning" : "admin-message success"}>
                {appInfo.latestRelease.updateAvailable
                  ? `Latest published release ${appInfo.latestRelease.tag} is newer than this install.`
                  : `This install matches the latest published release ${appInfo.latestRelease.tag}.`}
                {appInfo.latestRelease.publishedAt ? ` Published ${new Date(appInfo.latestRelease.publishedAt).toLocaleString()}.` : ""}
                {appInfo.latestRelease.url ? <> <a href={appInfo.latestRelease.url} target="_blank" rel="noreferrer">Open release page</a>.</> : null}
              </div>
            ) : null}
            <h3>Origin diagnostics</h3>
            <div className="admin-form-grid">
              <label>
                APP_URL
                <input value={appInfo?.deployment.appUrl ?? "Not configured"} readOnly />
              </label>
              <label>
                Current origin
                <input value={appInfo?.deployment.currentOrigin ?? "Unavailable"} readOnly />
              </label>
              <label>
                Environment
                <input value={appInfo?.deployment.environment ?? "Unknown"} readOnly />
              </label>
              <label>
                Trusted proxy
                <input value={appInfo?.deployment.trustedProxy ? "Enabled" : "Disabled"} readOnly />
              </label>
              <label>
                Secure cookies
                <input value={appInfo?.deployment.secureCookies ? "Enabled" : "Disabled"} readOnly />
              </label>
              <label>
                Cookie domain
                <input value={appInfo?.deployment.cookieDomain ?? "Host-only"} readOnly />
              </label>
            </div>
            <div className="admin-message success">
              Allowed origins: <code>{appInfo?.deployment.allowedOrigins.join(", ") || "None"}</code>
            </div>
            {appInfo?.deployment.extraAllowedOrigins.length ? (
              <div className="admin-message success">
                Extra allowed origins: <code>{appInfo.deployment.extraAllowedOrigins.join(", ")}</code>
              </div>
            ) : null}
            {appInfo?.deployment.startupWarnings.length ? (
              <div className="admin-message warning">
                {appInfo.deployment.startupWarnings.join(" ")}
              </div>
            ) : null}
          </section>

          <section className="admin-section">
            <h3>Preferred commands</h3>
            <div className="admin-inline-form">
              <code className="admin-command-block">{appInfo?.updateCommand ?? "./update.sh --yes"}</code>
              <button type="button" className="button button-secondary" onClick={() => void copyCommand("standard")}>
                {copiedCommand === "standard" ? "Copied" : "Copy command"}
              </button>
            </div>
            <div className="admin-inline-form">
              <code className="admin-command-block">{appInfo?.updatePullCommand ?? "./update.sh --pull --yes"}</code>
              <button type="button" className="button button-secondary" onClick={() => void copyCommand("pull")}>
                {copiedCommand === "pull" ? "Copied" : "Copy pull-latest"}
              </button>
            </div>
            <p className="subtitle">Use the first command for an already-updated checkout. Use the pull variant when this install should fetch the latest `main` changes before rebuilding.</p>
            <div className="admin-message success">
              Deployment guide: <code>{appInfo?.deploymentDocsPath ?? "docs/DEPLOYMENT.md"}</code>
            </div>
          </section>
        </div>
      </section>

      <IntegrationsPanel properties={properties} />
      <StorageSettingsPanel />
      <BackupTransferPanel onImported={onBackupImported} />

      <ConfirmDialog
        open={confirmAction === "role" && Boolean(selectedUser)}
        title="Confirm role change"
        description={`Change ${selectedUser?.fullName ?? "this user"} from ${selectedUser?.role ?? "their current role"} to ${editState.role}?`}
        confirmLabel="Change role"
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (!selectedUser) {
            return;
          }
          await onUpdateUser(selectedUser.id, {
            fullName: editState.fullName,
            email: editState.email,
            role: editState.role,
            language: editState.language,
            isActive: editState.isActive,
          });
          setConfirmAction(null);
        }}
      />

      <ConfirmDialog
        open={confirmAction === "deactivate" && Boolean(selectedUser)}
        title="Deactivate user"
        description={`Deactivate ${selectedUser?.fullName ?? "this user"}? This is a soft delete and future sign-ins will be blocked until reactivated.`}
        confirmLabel="Deactivate user"
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
        title="Reset password"
        description={`Reset the password for ${selectedUser?.fullName ?? "this user"}? Existing sessions will be revoked.`}
        confirmLabel="Reset password"
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
