import { FolderCog, Images, Library, ListChecks, Monitor, Moon, RefreshCw, Settings, Sun, WifiOff } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import type { ThemePreference } from "@these/shared";
import { cx } from "../lib/cx";
import { useApp } from "../state/app-context";
import ui from "../styles/ui.module.css";
import { AppName } from "./AppName";
import styles from "./AppShell.module.css";

const navigation = [
  { to: "/browse", label: "Browse", icon: Images },
  { to: "/collections", label: "Collections", icon: Library },
  { to: "/lists", label: "Lists", icon: ListChecks },
  { to: "/folders", label: "Folders", icon: FolderCog },
  { to: "/settings", label: "Settings", icon: Settings },
];

const themes: Array<{ value: ThemePreference; label: string; icon: typeof Monitor }> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function AppShell() {
  const { bootstrap, error, loading, preferences, refresh, setPreferences } = useApp();
  const serverUnavailable = !bootstrap && !loading && Boolean(error);
  return (
    <div className={styles.appShell} data-app-shell>
      <header className={styles.appHeader}>
        <NavLink to="/" className={styles.brand} aria-label="these home"><AppName /><span aria-hidden="true">/</span></NavLink>
        <Navigation className={styles.mainNavigation} label="Main navigation" />
        <div className={styles.themeSwitcher} role="group" aria-label="Theme">
          {themes.map(({ value, label, icon: Icon }) => <button key={value} type="button" className={preferences.theme === value ? styles.themeActive : undefined} onClick={() => setPreferences({ theme: value })} aria-label={`${label} theme`} aria-pressed={preferences.theme === value} title={`${label} theme`}><Icon size={14} strokeWidth={1.8} /></button>)}
        </div>
      </header>
      <main className={styles.appContent}>
        {serverUnavailable ? <ServerUnavailable message={error!} onRetry={refresh} /> : <Outlet />}
      </main>
      <Navigation className={styles.mobileNavigation} label="Mobile navigation" />
    </div>
  );
}

function ServerUnavailable({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className={styles.serverUnavailable} role="alert">
      <WifiOff size={28} strokeWidth={1.6} aria-hidden="true" />
      <h1>Server unavailable</h1>
      <p>The interface is available, but browsing media and changing lists requires a connection to this server.</p>
      <code>{message}</code>
      <button className={ui.compactButton} type="button" disabled={retrying} onClick={() => void retry()}>
        <RefreshCw size={14} aria-hidden="true" />{retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

function Navigation({ className, label }: { className?: string; label: string }) {
  return (
    <nav className={className} aria-label={label}>
      {navigation.map(({ to, label: itemLabel, icon: Icon }) => (
        <NavLink key={to} to={to} aria-label={itemLabel} className={({ isActive }) => cx(styles.navLink, isActive && styles.navLinkActive)}>
          <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
          <span>{itemLabel}</span>
        </NavLink>
      ))}
    </nav>
  );
}
