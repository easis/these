import { ArrowRight, FolderHeart, Images, ListChecks, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { AppName } from "../components/AppName";
import { useApp } from "../state/app-context";

export function HomePage() {
  const { bootstrap, loading } = useApp();
  const availableRoots = bootstrap?.roots.filter((root) => root.available) ?? [];
  const firstRoot = availableRoots[0];
  return (
    <div className="home-scroll">
      <div className="home-page">
        <h1>Browse your folders.<br />Keep the files where they are.</h1>

        {loading ? <div className="root-notice">Reading configured media roots…</div> : availableRoots.length === 0 ? (
          <div className="root-notice is-warning">
            <strong>No media root is available.</strong>
            <span>Add a root in <Link to="/settings">Settings</Link>. In Docker, mount the directory first and enter its container path.</span>
            <pre>/media/photos</pre>
          </div>
        ) : (
          <div className="root-notice">
            <span className="status-dot is-selected" />
            <span><strong>{availableRoots.length}</strong> {availableRoots.length === 1 ? "root" : "roots"} ready</span>
            <span className="font-mono text-xs text-muted">{availableRoots.map((root) => root.path).join(" · ")}</span>
          </div>
        )}

        <div className="home-actions">
          <Link className={`home-action ${!firstRoot ? "pointer-events-none opacity-45" : ""}`} to={firstRoot ? `/browse?path=${encodeURIComponent(firstRoot.path)}` : "/browse"}>
            <Images size={18} /><span><strong>Browse media</strong><small>Open folders and inspect files</small></span><ArrowRight size={16} />
          </Link>
          <Link className="home-action" to="/lists"><ListChecks size={18} /><span><strong>Review lists</strong><small>Selected and Maybe, side by side</small></span><ArrowRight size={16} /></Link>
          <Link className="home-action" to="/folders"><FolderHeart size={18} /><span><strong>Folder metadata</strong><small>Aliases, favorites and hidden folders</small></span><ArrowRight size={16} /></Link>
        </div>

        <div className="home-footnote"><ShieldCheck size={15} /><span>Filesystem access stays inside configured roots. Media mounts can remain read-only; <AppName /> writes only metadata and its disposable thumbnail cache under <code>/data</code>.</span></div>
      </div>
    </div>
  );
}
