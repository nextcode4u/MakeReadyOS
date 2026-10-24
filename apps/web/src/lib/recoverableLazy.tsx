import { Component, createElement, lazy, type ComponentProps, type ComponentType, type ErrorInfo } from "react";

function isModuleFailure(error: unknown) {
  return error instanceof Error && /dynamically imported module|module script|loading chunk|loading css chunk/i.test(error.message);
}

export function recoverableLazy<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): ComponentType<ComponentProps<T>> {
  type P = ComponentProps<T>;
  // Keep the initial lazy identity stable when React retries a suspended mount.
  const initialView = lazy(load);
  return class RecoverableView extends Component<P, { error: unknown }> {
    state = { error: null as unknown };
    private view = initialView;
    static getDerivedStateFromError(error: unknown) { return { error }; }
    componentDidCatch(error: Error, info: ErrorInfo) { console.error("Workspace error", error, info.componentStack); }
    render() {
      if (!this.state.error) return createElement(this.view as ComponentType<P>, this.props as P);
      const es = document.documentElement.lang.startsWith("es");
      const moduleFailure = isModuleFailure(this.state.error);
      return <section className="panel-state-wrap" role="alert" data-testid="workspace-load-error">
        <h3>{es ? "No se pudo abrir esta vista" : "This view could not be opened"}</h3>
        <p>{moduleFailure
          ? (es ? "No se pudo descargar la vista. Puedes seguir usando otras vistas sin recargar." : "The view could not be downloaded. You can continue using other views without reloading.")
          : (es ? "Esta vista encontro un error. Reintentar puede perder cambios sin guardar en esta vista." : "This view encountered an error. Retrying may discard unsaved input in this view.")}</p>
        {!moduleFailure ? <button type="button" className="button button-secondary" onClick={() => {
          this.view = lazy(load);
          this.setState({ error: null });
        }}>{es ? "Reintentar vista" : "Retry view"}</button> : null}
        {moduleFailure ? <button type="button" className="button button-secondary" onClick={() => {
          if (window.confirm(es ? "Recargar puede perder cambios sin guardar. Continuar?" : "Reloading may lose unsaved changes. Continue?")) window.location.reload();
        }}>{es ? "Recargar aplicacion" : "Reload app"}</button> : null}
        {moduleFailure ? <p className="helper-copy">{es ? "Una descarga interrumpida o una actualizacion puede requerir recargar. Guarda el trabajo en otras vistas y comprueba la conexion antes de recargar." : "An interrupted download or app update may require a reload. Save work in other views and check your connection before reloading."}</p> : null}
        <details><summary>{es ? "Detalles del error" : "Error details"}</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{this.state.error instanceof Error ? this.state.error.message : String(this.state.error)}</pre></details>
      </section>;
    }
  };
}
