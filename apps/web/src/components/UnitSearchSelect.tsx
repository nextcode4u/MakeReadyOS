import { useEffect, useMemo, useRef, useState } from "react";
import type { Unit } from "../lib/api";

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedUnit = useMemo(() => units.find((unit) => unit.id === value) ?? null, [units, value]);

  useEffect(() => {
    setQuery(selectedUnit ? unitLabel(selectedUnit) : "");
  }, [selectedUnit]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const filteredUnits = useMemo(() => {
    const match = query.trim().toLowerCase();
    const ranked = units
      .map((unit) => ({ unit, label: unitLabel(unit) }))
      .filter(({ unit, label }) => !match || label.toLowerCase().includes(match) || (unit.area ?? "").toLowerCase().includes(match));
    return ranked.slice(0, 40);
  }, [query, units]);

  return (
    <div ref={rootRef} className={`search-select ${disabled ? "is-disabled" : ""}`}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div className="search-select-input-wrap">
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          className="search-select-input"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!open) setOpen(true);
            if (value) onChange("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setQuery(selectedUnit ? unitLabel(selectedUnit) : "");
            }
            if (event.key === "Enter" && open && filteredUnits[0]) {
              event.preventDefault();
              onChange(filteredUnits[0].unit.id);
              setQuery(filteredUnits[0].label);
              setOpen(false);
            }
          }}
        />
        {value ? (
          <button
            type="button"
            className="search-select-clear"
            aria-label="Clear unit selection"
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(false);
            }}
          >
            ×
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="search-select-menu" role="listbox">
          <button
            type="button"
            className={`search-select-option ${!value ? "active" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(false);
            }}
          >
            {emptyLabel}
          </button>
          {filteredUnits.length ? filteredUnits.map(({ unit, label }) => (
            <button
              key={unit.id}
              type="button"
              className={`search-select-option ${value === unit.id ? "active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(unit.id);
                setQuery(label);
                setOpen(false);
              }}
            >
              {label}
            </button>
          )) : <div className="search-select-empty">No matching units</div>}
        </div>
      ) : null}
    </div>
  );
}
