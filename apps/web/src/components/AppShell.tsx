import { FolderCog, Images, ListChecks, Monitor, Moon, Settings, Sun } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import type { ThemePreference } from "@these/shared";
import { useApp } from "../state/app-context";
import { AppName } from "./AppName";

const navigation = [
  { to: "/browse", label: "Browse", icon: Images },
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
  const { preferences, setPreferences } = useApp();
  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="brand" aria-label="these home"><AppName /><span aria-hidden="true">/</span></NavLink>
        <Navigation className="main-navigation" label="Main navigation" />
        <div className="theme-switcher" role="group" aria-label="Theme">
          {themes.map(({ value, label, icon: Icon }) => <button key={value} type="button" className={preferences.theme === value ? "is-active" : ""} onClick={() => setPreferences({ theme: value })} aria-label={`${label} theme`} aria-pressed={preferences.theme === value} title={`${label} theme`}><Icon size={14} strokeWidth={1.8} /></button>)}
        </div>
      </header>
      <main className="app-content"><Outlet /></main>
      <Navigation className="mobile-navigation" label="Mobile navigation" />
    </div>
  );
}

function Navigation({ className, label }: { className: string; label: string }) {
  return (
    <nav className={className} aria-label={label}>
      {navigation.map(({ to, label: itemLabel, icon: Icon }) => (
        <NavLink key={to} to={to} aria-label={itemLabel} className={({ isActive }) => `nav-link ${isActive ? "is-active" : ""}`}>
          <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
          <span>{itemLabel}</span>
        </NavLink>
      ))}
    </nav>
  );
}
