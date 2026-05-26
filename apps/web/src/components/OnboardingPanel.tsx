import { useEffect } from "react";
import type { CurrentUser, Property, SavedView, ScheduleTrack } from "../lib/api";

type OnboardingView = "dashboard" | "table" | "calendar" | "operations" | "automations" | "admin" | "pond";

type Props = {
  open: boolean;
  currentUser: CurrentUser;
  properties: Property[];
  savedViews: SavedView[];
  scheduleTracks: ScheduleTrack[];
  firstRunDetected: boolean;
  onNavigate: (view: OnboardingView) => void;
  onClose: () => void;
  onSkip: () => void;
};

type Step = {
  title: string;
  description: string;
  action: string;
  view: OnboardingView;
  complete: boolean;
  adminOnly?: boolean;
};

export function OnboardingPanel({ open, currentUser, properties, savedViews, scheduleTracks, firstRunDetected, onNavigate, onClose, onSkip }: Props) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const isAdmin = currentUser.role === "ADMIN";
  const steps: Step[] = [
    {
      title: "Create or review properties",
      description: "Start with one property code/name, then confirm its Ready Units, Make Ready, Down Units, and Archive sections.",
      action: "Open Setup",
      view: "operations",
      complete: properties.length > 0,
    },
    {
      title: "Add units and floor plans",
      description: "Load the unit directory, attach managed floor plans, and keep legacy values only until they are mapped.",
      action: "Manage units",
      view: "operations",
      complete: properties.some((property) => (property._count?.units ?? 0) > 0),
    },
    {
      title: "Invite staff and set roles",
      description: "Create managers, techs, cleaners, leasing users, and viewers with property-scoped access.",
      action: isAdmin ? "Open Admin" : "Ask an admin",
      view: "admin",
      adminOnly: true,
      complete: currentUser.role !== "ADMIN" ? false : currentUser.propertyAccess.length > 0,
    },
    {
      title: "Apply a property template",
      description: "Use reusable templates for sections, fields, views, schedule tracks, checklists, and safe automation starters.",
      action: "Open Templates",
      view: "automations",
      complete: false,
    },
    {
      title: "Enable starter automations",
      description: "Preview automation rules before enabling overdue, missing-date, move-in risk, and workload warnings.",
      action: "Open Automations",
      view: "automations",
      complete: false,
    },
    {
      title: "Configure schedule tracks",
      description: "Make sure NTV, Vacated, Make Ready, Cleaning, Paint, Flooring, Pest, and Move-In tracks match the board.",
      action: "Schedule setup",
      view: "operations",
      complete: scheduleTracks.some((track) => track.isEnabled && !track.isArchived),
    },
    {
      title: "Save operational views",
      description: "Create dense table presets for daily turns, move-in risk, unassigned work, and manager review.",
      action: "Open Table",
      view: "table",
      complete: savedViews.length > 0,
    },
    {
      title: "Review Dashboard and Frog Pond",
      description: "Use Dashboard for serious summaries and Frog Pond as a quick visual pulse check.",
      action: "Open Dashboard",
      view: "dashboard",
      complete: false,
    },
  ];

  const visibleSteps = steps.filter((step) => !step.adminOnly || isAdmin);
  const completeCount = visibleSteps.filter((step) => step.complete).length;

  return (
    <>
      <div className="onboarding-backdrop" onClick={onClose} aria-hidden="true" />
      <section className="onboarding-panel" data-testid="onboarding-panel" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <header className="onboarding-header">
          <div>
            <p className="eyebrow">{firstRunDetected ? "First-run setup" : "Setup guide"}</p>
            <h2 id="onboarding-title">Bring a property online</h2>
            <p>
              This guide keeps setup focused on real make-ready operations: properties, units, sections,
              roles, templates, automations, schedules, and daily table workflow.
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close setup guide">×</button>
        </header>

        <div className="onboarding-progress" aria-label={`${completeCount} of ${visibleSteps.length} setup steps appear complete`}>
          <span style={{ width: `${Math.round((completeCount / Math.max(visibleSteps.length, 1)) * 100)}%` }} />
        </div>
        <p className="onboarding-progress-copy">{completeCount} of {visibleSteps.length} setup checks detected from current data.</p>

        <div className="onboarding-steps">
          {visibleSteps.map((step) => (
            <article key={step.title} className={step.complete ? "onboarding-step complete" : "onboarding-step"}>
              <div className="onboarding-step-status" aria-hidden="true">{step.complete ? "✓" : "•"}</div>
              <div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
              <button
                type="button"
                className="button button-secondary"
                data-testid={`onboarding-action-${step.view}`}
                disabled={step.adminOnly && !isAdmin}
                onClick={() => {
                  onNavigate(step.view);
                  onClose();
                }}
              >
                {step.action}
              </button>
            </article>
          ))}
        </div>

        <footer className="onboarding-footer">
          <button type="button" className="button button-secondary" onClick={onSkip} data-testid="onboarding-skip">Skip for now</button>
          <button type="button" className="button button-primary" onClick={onClose}>Keep working</button>
        </footer>
      </section>
    </>
  );
}
