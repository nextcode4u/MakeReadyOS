type Chip = {
  key: string;
  label: string;
  onRemove: () => void;
};

type Props = {
  chips: Chip[];
  resultCount: number;
  onClear: () => void;
};

export function ActiveFilterBar({ chips, resultCount, onClear }: Props) {
  if (chips.length === 0) return null;
  return (
    <section className="active-filter-bar" data-testid="active-filter-bar" aria-label="Active board filters">
      <div className="active-filter-summary">
        <strong>Filtered Board</strong>
        <span>{resultCount} item{resultCount === 1 ? "" : "s"}</span>
      </div>
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
