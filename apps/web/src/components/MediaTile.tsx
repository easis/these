import { Check, CircleHelp, Play, X } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { ListItemStatus, MediaEntry } from "@these/shared";
import { query } from "../lib/api";

interface MediaTileProps {
  media: MediaEntry;
  size: number;
  activeList: boolean;
  classificationPending?: boolean;
  onOpen: () => void;
  onStatus: (status: ListItemStatus | null) => void;
}

export function MediaTile({ media, size, activeList, classificationPending = false, onOpen, onStatus }: MediaTileProps) {
  const shortcut = (event: KeyboardEvent) => {
    if (classificationPending) return;
    if (event.key === "1") onStatus("selected");
    else if (event.key === "2") onStatus("maybe");
    else if (event.key === "0") onStatus(null);
    else if (event.key === "Enter" || event.key === " ") onOpen();
    else return;
    event.preventDefault();
  };
  return (
    <article className={`media-tile state-${media.status ?? "none"}`} style={{ minWidth: 0 }} onKeyDown={shortcut} aria-busy={classificationPending}>
      <button type="button" className="media-open" onClick={onOpen} aria-label={`Open ${media.name}`}>
        <img loading="lazy" decoding="async" src={`/api/thumbnail?${query({ path: media.path, size: Math.max(320, size * 2) })}`} alt="" />
        {media.kind === "video" ? <span className="video-indicator"><Play size={12} fill="currentColor" /> Video</span> : null}
      </button>
      <div className="media-caption">
        <span className="truncate" title={media.name}>{media.name}</span>
        <span className="tile-actions" aria-label={`Classification for ${media.name}`}>
          <button type="button" disabled={!activeList || classificationPending} className={media.status === "selected" ? "is-selected" : ""} onClick={() => onStatus("selected")} title="Selected (1)" aria-label="Mark selected"><Check size={12} /></button>
          <button type="button" disabled={!activeList || classificationPending} className={media.status === "maybe" ? "is-maybe" : ""} onClick={() => onStatus("maybe")} title="Maybe (2)" aria-label="Mark maybe"><CircleHelp size={12} /></button>
          {media.status ? <button type="button" disabled={classificationPending} onClick={() => onStatus(null)} title="Remove (0)" aria-label="Remove from active list"><X size={12} /></button> : null}
        </span>
      </div>
    </article>
  );
}
