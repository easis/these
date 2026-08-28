import { Check, ChevronLeft, ChevronRight, CircleHelp, CircleX, Download, Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ListItemStatus, MediaEntry, MediaMetadataResponse } from "@these/shared";
import { api, isAbortError, query } from "../lib/api";
import { cx } from "../lib/cx";
import { startMediaDownload } from "../lib/downloads";
import { MediaDetailsPanel } from "./MediaDetailsPanel";
import { ImageZoom } from "./ImageZoom";
import styles from "./Viewer.module.css";

interface ViewerProps {
  items: MediaEntry[];
  index: number;
  classificationContext: string | null;
  classificationEnabled: boolean;
  classificationPending?: boolean;
  hasNext?: boolean;
  nextPending?: boolean;
  onIndex: (index: number) => void;
  onNext?: () => void;
  onClose: () => void;
  onStatus: (status: ListItemStatus | null) => void;
}

export function Viewer({ items, index, classificationContext, classificationEnabled, classificationPending = false, hasNext, nextPending = false, onIndex, onNext, onClose, onStatus }: ViewerProps) {
  const media = items[index];
  const nextAvailable = hasNext ?? index < items.length - 1;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [metadata, setMetadata] = useState<MediaMetadataResponse | null>(null);
  const [metadataPath, setMetadataPath] = useState<string | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const metadataCache = useRef(new Map<string, MediaMetadataResponse>());
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
      else if (event.key === "ArrowRight") {
        if (nextAvailable && !nextPending) {
          if (onNext) onNext();
          else onIndex(index + 1);
        }
      }
      else if (event.key === "1" && classificationEnabled && !classificationPending) onStatus(media?.status === "selected" ? null : "selected");
      else if (event.key === "2" && classificationEnabled && !classificationPending) onStatus(media?.status === "maybe" ? null : "maybe");
      else if (event.key === "3" && classificationEnabled && !classificationPending) onStatus(media?.status === "discarded" ? null : "discarded");
      else if (event.key === "0" && classificationEnabled && !classificationPending) onStatus(null);
      else if (event.key.toLowerCase() === "i" && !event.altKey && !event.ctrlKey && !event.metaKey) setDetailsOpen((current) => !current);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [classificationEnabled, classificationPending, index, media?.status, nextAvailable, nextPending, onClose, onIndex, onNext, onStatus]);

  useEffect(() => {
    if (!detailsOpen || !media) return;
    const cached = metadataCache.current.get(media.path);
    if (cached) {
      setMetadataPath(media.path);
      setMetadata(cached);
      setMetadataError(null);
      setMetadataLoading(false);
      return;
    }
    const controller = new AbortController();
    let current = true;
    setMetadataPath(media.path);
    setMetadata(null);
    setMetadataError(null);
    setMetadataLoading(true);
    void api<MediaMetadataResponse>(`/api/media-metadata?${query({ path: media.path })}`, { signal: controller.signal })
      .then((response) => {
        if (!current) return;
        metadataCache.current.set(media.path, response);
        setMetadata(response);
        setMetadataLoading(false);
      })
      .catch((error) => {
        if (!current || isAbortError(error)) return;
        setMetadataError(error instanceof Error ? error.message : "Could not read this file's metadata.");
        setMetadataLoading(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [detailsOpen, media?.path, retryVersion]);

  if (!media) return null;
  const metadataMatchesMedia = metadataPath === media.path;
  return (
    <div className={cx(styles.viewer, detailsOpen && styles.hasDetails)} role="dialog" aria-modal="true" aria-label={media.name} aria-busy={classificationPending || nextPending}>
      <div className={styles.viewerBar}>
        <span className={cx(styles.viewerTitle, "truncate font-mono text-xs text-white/70")}>{media.name}</span>
        {classificationContext ? <span className={styles.contextChip} title={classificationContext}>{classificationContext}</span> : null}
        <button type="button" className={styles.viewerButton} onClick={() => startMediaDownload(media.path, media.name)} aria-label={`Download ${media.name}`} title="Download original"><Download size={18} /></button>
        <button type="button" className={cx(styles.viewerButton, detailsOpen && styles.buttonActive)} onClick={() => setDetailsOpen((current) => !current)} aria-label={detailsOpen ? "Hide details" : "Show details"} aria-expanded={detailsOpen} aria-controls="viewer-details" title="Details (I)"><Info size={18} /></button>
        <button type="button" className={styles.viewerButton} onClick={onClose} aria-label="Close viewer"><X size={18} /></button>
      </div>
      <button type="button" className={cx(styles.viewerNav, styles.left)} disabled={index === 0} onClick={() => onIndex(index - 1)} aria-label="Previous"><ChevronLeft size={28} /></button>
      <div className={styles.viewerMedia}>
        {media.kind === "image" ? <ImageZoom path={media.path} name={media.name} src={`/api/media?${query({ path: media.path })}`} layoutKey={detailsOpen} /> : (
          <video key={media.path} src={`/api/media?${query({ path: media.path })}`} controls autoPlay playsInline />
        )}
      </div>
      <button type="button" className={cx(styles.viewerNav, styles.right)} disabled={!nextAvailable || nextPending} onClick={() => onNext ? onNext() : onIndex(index + 1)} aria-label="Next"><ChevronRight size={28} /></button>
      {detailsOpen ? <MediaDetailsPanel
        loading={metadataMatchesMedia ? metadataLoading : true}
        error={metadataMatchesMedia ? metadataError : null}
        metadata={metadataMatchesMedia ? metadata : null}
        onRetry={() => setRetryVersion((value) => value + 1)}
      /> : null}
      <div className={styles.viewerClassify}>
        <button disabled={!classificationEnabled || classificationPending} className={media.status === "selected" ? styles.selected : undefined} type="button" aria-pressed={media.status === "selected"} aria-label={media.status === "selected" ? "Remove selected status" : "Mark selected"} onClick={() => onStatus(media.status === "selected" ? null : "selected")}><kbd>1</kbd><Check size={15} /> Selected</button>
        <button disabled={!classificationEnabled || classificationPending} className={media.status === "maybe" ? styles.maybe : undefined} type="button" aria-pressed={media.status === "maybe"} aria-label={media.status === "maybe" ? "Remove maybe status" : "Mark maybe"} onClick={() => onStatus(media.status === "maybe" ? null : "maybe")}><kbd>2</kbd><CircleHelp size={15} /> Maybe</button>
        <button disabled={!classificationEnabled || classificationPending} className={media.status === "discarded" ? styles.discarded : undefined} type="button" aria-pressed={media.status === "discarded"} aria-label={media.status === "discarded" ? "Remove discarded status" : "Mark discarded"} onClick={() => onStatus(media.status === "discarded" ? null : "discarded")}><kbd>3</kbd><CircleX size={15} /> Discarded</button>
      </div>
    </div>
  );
}
