import { Check, ChevronLeft, ChevronRight, CircleHelp, X } from "lucide-react";
import { useEffect } from "react";
import type { ListItemStatus, MediaEntry } from "@these/shared";
import { query } from "../lib/api";

interface ViewerProps {
  items: MediaEntry[];
  index: number;
  classificationContext: string | null;
  classificationEnabled: boolean;
  classificationPending?: boolean;
  onIndex: (index: number) => void;
  onClose: () => void;
  onStatus: (status: ListItemStatus | null) => void;
}

export function Viewer({ items, index, classificationContext, classificationEnabled, classificationPending = false, onIndex, onClose, onStatus }: ViewerProps) {
  const media = items[index];
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
      else if (event.key === "ArrowRight") onIndex(Math.min(items.length - 1, index + 1));
      else if (event.key === "1" && classificationEnabled && !classificationPending) onStatus("selected");
      else if (event.key === "2" && classificationEnabled && !classificationPending) onStatus("maybe");
      else if (event.key === "0" && classificationEnabled && !classificationPending) onStatus(null);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [classificationEnabled, classificationPending, index, items.length, onClose, onIndex, onStatus]);

  if (!media) return null;
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={media.name} aria-busy={classificationPending}>
      <div className="viewer-bar">
        <span className="truncate font-mono text-xs text-white/70">{media.name}</span>
        <span className="ml-auto text-xs text-white/55">{classificationContext ?? "Classification unavailable"}</span>
        <button type="button" className="viewer-button" onClick={onClose} aria-label="Close viewer"><X size={18} /></button>
      </div>
      <button type="button" className="viewer-nav left" disabled={index === 0} onClick={() => onIndex(index - 1)} aria-label="Previous"><ChevronLeft size={28} /></button>
      <div className="viewer-media">
        {media.kind === "image" ? <img src={`/api/media?${query({ path: media.path })}`} alt={media.name} /> : (
          <video key={media.path} src={`/api/media?${query({ path: media.path })}`} controls autoPlay playsInline />
        )}
      </div>
      <button type="button" className="viewer-nav right" disabled={index === items.length - 1} onClick={() => onIndex(index + 1)} aria-label="Next"><ChevronRight size={28} /></button>
      <div className="viewer-classify">
        <button disabled={!classificationEnabled || classificationPending} className={media.status === "selected" ? "is-selected" : ""} type="button" onClick={() => onStatus("selected")}><kbd>1</kbd><Check size={15} /> Selected</button>
        <button disabled={!classificationEnabled || classificationPending} className={media.status === "maybe" ? "is-maybe" : ""} type="button" onClick={() => onStatus("maybe")}><kbd>2</kbd><CircleHelp size={15} /> Maybe</button>
        <button disabled={!classificationEnabled || classificationPending || !media.status} type="button" onClick={() => onStatus(null)}><kbd>0</kbd><X size={15} /> Remove</button>
      </div>
    </div>
  );
}
