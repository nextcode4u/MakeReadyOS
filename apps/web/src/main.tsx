import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { installAppErrorHandlers, showAppError } from "./lib/appErrors";
import "./styles/app.css";

const queryClient = new QueryClient();
const OnCallPanel = React.lazy(() => import("./components/OnCallPanel").then(module => ({ default: module.OnCallPanel })));

const removeErrorHandlers = installAppErrorHandlers();
if (import.meta.hot) import.meta.hot.dispose(removeErrorHandlers);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`/sw.js?v=${import.meta.env.VITE_SW_VERSION}`, { updateViaCache: "none" }).catch((error) => {
      console.warn("MakeReadyOS service worker registration failed", error);
    });
  });
}

try {
  ReactDOM.createRoot(document.getElementById("root")!, {
    onUncaughtError: (error) => { console.error(error); showAppError(error, true); },
  }).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        {/^\/on-call\/?$/.test(window.location.pathname) ? <React.Suspense fallback={<p role="status">Loading on-call...</p>}><OnCallPanel external /></React.Suspense> : <App />}
      </QueryClientProvider>
    </React.StrictMode>,
  );
} catch (error) {
  showAppError(error, true);
}
