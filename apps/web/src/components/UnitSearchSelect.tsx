import { useMemo } from "react";
import type { Unit, UserLanguage } from "../lib/api";
import { t } from "../lib/i18n";
import { SearchSelect, type SearchSelectOption } from "./SearchSelect";

type Props = {
  units: Unit[];
  value: string;
  onChange: (unitId: string) => void;
  name?: string;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  language?: UserLanguage;
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
  placeholder,
  emptyLabel,
  disabled = false,
  language = "en",
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
      placeholder={placeholder ?? t(language, "pest.searchUnit")}
      emptyLabel={emptyLabel ?? t(language, "refrigerant.noUnitSelected")}
      noMatchesLabel={t(language, "unitSearch.noMatches")}
      clearLabel={t(language, "unitSearch.clearSelection")}
      disabled={disabled}
    />
  );
}
