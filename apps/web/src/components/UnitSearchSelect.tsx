import { useMemo } from "react";
import type { Unit } from "../lib/api";
import { SearchSelect, type SearchSelectOption } from "./SearchSelect";

type Props = {
  units: Unit[];
  value: string;
  onChange: (unitId: string) => void;
  name?: string;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
};

function unitLabel(unit: Unit) {
  const detail = [unit.building, unit.floorPlan].filter(Boolean).join(" / ");
  return detail ? `${unit.number} / ${detail}` : unit.number;
}

export function UnitSearchSelect({
  units,
  value,
  onChange,
  name,
  placeholder = "Search unit...",
  emptyLabel = "No unit selected",
  disabled = false,
}: Props) {
  const options = useMemo<SearchSelectOption[]>(() => units.map((unit) => ({
    value: unit.id,
    label: unitLabel(unit),
    keywords: [unit.number, unit.building ?? "", unit.floorPlan ?? "", unit.area ?? ""].filter(Boolean),
  })), [units]);

  return (
    <SearchSelect
      options={options}
      value={value}
      onChange={onChange}
      name={name}
      placeholder={placeholder}
      emptyLabel={emptyLabel}
      noMatchesLabel="No matching units"
      clearLabel="Clear unit selection"
      disabled={disabled}
    />
  );
}
