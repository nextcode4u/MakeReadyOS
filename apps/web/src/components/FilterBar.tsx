import { useEffect, useState } from "react";
import { makeReadyExportCsvUrl, makeReadyPdfReportUrl, type CurrentUser, type Property, type UserLanguage } from "../lib/api";
import type { ArchiveFilter } from "../lib/structuredFilters";
import type { ClockMode } from "../lib/dateTime";
import { languageOptions, t, translateUserRole } from "../lib/i18n";
import { isTouchMobileViewport } from "../lib/responsive";

export type ThemeMode = "default" | "dark" | "light";
export type ArchiveMode = ArchiveFilter;

type Props = {
  properties: Property[];
  currentUser: CurrentUser;
  selectedPropertyId: string;
  search: string;
  onPropertyChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  activeView: "dashboard" | "mywork" | "assignedwork" | "planning" | "table" | "kanban" | "calendar" | "maps" | "pond" | "operations" | "vendors" | "refrigerant" | "pool" | "pest" | "lease" | "pm" | "projects" | "wiki" | "fields" | "automations" | "activity" | "admin";
  onViewChange: (value: "dashboard" | "mywork" | "assignedwork" | "planning" | "table" | "kanban" | "calendar" | "maps" | "pond" | "operations" | "vendors" | "refrigerant" | "pool" | "pest" | "lease" | "pm" | "projects" | "wiki" | "fields" | "automations" | "activity" | "admin") => void;
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
  onApplyBasicMode: () => void;
  basicModeActive: boolean;
  onOpenShortcutHelp: () => void;
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
  onApplyBasicMode,
  basicModeActive,
  onOpenShortcutHelp,
  onLogout,
}: Props) {
  const [isMobileLayout, setIsMobileLayout] = useState(() => isTouchMobileViewport());
  const [mobileViewsOpen, setMobileViewsOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

  useEffect(() => {
    const viewportMedia = window.matchMedia("(max-width: 860px)");
    const coarsePointerMedia = window.matchMedia("(pointer: coarse) and (hover: none)");
    const update = () => setIsMobileLayout(isTouchMobileViewport());
    update();
    if (typeof viewportMedia.addEventListener === "function") {
      viewportMedia.addEventListener("change", update);
      coarsePointerMedia.addEventListener("change", update);
      return () => {
        viewportMedia.removeEventListener("change", update);
        coarsePointerMedia.removeEventListener("change", update);
      };
    }
    viewportMedia.addListener(update);
    coarsePointerMedia.addListener(update);
    return () => {
      viewportMedia.removeListener(update);
      coarsePointerMedia.removeListener(update);
    };
  }, []);

  useEffect(() => {
    if (!isMobileLayout) {
      setMobileViewsOpen(false);
      setMobileToolsOpen(false);
    }
  }, [isMobileLayout]);

  useEffect(() => {
    if (isMobileLayout) {
      setMobileViewsOpen(false);
      setMobileToolsOpen(false);
    }
  }, [activeView, isMobileLayout]);

  useEffect(() => {
    const root = document.documentElement;
    const trayOpen = isMobileLayout && (mobileViewsOpen || mobileToolsOpen);
    root.classList.toggle("mobile-tray-open", trayOpen);
    return () => root.classList.remove("mobile-tray-open");
  }, [isMobileLayout, mobileToolsOpen, mobileViewsOpen]);

  function viewLabel(view: Props["activeView"]) {
    switch (view) {
      case "table": return t(language, "nav.table");
      case "kanban": return t(language, "nav.kanban");
      case "calendar": return t(language, "nav.schedule");
      case "mywork": return t(language, "nav.myWork");
      case "assignedwork": return t(language, "nav.assignedWork");
      case "planning": return t(language, "nav.planning");
      case "dashboard": return t(language, "nav.dashboard");
      case "activity": return t(language, "nav.activity");
      case "maps": return t(language, "nav.maps");
      case "pond": return t(language, "nav.pond");
      case "vendors": return t(language, "nav.vendors");
      case "automations": return t(language, "nav.automations");
      case "operations": return t(language, "nav.setup");
      case "fields": return t(language, "nav.fields");
      case "admin": return t(language, "nav.admin");
      default: return t(language, "nav.workspace");
    }
  }

  const handleMobileViewChange = (value: Props["activeView"]) => {
    onViewChange(value);
    setMobileViewsOpen(false);
  };

  const toggleMobileViews = () => {
    setMobileViewsOpen((current) => {
      const next = !current;
      if (next) {
        setMobileToolsOpen(false);
      }
      return next;
    });
  };

  const toggleMobileTools = () => {
    setMobileToolsOpen((current) => {
      const next = !current;
      if (next) {
        setMobileViewsOpen(false);
      }
      return next;
    });
  };

  const operationViews = (
    <div className="nav-group" data-testid="nav-group-operations">
      <span className="nav-group-label">{t(language, "nav.operations")}</span>
      <button data-testid="tab-table" className={activeView === "table" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("table") : onViewChange("table"))} role="tab" aria-selected={activeView === "table"}>
        {t(language, "nav.table")}
      </button>
      <button data-testid="tab-kanban" className={activeView === "kanban" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("kanban") : onViewChange("kanban"))} role="tab" aria-selected={activeView === "kanban"}>
        {t(language, "nav.kanban")}
      </button>
      <button data-testid="tab-calendar" className={activeView === "calendar" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("calendar") : onViewChange("calendar"))} role="tab" aria-selected={activeView === "calendar"}>
        {t(language, "nav.schedule")}
      </button>
      <button data-testid="tab-my-work" className={activeView === "mywork" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("mywork") : onViewChange("mywork"))} role="tab" aria-selected={activeView === "mywork"}>
        {t(language, "nav.myWork")}
      </button>
      {currentUser.role !== "VIEWER" ? (
        <button data-testid="tab-assigned-work" className={activeView === "assignedwork" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("assignedwork") : onViewChange("assignedwork"))} role="tab" aria-selected={activeView === "assignedwork"}>
          {t(language, "nav.assignedWork")}
        </button>
      ) : null}
      <button data-testid="tab-planning" className={activeView === "planning" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("planning") : onViewChange("planning"))} role="tab" aria-selected={activeView === "planning"}>
        {t(language, "nav.planning")}
      </button>
    </div>
  );
  const visibilityViews = (
    <div className="nav-group" data-testid="nav-group-visibility">
      <span className="nav-group-label">{t(language, "nav.visibility")}</span>
        <button data-testid="tab-dashboard" className={activeView === "dashboard" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("dashboard") : onViewChange("dashboard"))} role="tab" aria-selected={activeView === "dashboard"}>
          {t(language, "nav.dashboard")}
        </button>
      {showActivity ? (
        <button data-testid="tab-activity" className={activeView === "activity" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("activity") : onViewChange("activity"))} role="tab" aria-selected={activeView === "activity"}>
          {t(language, "nav.activity")}
        </button>
      ) : null}
      <button data-testid="tab-maps" className={activeView === "maps" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("maps") : onViewChange("maps"))} role="tab" aria-selected={activeView === "maps"}>
        {t(language, "nav.maps")}
      </button>
      <button data-testid="tab-pond" className={activeView === "pond" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("pond") : onViewChange("pond"))} role="tab" aria-selected={activeView === "pond"}>
        {t(language, "nav.pond")}
      </button>
    </div>
  );
  const managementViews = showVendors || showAutomations ? (
    <div className="nav-group" data-testid="nav-group-management">
      <span className="nav-group-label">{t(language, "nav.manage")}</span>
      {showVendors ? (
        <button data-testid="tab-vendors" className={activeView === "vendors" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("vendors") : onViewChange("vendors"))} role="tab" aria-selected={activeView === "vendors"}>
          {t(language, "nav.vendors")}
        </button>
      ) : null}
      {showAutomations ? (
        <button data-testid="tab-automations" className={activeView === "automations" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("automations") : onViewChange("automations"))} role="tab" aria-selected={activeView === "automations"}>
          {t(language, "nav.automations")}
        </button>
      ) : null}
    </div>
  ) : null;
  const adminViews = showOperations || showFieldManager || showAdmin ? (
    <div className="nav-group" data-testid="nav-group-admin">
      <span className="nav-group-label">{t(language, "nav.admin")}</span>
      {showOperations ? (
        <button data-testid="tab-operations" className={activeView === "operations" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("operations") : onViewChange("operations"))} role="tab" aria-selected={activeView === "operations"}>
          {t(language, "nav.setup")}
        </button>
      ) : null}
      {showFieldManager ? (
        <button data-testid="tab-fields" className={activeView === "fields" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("fields") : onViewChange("fields"))} role="tab" aria-selected={activeView === "fields"}>
          {t(language, "nav.fields")}
        </button>
      ) : null}
      {showAdmin ? (
        <button data-testid="tab-admin" className={activeView === "admin" ? "tab active" : "tab"} onClick={() => (isMobileLayout ? handleMobileViewChange("admin") : onViewChange("admin"))} role="tab" aria-selected={activeView === "admin"}>
          {t(language, "nav.admin")}
        </button>
      ) : null}
    </div>
  ) : null;

  if (isMobileLayout) {
    return (
      <header className="filterbar mobile-filterbar">
        <div className="mobile-filterbar-main" aria-label={t(language, "nav.boardEssentials")}>
          <select data-testid="property-filter" value={selectedPropertyId} onChange={(event) => onPropertyChange(event.target.value)} aria-label={t(language, "nav.filterByProperty")}>
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
            aria-label={t(language, "nav.searchBoardItems")}
          />
          <div className="mobile-filterbar-actions">
            <button type="button" className={mobileViewsOpen ? "button mobile-filter-toggle active" : "button button-secondary mobile-filter-toggle"} onClick={toggleMobileViews}>
              {t(language, "nav.view")}: {viewLabel(activeView)}
            </button>
            <button type="button" className={mobileToolsOpen ? "button mobile-filter-toggle active" : "button button-secondary mobile-filter-toggle"} onClick={toggleMobileTools}>
              {t(language, "nav.tools")}
            </button>
          </div>
        </div>

        {mobileViewsOpen ? (
          <nav className="tabset mobile-tabset" role="tablist" aria-label={t(language, "nav.primaryWorkspaceViews")}>
            {operationViews}
            {visibilityViews}
            {managementViews}
            {adminViews}
          </nav>
        ) : null}

        {mobileToolsOpen ? (
          <div className="filters mobile-filters-panel" aria-label={t(language, "nav.boardTools")}>
            <button data-testid="command-palette-button" className="button button-secondary command-button" type="button" onClick={onOpenCommandPalette} aria-label={t(language, "nav.openQuickSearch")}>
              {t(language, "nav.search")} <kbd>Ctrl K</kbd>
            </button>
            {(showAdmin || showOperations) ? (
              <button data-testid="onboarding-open" className="button button-secondary" type="button" onClick={onOpenOnboarding}>
                {t(language, "nav.guide")}
              </button>
            ) : null}
            {(activeView === "table" || activeView === "kanban" || activeView === "calendar") ? (
              <button type="button" className="button button-secondary" data-testid="basic-board-mode" onClick={onApplyBasicMode}>
                {basicModeActive ? (language === "es" ? "Restaurar tablero" : "Restore board") : (language === "es" ? "Modo basico" : "Basic board")}
              </button>
            ) : null}
            <button type="button" className="button button-secondary" data-testid="shortcut-help-open" onClick={onOpenShortcutHelp}>
              {language === "es" ? "Atajos" : "Shortcuts"}
            </button>
            <label className="compact-toggle" title="Reduce spacing to show more board rows">
              <input
                data-testid="compact-mode-toggle"
                type="checkbox"
                checked={compactMode}
                onChange={(event) => onCompactModeChange(event.target.checked)}
              />
              {t(language, "nav.compact")}
            </label>
            <label className="toolbar-select" title={t(language, "nav.themeMode")}>
              <span className="sr-only">{t(language, "nav.themeMode")}</span>
              <select data-testid="theme-mode-select" aria-label={t(language, "nav.themeMode")} value={themeMode} onChange={(event) => onThemeModeChange(event.target.value as ThemeMode)}>
                <option value="default">{t(language, "nav.defaultTheme")}</option>
                <option value="dark">{t(language, "nav.darkTheme")}</option>
                <option value="light">{t(language, "nav.lightTheme")}</option>
              </select>
            </label>
            <label className="toolbar-select compact-clock-select" title={t(language, "nav.clockMode")}>
              <span className="sr-only">{t(language, "nav.clockMode")}</span>
              <select data-testid="clock-mode-select" aria-label={t(language, "nav.clockMode")} value={clockMode} onChange={(event) => onClockModeChange(event.target.value as ClockMode)}>
                <option value="12h">{t(language, "nav.clock12")}</option>
                <option value="24h">{t(language, "nav.clock24")}</option>
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
            <label className="toolbar-select archive-mode-select" title={t(language, "nav.archiveMode")}>
                <span className="sr-only">{t(language, "nav.archiveMode")}</span>
                <select data-testid="top-archive-mode" aria-label={t(language, "nav.archiveMode")} value={archiveMode} onChange={(event) => onArchiveModeChange(event.target.value as ArchiveMode)}>
                  <option value="active">{t(language, "nav.activeItems")}</option>
                  <option value="archived">{t(language, "nav.archiveOnly")}</option>
                  <option value="occupied">{t(language, "nav.occupied")}</option>
                  <option value="all">{t(language, "nav.activeArchive")}</option>
                </select>
              </label>
            ) : null}
            <a data-testid="export-csv" className="button button-secondary export-button" href={makeReadyExportCsvUrl({ propertyId: selectedPropertyId || undefined })}>
              {t(language, "nav.export")}
            </a>
            <a data-testid="export-pdf" className="button button-secondary export-button" href={makeReadyPdfReportUrl({ propertyId: selectedPropertyId || undefined })} target="_blank" rel="noreferrer">
              {t(language, "nav.pdf")}
            </a>
            <button data-testid="notifications-button" className="button button-secondary notification-button" onClick={onOpenNotifications} aria-label={`${notificationUnreadCount} ${t(language, "nav.notificationsUnread")}`}>
              {t(language, "nav.alerts")}{notificationUnreadCount > 0 ? <strong>{notificationUnreadCount}</strong> : null}
            </button>
            <button data-testid="logout-button" className="button button-secondary" onClick={() => void onLogout()}>
              {t(language, "nav.logout")}
            </button>
          </div>
        ) : null}
      </header>
    );
  }

  return (
    <header className="filterbar">
      <div className="operations-brand">
        <h1>MakeReadyOS</h1>
        <span className="operations-user">{currentUser.fullName}</span>
        <span className="role-chip">{translateUserRole(language, currentUser.role)}</span>
      </div>

      <nav className="tabset" role="tablist" aria-label={t(language, "nav.primaryWorkspaceViews")}>
        {operationViews}
        {visibilityViews}
        {managementViews}
        {adminViews}
      </nav>

      <div className="filters" aria-label={t(language, "nav.boardTools")}>
        <select data-testid="property-filter" value={selectedPropertyId} onChange={(event) => onPropertyChange(event.target.value)} aria-label={t(language, "nav.filterByProperty")}>
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
          aria-label={t(language, "nav.searchBoardItems")}
        />
        <button data-testid="command-palette-button" className="button button-secondary command-button" type="button" onClick={onOpenCommandPalette} aria-label={t(language, "nav.openQuickSearch")}>
          {t(language, "nav.search")} <kbd>Ctrl K</kbd>
        </button>
        {(showAdmin || showOperations) ? (
          <button data-testid="onboarding-open" className="button button-secondary" type="button" onClick={onOpenOnboarding}>
            {t(language, "nav.guide")}
          </button>
        ) : null}
        {(activeView === "table" || activeView === "kanban" || activeView === "calendar") ? (
          <button type="button" className="button button-secondary" data-testid="basic-board-mode" onClick={onApplyBasicMode}>
            {basicModeActive ? (language === "es" ? "Restaurar tablero" : "Restore board") : (language === "es" ? "Modo basico" : "Basic board")}
          </button>
        ) : null}
        <button type="button" className="button button-secondary" data-testid="shortcut-help-open" onClick={onOpenShortcutHelp}>
          {language === "es" ? "Atajos" : "Shortcuts"}
        </button>
        <label className="compact-toggle" title="Reduce spacing to show more board rows">
          <input
            data-testid="compact-mode-toggle"
            type="checkbox"
            checked={compactMode}
            onChange={(event) => onCompactModeChange(event.target.checked)}
          />
          {t(language, "nav.compact")}
        </label>
        <label className="toolbar-select" title={t(language, "nav.themeMode")}>
          <span className="sr-only">{t(language, "nav.themeMode")}</span>
          <select data-testid="theme-mode-select" aria-label={t(language, "nav.themeMode")} value={themeMode} onChange={(event) => onThemeModeChange(event.target.value as ThemeMode)}>
            <option value="default">{t(language, "nav.defaultTheme")}</option>
            <option value="dark">{t(language, "nav.darkTheme")}</option>
            <option value="light">{t(language, "nav.lightTheme")}</option>
          </select>
        </label>
        <label className="toolbar-select compact-clock-select" title={t(language, "nav.clockMode")}>
          <span className="sr-only">{t(language, "nav.clockMode")}</span>
          <select data-testid="clock-mode-select" aria-label={t(language, "nav.clockMode")} value={clockMode} onChange={(event) => onClockModeChange(event.target.value as ClockMode)}>
            <option value="12h">{t(language, "nav.clock12")}</option>
            <option value="24h">{t(language, "nav.clock24")}</option>
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
        <label className="toolbar-select archive-mode-select" title={t(language, "nav.archiveMode")}>
          <span className="sr-only">{t(language, "nav.archiveMode")}</span>
          <select data-testid="top-archive-mode" aria-label={t(language, "nav.archiveMode")} value={archiveMode} onChange={(event) => onArchiveModeChange(event.target.value as ArchiveMode)}>
              <option value="active">{t(language, "nav.activeItems")}</option>
              <option value="archived">{t(language, "nav.archiveOnly")}</option>
              <option value="occupied">{t(language, "nav.occupied")}</option>
              <option value="all">{t(language, "nav.activeArchive")}</option>
            </select>
          </label>
        ) : null}
        <a data-testid="export-csv" className="button button-secondary export-button" href={makeReadyExportCsvUrl({ propertyId: selectedPropertyId || undefined })}>
          {t(language, "nav.export")}
        </a>
        <a data-testid="export-pdf" className="button button-secondary export-button" href={makeReadyPdfReportUrl({ propertyId: selectedPropertyId || undefined })} target="_blank" rel="noreferrer">
          {t(language, "nav.pdf")}
        </a>
        <button data-testid="notifications-button" className="button button-secondary notification-button" onClick={onOpenNotifications} aria-label={`${notificationUnreadCount} ${t(language, "nav.notificationsUnread")}`}>
          {t(language, "nav.alerts")}{notificationUnreadCount > 0 ? <strong>{notificationUnreadCount}</strong> : null}
        </button>
        <button data-testid="logout-button" className="button button-secondary" onClick={() => void onLogout()}>
          {t(language, "nav.logout")}
        </button>
      </div>
    </header>
  );
}
