import type { CurrentUser, Property, UserLanguage } from "../lib/api";
import type { ArchiveFilter } from "../lib/structuredFilters";
import type { ClockMode } from "../lib/dateTime";
import { languageOptions, t } from "../lib/i18n";

export type ThemeMode = "default" | "dark" | "light";
export type ArchiveMode = ArchiveFilter;

type Props = {
  properties: Property[];
  currentUser: CurrentUser;
  selectedPropertyId: string;
  search: string;
  onPropertyChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  activeView: "dashboard" | "mywork" | "planning" | "table" | "kanban" | "calendar" | "maps" | "pond" | "operations" | "vendors" | "refrigerant" | "pool" | "pm" | "wiki" | "fields" | "automations" | "activity" | "admin";
  onViewChange: (value: "dashboard" | "mywork" | "planning" | "table" | "kanban" | "calendar" | "maps" | "pond" | "operations" | "vendors" | "refrigerant" | "pool" | "pm" | "wiki" | "fields" | "automations" | "activity" | "admin") => void;
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
  clockMode: ClockMode;
  onClockModeChange: (value: ClockMode) => void;
  eyeStrainMode: boolean;
  onEyeStrainModeChange: (value: boolean) => void;
  dyslexiaMode: boolean;
  onDyslexiaModeChange: (value: boolean) => void;
  language: UserLanguage;
  onLanguageChange: (value: UserLanguage) => void;
  archiveMode: ArchiveMode;
  onArchiveModeChange: (value: ArchiveMode) => void;
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
  clockMode,
  onClockModeChange,
  eyeStrainMode,
  onEyeStrainModeChange,
  dyslexiaMode,
  onDyslexiaModeChange,
  language,
  onLanguageChange,
  archiveMode,
  onArchiveModeChange,
  notificationUnreadCount,
  onOpenNotifications,
  onOpenCommandPalette,
  onOpenOnboarding,
  onLogout,
}: Props) {
  const operationViews = (
    <div className="nav-group" data-testid="nav-group-operations">
      <span className="nav-group-label">{t(language, "nav.operations")}</span>
      <button data-testid="tab-table" className={activeView === "table" ? "tab active" : "tab"} onClick={() => onViewChange("table")} role="tab" aria-selected={activeView === "table"}>
        {t(language, "nav.table")}
      </button>
      <button data-testid="tab-kanban" className={activeView === "kanban" ? "tab active" : "tab"} onClick={() => onViewChange("kanban")} role="tab" aria-selected={activeView === "kanban"}>
        {t(language, "nav.kanban")}
      </button>
      <button data-testid="tab-calendar" className={activeView === "calendar" ? "tab active" : "tab"} onClick={() => onViewChange("calendar")} role="tab" aria-selected={activeView === "calendar"}>
        {t(language, "nav.schedule")}
      </button>
      <button data-testid="tab-my-work" className={activeView === "mywork" ? "tab active" : "tab"} onClick={() => onViewChange("mywork")} role="tab" aria-selected={activeView === "mywork"}>
        {t(language, "nav.myWork")}
      </button>
      <button data-testid="tab-planning" className={activeView === "planning" ? "tab active" : "tab"} onClick={() => onViewChange("planning")} role="tab" aria-selected={activeView === "planning"}>
        {t(language, "nav.planning")}
      </button>
    </div>
  );
  const visibilityViews = (
    <div className="nav-group" data-testid="nav-group-visibility">
      <span className="nav-group-label">{t(language, "nav.visibility")}</span>
      <button data-testid="tab-dashboard" className={activeView === "dashboard" ? "tab active" : "tab"} onClick={() => onViewChange("dashboard")} role="tab" aria-selected={activeView === "dashboard"}>
        {t(language, "nav.dashboard")}
      </button>
      {showActivity ? (
        <button data-testid="tab-activity" className={activeView === "activity" ? "tab active" : "tab"} onClick={() => onViewChange("activity")} role="tab" aria-selected={activeView === "activity"}>
          {t(language, "nav.activity")}
        </button>
      ) : null}
      <button data-testid="tab-maps" className={activeView === "maps" ? "tab active" : "tab"} onClick={() => onViewChange("maps")} role="tab" aria-selected={activeView === "maps"}>
        {t(language, "nav.maps")}
      </button>
      <button data-testid="tab-pond" className={activeView === "pond" ? "tab active" : "tab"} onClick={() => onViewChange("pond")} role="tab" aria-selected={activeView === "pond"}>
        {t(language, "nav.pond")}
      </button>
    </div>
  );
  const managementViews = showVendors || showAutomations ? (
    <div className="nav-group" data-testid="nav-group-management">
      <span className="nav-group-label">{t(language, "nav.manage")}</span>
      {showVendors ? (
        <button data-testid="tab-vendors" className={activeView === "vendors" ? "tab active" : "tab"} onClick={() => onViewChange("vendors")} role="tab" aria-selected={activeView === "vendors"}>
          {t(language, "nav.vendors")}
        </button>
      ) : null}
      {showAutomations ? (
        <button data-testid="tab-automations" className={activeView === "automations" ? "tab active" : "tab"} onClick={() => onViewChange("automations")} role="tab" aria-selected={activeView === "automations"}>
          {t(language, "nav.automations")}
        </button>
      ) : null}
    </div>
  ) : null;
  const adminViews = showOperations || showFieldManager || showAdmin ? (
    <div className="nav-group" data-testid="nav-group-admin">
      <span className="nav-group-label">{t(language, "nav.admin")}</span>
      {showOperations ? (
        <button data-testid="tab-operations" className={activeView === "operations" ? "tab active" : "tab"} onClick={() => onViewChange("operations")} role="tab" aria-selected={activeView === "operations"}>
          {t(language, "nav.setup")}
        </button>
      ) : null}
      {showFieldManager ? (
        <button data-testid="tab-fields" className={activeView === "fields" ? "tab active" : "tab"} onClick={() => onViewChange("fields")} role="tab" aria-selected={activeView === "fields"}>
          {t(language, "nav.fields")}
        </button>
      ) : null}
      {showAdmin ? (
        <button data-testid="tab-admin" className={activeView === "admin" ? "tab active" : "tab"} onClick={() => onViewChange("admin")} role="tab" aria-selected={activeView === "admin"}>
          {t(language, "nav.admin")}
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
          <option value="">{t(language, "nav.allProperties")}</option>
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
          placeholder={t(language, "nav.searchPlaceholder")}
          aria-label="Search board items"
        />
        <button data-testid="command-palette-button" className="button button-secondary command-button" type="button" onClick={onOpenCommandPalette} aria-label="Open quick search">
          {t(language, "nav.search")} <kbd>Ctrl K</kbd>
        </button>
        {(showAdmin || showOperations) ? (
          <button data-testid="onboarding-open" className="button button-secondary" type="button" onClick={onOpenOnboarding}>
            {t(language, "nav.guide")}
          </button>
        ) : null}
        <label className="compact-toggle" title="Reduce spacing to show more board rows">
          <input
            data-testid="compact-mode-toggle"
            type="checkbox"
            checked={compactMode}
            onChange={(event) => onCompactModeChange(event.target.checked)}
          />
          {t(language, "nav.compact")}
        </label>
        <label className="toolbar-select" title="Choose workspace color theme">
          <span className="sr-only">Theme</span>
          <select data-testid="theme-mode-select" aria-label="Theme mode" value={themeMode} onChange={(event) => onThemeModeChange(event.target.value as ThemeMode)}>
            <option value="default">{t(language, "nav.defaultTheme")}</option>
            <option value="dark">{t(language, "nav.darkTheme")}</option>
            <option value="light">{t(language, "nav.lightTheme")}</option>
          </select>
        </label>
        <label className="toolbar-select compact-clock-select" title="Choose timestamp display">
          <span className="sr-only">Clock</span>
          <select data-testid="clock-mode-select" aria-label="Clock mode" value={clockMode} onChange={(event) => onClockModeChange(event.target.value as ClockMode)}>
            <option value="12h">12 hr</option>
            <option value="24h">24 hr</option>
          </select>
        </label>
        <label className="toolbar-select compact-language-select" title="Choose interface language">
          <span className="sr-only">{t(language, "language.label")}</span>
          <select data-testid="language-select" aria-label={t(language, "language.label")} value={language} onChange={(event) => onLanguageChange(event.target.value as UserLanguage)}>
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value === "en" ? t(language, "language.english") : t(language, "language.spanish")}
              </option>
            ))}
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
          {t(language, "nav.eyeStrain")}
        </label>
        <label className="compact-toggle" title="Use OpenDyslexic with relaxed reading spacing">
          <input
            data-testid="dyslexia-mode-toggle"
            type="checkbox"
            aria-label="Dyslexia mode"
            checked={dyslexiaMode}
            onChange={(event) => onDyslexiaModeChange(event.target.checked)}
          />
          {t(language, "nav.dyslexia")}
        </label>
        {(activeView === "table" || activeView === "kanban" || activeView === "calendar") ? (
          <label className="toolbar-select archive-mode-select" title="Choose active turns, archive history, or both">
            <span className="sr-only">Archive mode</span>
            <select data-testid="top-archive-mode" aria-label="Archive mode" value={archiveMode} onChange={(event) => onArchiveModeChange(event.target.value as ArchiveMode)}>
              <option value="active">{t(language, "nav.activeItems")}</option>
              <option value="archived">{t(language, "nav.archiveOnly")}</option>
              <option value="occupied">{t(language, "nav.occupied")}</option>
              <option value="all">{t(language, "nav.activeArchive")}</option>
            </select>
          </label>
        ) : null}
        <a data-testid="export-csv" className="button button-secondary export-button" href="/api/export/make-ready.csv">
          {t(language, "nav.export")}
        </a>
        <button data-testid="notifications-button" className="button button-secondary notification-button" onClick={onOpenNotifications} aria-label={`${notificationUnreadCount} unread notifications`}>
          {t(language, "nav.alerts")}{notificationUnreadCount > 0 ? <strong>{notificationUnreadCount}</strong> : null}
        </button>
        <button data-testid="logout-button" className="button button-secondary" onClick={() => void onLogout()}>
          {t(language, "nav.logout")}
        </button>
      </div>
    </header>
  );
}
