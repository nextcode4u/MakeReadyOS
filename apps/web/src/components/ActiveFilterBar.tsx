type Chip = {
  key: string;
  label: string;
  onRemove: () => void;
};

type Props = {
  chips: Chip[];
  resultCount: number;
  onClear: () => void;
  contextLabel?: string | null;
  onDismissContext?: () => void;
  saveLabel?: string | null;
  onSaveContext?: () => void;
  savingContext?: boolean;
};

export function ActiveFilterBar({
  chips,
  resultCount,
  onClear,
  contextLabel,
  onDismissContext,
  saveLabel,
  onSaveContext,
  savingContext = false,
}: Props) {
  if (chips.length === 0) return null;
  return (
    <section className="active-filter-bar" data-testid="active-filter-bar" aria-label="Active board filters">
      <div className="active-filter-summary">
        <strong>Filtered Board</strong>
        <span>{resultCount} item{resultCount === 1 ? "" : "s"}</span>
      </div>
      {contextLabel ? (
        <div className="active-filter-context" data-testid="active-filter-context">
          <span>{contextLabel}</span>
          {onSaveContext && saveLabel ? (
            <button
              type="button"
              className="button button-secondary filter-context-action"
              data-testid="save-dashboard-drilldown-view"
              onClick={onSaveContext}
              disabled={savingContext}
            >
              {savingContext ? "Saving..." : saveLabel}
            </button>
          ) : null}
          {onDismissContext ? (
            <button
              type="button"
              className="icon-button filter-context-dismiss"
              data-testid="dismiss-filter-context"
              onClick={onDismissContext}
              aria-label="Dismiss dashboard drilldown context"
            >
              &times;
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="active-filter-chips">
        {chips.map((chip) => (
          <button type="button" key={chip.key} className="filter-chip" data-testid={`active-filter-${chip.key}`} onClick={chip.onRemove} aria-label={`Remove filter ${chip.label}`}>
            {chip.label}<span aria-hidden="true">&times;</span>
          </button>
        ))}
      </div>
      <button type="button" className="button button-secondary filter-clear" data-testid="clear-structured-filters" onClick={onClear}>Clear filters</button>
    </section>
  );
}
