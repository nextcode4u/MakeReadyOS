type Props = {
  title: string;
  description: string;
  tone?: "default" | "error" | "subtle";
  action?: {
    label: string;
    onClick: () => void;
  };
};

export function StatusState({ title, description, tone = "default", action }: Props) {
  return (
    <section className={`status-state status-state-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <div className="status-state-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action ? (
        <button type="button" className="button button-secondary" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </section>
  );
}
