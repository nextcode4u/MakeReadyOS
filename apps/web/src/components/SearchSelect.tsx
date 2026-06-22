import { useEffect, useMemo, useRef, useState } from "react";

export type SearchSelectOption = {
  value: string;
  label: string;
  keywords?: string[];
};

type Props = {
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
  placeholder?: string;
  emptyLabel?: string;
  noMatchesLabel?: string;
  clearLabel?: string;
  disabled?: boolean;
};

export function SearchSelect({
  options,
  value,
  onChange,
  name,
  placeholder = "Search...",
  emptyLabel = "No selection",
  noMatchesLabel = "No matches",
  clearLabel = "Clear selection",
  disabled = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOption = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);

  useEffect(() => {
    setQuery(selectedOption?.label ?? "");
  }, [selectedOption]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const filteredOptions = useMemo(() => {
    const match = query.trim().toLowerCase();
    return options
      .filter((option) => {
        if (!match) return true;
        if (option.label.toLowerCase().includes(match)) return true;
        return (option.keywords ?? []).some((keyword) => keyword.toLowerCase().includes(match));
      })
      .slice(0, 40);
  }, [options, query]);

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
              setQuery(selectedOption?.label ?? "");
            }
            if (event.key === "Enter" && open && filteredOptions[0]) {
              event.preventDefault();
              onChange(filteredOptions[0].value);
              setQuery(filteredOptions[0].label);
              setOpen(false);
            }
          }}
        />
        {value ? (
          <button
            type="button"
            className="search-select-clear"
            aria-label={clearLabel}
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
          {filteredOptions.length ? filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`search-select-option ${value === option.value ? "active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setQuery(option.label);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          )) : <div className="search-select-empty">{noMatchesLabel}</div>}
        </div>
      ) : null}
    </div>
  );
}
