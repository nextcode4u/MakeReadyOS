import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./styles/app.css";

const queryClient = new QueryClient();

function showStartupFailure(message: string, detail?: string) {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.getElementById("root");
  if (!root) {
    return;
  }
  root.innerHTML = `
    <main style="min-height:100vh;background:#08111f;color:#f3f6fb;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif;">
      <section style="width:min(560px,100%);background:#0f1a2b;border:1px solid rgba(123,162,255,0.2);border-radius:20px;padding:24px;box-shadow:0 20px 40px rgba(0,0,0,0.35);">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#8da2c8;">MakeReadyOS</p>
        <h1 style="margin:0 0 12px;font-size:32px;line-height:1.05;">Startup error</h1>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#d7e1f4;">${message}</p>
        ${detail ? `<pre style="margin:0;white-space:pre-wrap;word-break:break-word;background:#08111f;border-radius:14px;padding:16px;font-size:13px;line-height:1.45;color:#ffced5;overflow:auto;">${detail}</pre>` : ""}
      </section>
    </main>
  `;
}

function formatStartupError(value: unknown) {
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

window.addEventListener("error", (event) => {
  showStartupFailure("The web app crashed while loading.", formatStartupError(event.error || event.message));
});

window.addEventListener("unhandledrejection", (event) => {
  showStartupFailure("A startup request or script failed before the app could finish loading.", formatStartupError(event.reason));
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch((error) => {
      console.warn("MakeReadyOS service worker registration failed", error);
    });
  });
}

try {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  );
} catch (error) {
  showStartupFailure("React could not initialize the workspace shell.", formatStartupError(error));
}
