import clsx from "clsx";
import type { LabelDefinition } from "../lib/api";

type Props = {
  value: string | null | undefined;
  label?: LabelDefinition;
  muted?: boolean;
};

export function LabelPill({ value, label, muted }: Props) {
  if (!value) {
    return <span className="pill pill-empty">-</span>;
  }
  const displayValue = value.replace(/_/g, " ");

  return (
    <span
      className={clsx("pill", muted && "pill-muted")}
      title={value}
      style={{
        background: label?.color ?? "#3c4459",
        color: label?.textColor ?? "#f4f6fa",
      }}
    >
      {displayValue}
    </span>
  );
}
