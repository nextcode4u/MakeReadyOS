import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const dismissedStorageKey = "makereadyos.pwaInstallDismissed";

function readDismissed() {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    return window.localStorage.getItem(dismissedStorageKey) === "true";
  } catch {
    return false;
  }
}

function writeDismissed() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(dismissedStorageKey, "true");
  } catch {
    // Ignore storage failures.
  }
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isMobileBrowser() {
  return /android|iphone|ipad|ipod|mobile|tablet/i.test(window.navigator.userAgent);
}

function isIosBrowser() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const shouldSuppress = useMemo(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return readDismissed() || isStandalone() || !isMobileBrowser();
  }, []);

  useEffect(() => {
    if (shouldSuppress) {
      return undefined;
    }

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", beforeInstall);

    if (isIosBrowser()) {
      const timer = window.setTimeout(() => {
        if (!isStandalone()) {
          setShowIosHelp(true);
          setVisible(true);
        }
      }, 1800);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", beforeInstall);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", beforeInstall);
  }, [shouldSuppress]);

  if (!visible) {
    return null;
  }

  const dismiss = () => {
    writeDismissed();
    setVisible(false);
  };

  const install = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => undefined);
      setDeferredPrompt(null);
      dismiss();
      return;
    }

    setShowIosHelp(true);
  };

  return (
    <aside className="pwa-install-card" role="region" aria-live="polite" aria-label="Install MakeReadyOS">
      <button type="button" className="pwa-install-close" onClick={dismiss} aria-label="Continue in browser and hide install prompt">
        ×
      </button>
      <div>
        <strong>Install MakeReadyOS</strong>
        <p>
          {showIosHelp && !deferredPrompt
            ? "On iPhone or iPad, use Share, then Add to Home Screen."
            : "Add it to your home screen for an app-like mobile workspace."}
        </p>
      </div>
      <div className="pwa-install-actions">
        <button type="button" className="button button-primary" onClick={() => void install()}>
          {deferredPrompt ? "Install" : "How to install"}
        </button>
        <button type="button" className="button button-secondary" onClick={dismiss}>
          Continue in browser
        </button>
      </div>
    </aside>
  );
}
