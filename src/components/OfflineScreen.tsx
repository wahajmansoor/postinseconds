import { useEffect, useState, type ReactNode } from "react";
import { Network } from "@capacitor/network";
import { WifiOff01Icon, ReloadIcon } from "hugeicons-react";

// Wraps the whole app: shows a full-screen "you're offline" takeover the
// instant connectivity drops, and drops away again the moment it's back —
// no manual reload needed to recover, the Reload App button is just there
// for the case where the app itself also needs a fresh start (e.g. a
// request that was already mid-flight when the connection dropped).
// @capacitor/network works identically on native (real OS connectivity
// APIs) and on web (falls back to navigator.onLine internally), so this
// needs no Capacitor.isNativePlatform() branching to work everywhere.
export function OfflineGate({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let mounted = true;

    Network.getStatus()
      .then((status) => {
        if (mounted) setIsOnline(status.connected);
      })
      .catch(() => {});

    const listenerPromise = Network.addListener("networkStatusChange", (status) => {
      if (mounted) setIsOnline(status.connected);
    });

    return () => {
      mounted = false;
      listenerPromise.then((l) => l.remove()).catch(() => {});
    };
  }, []);

  return (
    <>
      {children}
      {!isOnline ? <OfflineScreen /> : null}
    </>
  );
}

function OfflineScreen() {
  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-6 bg-background px-6 text-center animate-in fade-in duration-300">
      <img src="/logo.png" alt="Post In Seconds" className="h-12 w-auto" />

      {/* Gently bobbing icon badge — same friendly, non-alarming treatment
          as the error page's icon, since this is a passing condition the
          app already recovers from on its own. */}
      <div
        className="grid h-24 w-24 place-items-center rounded-[2rem] bg-[image:var(--gradient-brand)] shadow-[var(--shadow-glow)] animate-bounce"
        style={{ animationDuration: "2.4s" }}
      >
        <WifiOff01Icon size={40} className="text-white" />
      </div>

      <div>
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
          No Internet Connection
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Please check your internet connection. This will reconnect
          automatically the moment you're back online.
        </p>
      </div>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="group inline-flex items-center gap-2 rounded-2xl bg-[image:var(--gradient-brand)] px-6 py-3 text-sm font-bold text-white shadow-[var(--shadow-glow)] transition-transform hover:scale-105 active:scale-95"
      >
        <ReloadIcon
          size={16}
          className="transition-transform duration-500 group-hover:rotate-180"
        />
        Reload App
      </button>
    </div>
  );
}
