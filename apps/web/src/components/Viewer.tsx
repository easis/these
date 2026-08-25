import { Check, ChevronLeft, ChevronRight, CircleHelp, Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ListItemStatus, MediaEntry, MediaMetadataResponse } from "@these/shared";
import { api, isAbortError, query } from "../lib/api";
import { MediaDetailsPanel } from "./MediaDetailsPanel";

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
      else if (event.key === "1" && classificationEnabled && !classificationPending) onStatus("selected");
      else if (event.key === "2" && classificationEnabled && !classificationPending) onStatus("maybe");
      else if (event.key === "0" && classificationEnabled && !classificationPending) onStatus(null);
      else if (event.key.toLowerCase() === "i" && !event.altKey && !event.ctrlKey && !event.metaKey) setDetailsOpen((current) => !current);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [classificationEnabled, classificationPending, index, nextAvailable, nextPending, onClose, onIndex, onNext, onStatus]);

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
    <div className={`viewer${detailsOpen ? " has-details" : ""}`} role="dialog" aria-modal="true" aria-label={media.name} aria-busy={classificationPending || nextPending}>
      <div className="viewer-bar">
        <span className="viewer-title truncate font-mono text-xs text-white/70">{media.name}</span>
        {classificationContext ? <span className="viewer-context-chip" title={classificationContext}>{classificationContext}</span> : null}
        <button type="button" className={`viewer-button${detailsOpen ? " is-active" : ""}`} onClick={() => setDetailsOpen((current) => !current)} aria-label={detailsOpen ? "Hide details" : "Show details"} aria-expanded={detailsOpen} aria-controls="viewer-details" title="Details (I)"><Info size={18} /></button>
        <button type="button" className="viewer-button" onClick={onClose} aria-label="Close viewer"><X size={18} /></button>
      </div>
      <button type="button" className="viewer-nav left" disabled={index === 0} onClick={() => onIndex(index - 1)} aria-label="Previous"><ChevronLeft size={28} /></button>
      <div className="viewer-media">
        {media.kind === "image" ? <img src={`/api/media?${query({ path: media.path })}`} alt={media.name} /> : (
          <video key={media.path} src={`/api/media?${query({ path: media.path })}`} controls autoPlay playsInline />
        )}
      </div>
      <button type="button" className="viewer-nav right" disabled={!nextAvailable || nextPending} onClick={() => onNext ? onNext() : onIndex(index + 1)} aria-label="Next"><ChevronRight size={28} /></button>
      {detailsOpen ? <MediaDetailsPanel
        loading={metadataMatchesMedia ? metadataLoading : true}
        error={metadataMatchesMedia ? metadataError : null}
        metadata={metadataMatchesMedia ? metadata : null}
        onRetry={() => setRetryVersion((value) => value + 1)}
      /> : null}
      <div className="viewer-classify">
        <button disabled={!classificationEnabled || classificationPending} className={media.status === "selected" ? "is-selected" : ""} type="button" onClick={() => onStatus("selected")}><kbd>1</kbd><Check size={15} /> Selected</button>
        <button disabled={!classificationEnabled || classificationPending} className={media.status === "maybe" ? "is-maybe" : ""} type="button" onClick={() => onStatus("maybe")}><kbd>2</kbd><CircleHelp size={15} /> Maybe</button>
        <button disabled={!classificationEnabled || classificationPending || !media.status} type="button" onClick={() => onStatus(null)}><kbd>0</kbd><X size={15} /> Remove</button>
      </div>
    </div>
  );
}
