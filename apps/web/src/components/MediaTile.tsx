import { Check, CircleHelp, CircleX, Play } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { ListItemStatus, MediaEntry } from "@these/shared";
import { cx } from "../lib/cx";
import { query } from "../lib/api";
import styles from "./MediaTile.module.css";

interface MediaTileProps {
  media: MediaEntry;
  size: number;
  activeList: boolean;
  classificationPending?: boolean;
  className?: string;
  onOpen: () => void;
  onStatus: (status: ListItemStatus | null) => void;
}

export function MediaTile({ media, size, activeList, classificationPending = false, className, onOpen, onStatus }: MediaTileProps) {
  const shortcut = (event: KeyboardEvent) => {
    if (classificationPending) return;
    if (event.key === "1") onStatus(media.status === "selected" ? null : "selected");
    else if (event.key === "2") onStatus(media.status === "maybe" ? null : "maybe");
    else if (event.key === "3") onStatus(media.status === "discarded" ? null : "discarded");
    else if (event.key === "0") onStatus(null);
    else if (event.key === "Enter" || event.key === " ") onOpen();
    else return;
    event.preventDefault();
  };
  return (
    <article className={cx(styles.mediaTile, media.status === "selected" && styles.selected, media.status === "maybe" && styles.maybe, media.status === "discarded" && styles.discarded, className)} style={{ minWidth: 0 }} onKeyDown={shortcut} aria-busy={classificationPending}>
      <button type="button" className={styles.mediaOpen} onClick={onOpen} aria-label={`Open ${media.name}`}>
        <img loading="lazy" decoding="async" src={`/api/thumbnail?${query({ path: media.path, size: Math.max(320, size * 2) })}`} alt="" />
        {media.kind === "video" ? <span className={styles.videoIndicator}><Play size={12} fill="currentColor" /> Video</span> : null}
      </button>
      <div className={styles.mediaCaption}>
        <span className="truncate" title={media.name}>{media.name}</span>
        <span className={styles.tileActions} aria-label={`Classification for ${media.name}`}>
          <button type="button" disabled={!activeList || classificationPending} className={media.status === "selected" ? styles.selectedAction : undefined} aria-pressed={media.status === "selected"} onClick={() => onStatus(media.status === "selected" ? null : "selected")} title={media.status === "selected" ? "Remove Selected" : "Selected (1)"} aria-label={media.status === "selected" ? "Remove selected status" : "Mark selected"}><Check size={12} /></button>
          <button type="button" disabled={!activeList || classificationPending} className={media.status === "maybe" ? styles.maybeAction : undefined} aria-pressed={media.status === "maybe"} onClick={() => onStatus(media.status === "maybe" ? null : "maybe")} title={media.status === "maybe" ? "Remove Maybe" : "Maybe (2)"} aria-label={media.status === "maybe" ? "Remove maybe status" : "Mark maybe"}><CircleHelp size={12} /></button>
          <button type="button" disabled={!activeList || classificationPending} className={media.status === "discarded" ? styles.discardedAction : undefined} aria-pressed={media.status === "discarded"} onClick={() => onStatus(media.status === "discarded" ? null : "discarded")} title={media.status === "discarded" ? "Remove Discarded" : "Discarded (3)"} aria-label={media.status === "discarded" ? "Remove discarded status" : "Mark discarded"}><CircleX size={12} /></button>
        </span>
      </div>
    </article>
  );
}
