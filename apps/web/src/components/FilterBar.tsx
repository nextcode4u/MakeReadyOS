import type { CurrentUser, Property } from "../lib/api";

export type ThemeMode = "default" | "dark" | "light";

type Props = {
  properties: Property[];
  currentUser: CurrentUser;
  selectedPropertyId: string;
  search: string;
  onPropertyChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  activeView: "dashboard" | "mywork" | "planning" | "table" | "kanban" | "calendar" | "maps" | "pond" | "operations" | "vendors" | "fields" | "automations" | "activity" | "admin";
  onViewChange: (value: "dashboard" | "mywork" | "planning" | "table" | "kanban" | "calendar" | "maps" | "pond" | "operations" | "vendors" | "fields" | "automations" | "activity" | "admin") => void;
  showAdmin: boolean;
  showFieldManager: boolean;
  showAutomations: boolean;
  showActivity: boolean;
  showOperations: boolean;
  showVendors: boolean;
  compactMode: boolean;
  onCompactModeChange: (value: boolean) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (value: ThemeMode) => void;
  eyeStrainMode: boolean;
  onEyeStrainModeChange: (value: boolean) => void;
  dyslexiaMode: boolean;
  onDyslexiaModeChange: (value: boolean) => void;
  showArchivedItems: boolean;
  onShowArchivedItemsChange: (value: boolean) => void;
  notificationUnreadCount: number;
  onOpenNotifications: () => void;
  onOpenCommandPalette: () => void;
  onOpenOnboarding: () => void;
  onLogout: () => Promise<void>;
};

export function FilterBar({
  properties,
  currentUser,
  selectedPropertyId,
  search,
  onPropertyChange,
  onSearchChange,
  activeView,
  onViewChange,
  showAdmin,
  showFieldManager,
  showAutomations,
  showActivity,
  showOperations,
  showVendors,
  compactMode,
  onCompactModeChange,
  themeMode,
  onThemeModeChange,
  eyeStrainMode,
  onEyeStrainModeChange,
  dyslexiaMode,
  onDyslexiaModeChange,
  showArchivedItems,
  onShowArchivedItemsChange,
  notificationUnreadCount,
  onOpenNotifications,
  onOpenCommandPalette,
  onOpenOnboarding,
  onLogout,
}: Props) {
  const operationViews = (
    <div className="nav-group" data-testid="nav-group-operations">
      <span className="nav-group-label">Operations</span>
      <button data-testid="tab-table" className={activeView === "table" ? "tab active" : "tab"} onClick={() => onViewChange("table")} role="tab" aria-selected={activeView === "table"}>
        Table
      </button>
      <button data-testid="tab-kanban" className={activeView === "kanban" ? "tab active" : "tab"} onClick={() => onViewChange("kanban")} role="tab" aria-selected={activeView === "kanban"}>
        Kanban
      </button>
      <button data-testid="tab-calendar" className={activeView === "calendar" ? "tab active" : "tab"} onClick={() => onViewChange("calendar")} role="tab" aria-selected={activeView === "calendar"}>
        Schedule
      </button>
      <button data-testid="tab-my-work" className={activeView === "mywork" ? "tab active" : "tab"} onClick={() => onViewChange("mywork")} role="tab" aria-selected={activeView === "mywork"}>
        My Work
      </button>
      <button data-testid="tab-planning" className={activeView === "planning" ? "tab active" : "tab"} onClick={() => onViewChange("planning")} role="tab" aria-selected={activeView === "planning"}>
        Planning
      </button>
    </div>
  );
  const visibilityViews = (
    <div className="nav-group" data-testid="nav-group-visibility">
      <span className="nav-group-label">Visibility</span>
      <button data-testid="tab-dashboard" className={activeView === "dashboard" ? "tab active" : "tab"} onClick={() => onViewChange("dashboard")} role="tab" aria-selected={activeView === "dashboard"}>
        Dashboard
      </button>
      {showActivity ? (
        <button data-testid="tab-activity" className={activeView === "activity" ? "tab active" : "tab"} onClick={() => onViewChange("activity")} role="tab" aria-selected={activeView === "activity"}>
          Activity
        </button>
      ) : null}
      <button data-testid="tab-maps" className={activeView === "maps" ? "tab active" : "tab"} onClick={() => onViewChange("maps")} role="tab" aria-selected={activeView === "maps"}>
        Maps
      </button>
      <button data-testid="tab-pond" className={activeView === "pond" ? "tab active" : "tab"} onClick={() => onViewChange("pond")} role="tab" aria-selected={activeView === "pond"}>
        Pond
      </button>
    </div>
  );
  const managementViews = showVendors || showAutomations ? (
    <div className="nav-group" data-testid="nav-group-management">
      <span className="nav-group-label">Manage</span>
      {showVendors ? (
        <button data-testid="tab-vendors" className={activeView === "vendors" ? "tab active" : "tab"} onClick={() => onViewChange("vendors")} role="tab" aria-selected={activeView === "vendors"}>
          Vendors
        </button>
      ) : null}
      {showAutomations ? (
        <button data-testid="tab-automations" className={activeView === "automations" ? "tab active" : "tab"} onClick={() => onViewChange("automations")} role="tab" aria-selected={activeView === "automations"}>
          Automations
        </button>
      ) : null}
    </div>
  ) : null;
  const adminViews = showOperations || showFieldManager || showAdmin ? (
    <div className="nav-group" data-testid="nav-group-admin">
      <span className="nav-group-label">Admin</span>
      {showOperations ? (
        <button data-testid="tab-operations" className={activeView === "operations" ? "tab active" : "tab"} onClick={() => onViewChange("operations")} role="tab" aria-selected={activeView === "operations"}>
          Setup
        </button>
      ) : null}
      {showFieldManager ? (
        <button data-testid="tab-fields" className={activeView === "fields" ? "tab active" : "tab"} onClick={() => onViewChange("fields")} role="tab" aria-selected={activeView === "fields"}>
          Fields
        </button>
      ) : null}
      {showAdmin ? (
        <button data-testid="tab-admin" className={activeView === "admin" ? "tab active" : "tab"} onClick={() => onViewChange("admin")} role="tab" aria-selected={activeView === "admin"}>
          Admin
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <header className="filterbar">
      <div className="operations-brand">
        <h1>MakeReadyOS</h1>
        <span className="operations-user">{currentUser.fullName}</span>
        <span className="role-chip">{currentUser.role}</span>
      </div>

      <nav className="tabset" role="tablist" aria-label="Primary workspace views">
        {operationViews}
        {visibilityViews}
        {managementViews}
        {adminViews}
      </nav>

      <div className="filters" aria-label="Board tools">
        <select data-testid="property-filter" value={selectedPropertyId} onChange={(event) => onPropertyChange(event.target.value)} aria-label="Filter by property">
          <option value="">All properties</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.code} · {property.name}
            </option>
          ))}
        </select>
        <input
          data-testid="board-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search unit, applicant, tech"
          aria-label="Search board items"
        />
        <button data-testid="command-palette-button" className="button button-secondary command-button" type="button" onClick={onOpenCommandPalette} aria-label="Open quick search">
          Search <kbd>Ctrl K</kbd>
        </button>
        {(showAdmin || showOperations) ? (
          <button data-testid="onboarding-open" className="button button-secondary" type="button" onClick={onOpenOnboarding}>
            Guide
          </button>
        ) : null}
        <label className="compact-toggle" title="Reduce spacing to show more board rows">
          <input
            data-testid="compact-mode-toggle"
            type="checkbox"
            checked={compactMode}
            onChange={(event) => onCompactModeChange(event.target.checked)}
          />
          Compact
        </label>
        <label className="toolbar-select" title="Choose workspace color theme">
          <span className="sr-only">Theme</span>
          <select data-testid="theme-mode-select" aria-label="Theme mode" value={themeMode} onChange={(event) => onThemeModeChange(event.target.value as ThemeMode)}>
            <option value="default">Default theme</option>
            <option value="dark">Dark theme</option>
            <option value="light">Light theme</option>
          </select>
        </label>
        <label className="compact-toggle" title="Soften high-contrast surfaces for extended viewing">
          <input
            data-testid="eye-strain-mode-toggle"
            type="checkbox"
            aria-label="Eye-strain mode"
            checked={eyeStrainMode}
            onChange={(event) => onEyeStrainModeChange(event.target.checked)}
          />
          Eye-Strain
        </label>
        <label className="compact-toggle" title="Use OpenDyslexic with relaxed reading spacing">
          <input
            data-testid="dyslexia-mode-toggle"
            type="checkbox"
            aria-label="Dyslexia mode"
            checked={dyslexiaMode}
            onChange={(event) => onDyslexiaModeChange(event.target.checked)}
          />
          Dyslexia
        </label>
        {(activeView === "table" || activeView === "kanban" || activeView === "calendar") ? (
          <label className="compact-toggle" title="Include archived turnover records in board views">
            <input
              data-testid="show-archived-items-toggle"
              type="checkbox"
              checked={showArchivedItems}
              onChange={(event) => onShowArchivedItemsChange(event.target.checked)}
            />
            Archived
          </label>
        ) : null}
        <a data-testid="export-csv" className="button button-secondary export-button" href="/api/export/make-ready.csv">
          Export
        </a>
        <button data-testid="notifications-button" className="button button-secondary notification-button" onClick={onOpenNotifications} aria-label={`${notificationUnreadCount} unread notifications`}>
          Alerts{notificationUnreadCount > 0 ? <strong>{notificationUnreadCount}</strong> : null}
        </button>
        <button data-testid="logout-button" className="button button-secondary" onClick={() => void onLogout()}>
          Logout
        </button>
      </div>
    </header>
  );
}
