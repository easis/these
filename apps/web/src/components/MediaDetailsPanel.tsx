import type { ReactNode } from "react";
import type { AudioStreamMetadata, MediaMetadataResponse, VideoStreamMetadata } from "@these/shared";
import styles from "./Viewer.module.css";

interface MediaDetailsPanelProps {
  loading: boolean;
  error: string | null;
  metadata: MediaMetadataResponse | null;
  onRetry: () => void;
}

export function MediaDetailsPanel({ loading, error, metadata, onRetry }: MediaDetailsPanelProps) {
  return (
    <aside id="viewer-details" className={styles.viewerDetails} aria-label="Technical details" aria-busy={loading}>
      <div className={styles.detailsHeading}>
        <div><span>Details</span><small>Technical metadata</small></div>
      </div>
      {loading ? <DetailsLoading /> : error ? <DetailsError error={error} onRetry={onRetry} /> : metadata ? <DetailsContent metadata={metadata} /> : null}
    </aside>
  );
}

function DetailsLoading() {
  return <div className={styles.detailsMessage}><span className={styles.detailsPulse} />Reading file metadata…</div>;
}

function DetailsError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <div className={styles.detailsError}><strong>Could not load details.</strong><p>{error}</p><button type="button" onClick={onRetry}>Retry</button></div>;
}

function DetailsContent({ metadata }: { metadata: MediaMetadataResponse }) {
  const dimensions = metadata.image
    ? `${metadata.image.width.toLocaleString("en-US")} × ${metadata.image.height.toLocaleString("en-US")}`
    : firstVideoDimensions(metadata);
  const format = metadata.image?.format ?? metadata.video?.container?.split(",")[0] ?? metadata.file.extension;
  const summary = [format?.toUpperCase(), dimensions, formatBytes(metadata.file.size)].filter(Boolean).join(" · ");
  const capture = metadata.capture;
  const location = metadata.location;
  return <div className={styles.detailsScroll}>
    <p className={styles.detailsSignature}>{summary}</p>
    {metadata.warnings.length ? <div className={styles.detailsWarning} role="status">{metadata.warnings.join(" ")}</div> : null}
    <DetailSection title="File">
      <DetailRow label="Location" value={<span className={styles.detailsPath}>{metadata.file.rootLabel} / {metadata.file.relativePath}</span>} />
      <DetailRow label="Type" value={[metadata.file.extension.toUpperCase(), metadata.file.mimeType].filter(Boolean).join(" · ")} />
      <DetailRow label="Size" value={formatBytes(metadata.file.size)} />
      <DetailRow label="Modified" value={formatFileDate(metadata.file.modifiedAt)} />
    </DetailSection>
    {metadata.image ? <DetailSection title="Image">
      <DetailRow label="Dimensions" value={`${dimensions} px`} />
      <DetailRow label="Resolution" value={`${formatNumber(metadata.image.megapixels)} MP`} />
      <DetailRow label="Orientation" value={formatOrientation(metadata.image.orientation)} />
      <DetailRow label="Color" value={joinValues(metadata.image.colorSpace, metadata.image.channels && `${metadata.image.channels} channels`, metadata.image.depth)} />
      <DetailRow label="Bit depth" value={metadata.image.bitsPerSample && `${metadata.image.bitsPerSample} bits/sample`} />
      <DetailRow label="Density" value={metadata.image.densityDpi && `${formatNumber(metadata.image.densityDpi)} DPI`} />
      <DetailRow label="Chroma" value={metadata.image.chromaSubsampling} />
      <DetailRow label="Compression" value={metadata.image.compression} />
      <DetailRow label="Frames" value={metadata.image.frameCount} />
      <DetailRow label="Properties" value={joinValues(
        metadata.image.hasAlpha ? "Alpha" : undefined,
        metadata.image.hasProfile ? "Color profile" : undefined,
        metadata.image.isProgressive ? "Progressive" : undefined,
      )} />
    </DetailSection> : null}
    {metadata.video ? <>
      <DetailSection title="Video">
        <DetailRow label="Container" value={joinValues(metadata.video.container, metadata.video.containerLongName)} />
        <DetailRow label="Duration" value={formatDuration(metadata.video.durationSeconds)} />
        <DetailRow label="Bitrate" value={formatBitRate(metadata.video.bitRate)} />
      </DetailSection>
      {metadata.video.videoStreams.map((stream) => <VideoStreamSection key={stream.index} stream={stream} />)}
      {metadata.video.audioStreams.map((stream) => <AudioStreamSection key={stream.index} stream={stream} />)}
    </> : null}
    {capture ? <DetailSection title="Capture">
      <DetailRow label="Taken" value={formatCaptureDate(capture.capturedAt)} />
      <DetailRow label="Camera" value={joinValues(capture.cameraMake, capture.cameraModel)} />
      <DetailRow label="Lens" value={capture.lensModel} />
      <DetailRow label="Exposure" value={formatExposure(capture.exposureTimeSeconds)} />
      <DetailRow label="Aperture" value={capture.aperture && `ƒ/${formatNumber(capture.aperture)}`} />
      <DetailRow label="ISO" value={capture.iso} />
      <DetailRow label="Focal length" value={formatFocalLength(capture.focalLengthMm, capture.focalLength35mm)} />
      <DetailRow label="Exposure bias" value={capture.exposureBiasEv !== undefined ? `${signedNumber(capture.exposureBiasEv)} EV` : undefined} />
      <DetailRow label="Flash" value={capture.flash} />
      <DetailRow label="White balance" value={capture.whiteBalance} />
      <DetailRow label="Metering" value={capture.meteringMode} />
      <DetailRow label="Program" value={capture.exposureProgram} />
      <DetailRow label="Software" value={capture.software} />
      <DetailRow label="Artist" value={capture.artist} />
      <DetailRow label="Copyright" value={capture.copyright} />
      <DetailRow label="Description" value={capture.description} />
      <DetailRow label="Keywords" value={capture.keywords?.join(" · ")} />
    </DetailSection> : null}
    {location ? <DetailSection title="Location">
      <DetailRow label="Coordinates" value={<a href={googleMapsUrl(location.latitude, location.longitude)} target="_blank" rel="noreferrer">{formatCoordinate(location.latitude)}, {formatCoordinate(location.longitude)} ↗</a>} />
      <DetailRow label="Altitude" value={location.altitudeMeters !== undefined ? `${formatNumber(location.altitudeMeters)} m` : undefined} />
    </DetailSection> : null}
  </div>;
}

function VideoStreamSection({ stream }: { stream: VideoStreamMetadata }) {
  const dimensions = stream.width && stream.height ? `${stream.width.toLocaleString("en-US")} × ${stream.height.toLocaleString("en-US")} px` : undefined;
  return <DetailSection title={`Video stream ${stream.index}`}>
    <DetailRow label="Codec" value={joinValues(stream.codec, stream.codecLongName, stream.profile)} />
    <DetailRow label="Dimensions" value={dimensions} />
    <DetailRow label="Frame rate" value={stream.frameRate && `${formatNumber(stream.frameRate)} FPS`} />
    <DetailRow label="Pixel format" value={stream.pixelFormat} />
    <DetailRow label="Color" value={joinValues(stream.colorSpace, stream.colorTransfer, stream.colorPrimaries)} />
    <DetailRow label="Bitrate" value={formatBitRate(stream.bitRate)} />
    <DetailRow label="Duration" value={formatDuration(stream.durationSeconds)} />
    <DetailRow label="Language" value={stream.language} />
  </DetailSection>;
}

function AudioStreamSection({ stream }: { stream: AudioStreamMetadata }) {
  return <DetailSection title={`Audio stream ${stream.index}`}>
    <DetailRow label="Codec" value={joinValues(stream.codec, stream.codecLongName, stream.profile)} />
    <DetailRow label="Channels" value={joinValues(stream.channels, stream.channelLayout)} />
    <DetailRow label="Sample rate" value={stream.sampleRateHz && `${stream.sampleRateHz.toLocaleString("en-US")} Hz`} />
    <DetailRow label="Bitrate" value={formatBitRate(stream.bitRate)} />
    <DetailRow label="Duration" value={formatDuration(stream.durationSeconds)} />
    <DetailRow label="Language" value={stream.language} />
  </DetailSection>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.detailsSection}><h2>{title}</h2><dl>{children}</dl></section>;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function firstVideoDimensions(metadata: MediaMetadataResponse): string | undefined {
  const stream = metadata.video?.videoStreams.find((candidate) => candidate.width && candidate.height);
  return stream?.width && stream.height ? `${stream.width.toLocaleString("en-US")} × ${stream.height.toLocaleString("en-US")}` : undefined;
}

function joinValues(...values: Array<string | number | undefined>): string | undefined {
  const present = values.filter((value): value is string | number => value !== undefined && value !== "");
  return present.length ? present.join(" · ") : undefined;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

function signedNumber(value: number): string {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toLocaleString("en-US")} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = -1;
  do { value /= 1024; unit += 1; } while (value >= 1024 && unit < units.length - 1);
  return `${value.toLocaleString("en-US", { maximumFractionDigits: value >= 10 ? 1 : 2 })} ${units[unit]}`;
}

function formatBitRate(bitsPerSecond?: number): string | undefined {
  if (bitsPerSecond === undefined) return undefined;
  return bitsPerSecond >= 1_000_000 ? `${formatNumber(bitsPerSecond / 1_000_000)} Mbps` : `${formatNumber(bitsPerSecond / 1_000)} kbps`;
}

function formatDuration(seconds?: number): string | undefined {
  if (seconds === undefined) return undefined;
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remaining = whole % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}` : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatExposure(seconds?: number): string | undefined {
  if (seconds === undefined) return undefined;
  if (seconds > 0 && seconds < 1) return `1/${Math.round(1 / seconds)} s`;
  return `${formatNumber(seconds)} s`;
}

function formatFocalLength(value?: number, equivalent?: number): string | undefined {
  if (value === undefined) return undefined;
  return `${formatNumber(value)} mm${equivalent !== undefined ? ` · ${formatNumber(equivalent)} mm equivalent` : ""}`;
}

function formatOrientation(value?: number): string | undefined {
  if (value === undefined) return undefined;
  const labels: Record<number, string> = { 1: "Normal", 2: "Mirrored", 3: "180°", 4: "180° mirrored", 5: "90° mirrored", 6: "90° clockwise", 7: "90° mirrored", 8: "90° counterclockwise" };
  return labels[value] ?? String(value);
}

function formatFileDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatCaptureDate(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)) {
    const withSeparator = normalized.replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T").replace(/ ([+-]\d{2}:?\d{2})$/, "$1");
    return formatFileDate(withSeparator);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(normalized);
  if (!match) return value;
  const [, year, month, day, time] = match;
  const monthName = new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(2020, Number(month) - 1, 1));
  return `${monthName} ${Number(day)}, ${year}, ${time}`;
}

function formatCoordinate(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function googleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}
