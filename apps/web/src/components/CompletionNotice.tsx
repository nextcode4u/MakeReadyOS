export function CompletionNotice({ message, language, id, testId, error = false }: { message: string; language: string; id?: string; testId?: string; error?: boolean }) {
  const lines = message.split(/;\s+/).filter(Boolean);
  return <div className="completion-blockers" role={error ? "alert" : "status"} id={id} data-testid={testId}>
    <strong>{language === "es" ? "Acción requerida" : "Action required"}</strong>
    {lines.length > 1 ? <ul>{lines.map((line, index) => <li key={index}>{line}</li>)}</ul> : <p>{message}</p>}
  </div>;
}
