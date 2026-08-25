import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import exifr from "exifr";
import sharp from "sharp";
import type {
  AudioStreamMetadata,
  CaptureMetadata,
  ImageTechnicalMetadata,
  LocationMetadata,
  MediaKind,
  MediaMetadataResponse,
  VideoStreamMetadata,
  VideoTechnicalMetadata,
} from "@these/shared";
import { mimeTypeForPath } from "../lib/media.js";

const PROBE_TIMEOUT_MS = 10_000;
const PROBE_OUTPUT_LIMIT = 2 * 1024 * 1024;
const PROBE_CONCURRENCY = 2;
const TEXT_LIMIT = 1_024;

interface InspectMediaInput {
  canonicalPath: string;
  requestedPath: string;
  rootPath: string;
  rootLabel: string;
  kind: MediaKind;
  signal?: AbortSignal;
}

type ExifValues = Record<string, unknown>;
type VideoProbe = (source: string, signal?: AbortSignal) => Promise<unknown>;

interface EmbeddedMetadata {
  capture?: CaptureMetadata;
  location?: LocationMetadata;
  warning?: string;
}

interface ProbeRunOptions {
  timeoutMs?: number;
  outputLimitBytes?: number;
  signal?: AbortSignal;
  spawnProcess?: (command: string, args: string[], options: { shell: false }) => ChildProcessWithoutNullStreams;
}

interface ProbeStream {
  index?: unknown;
  codec_type?: unknown;
  codec_name?: unknown;
  codec_long_name?: unknown;
  profile?: unknown;
  width?: unknown;
  height?: unknown;
  avg_frame_rate?: unknown;
  r_frame_rate?: unknown;
  pix_fmt?: unknown;
  color_space?: unknown;
  color_transfer?: unknown;
  color_primaries?: unknown;
  bit_rate?: unknown;
  duration?: unknown;
  sample_rate?: unknown;
  channels?: unknown;
  channel_layout?: unknown;
  tags?: Record<string, unknown>;
}

interface ProbePayload {
  format?: {
    format_name?: unknown;
    format_long_name?: unknown;
    duration?: unknown;
    bit_rate?: unknown;
    tags?: Record<string, unknown>;
  };
  streams?: ProbeStream[];
}

class ProbeLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(createAbortError());
    return new Promise((resolve, reject) => {
      const start = () => {
        signal?.removeEventListener("abort", abort);
        this.active += 1;
        resolve();
      };
      const abort = () => {
        const index = this.waiting.indexOf(start);
        if (index === -1) return;
        this.waiting.splice(index, 1);
        reject(createAbortError());
      };
      if (this.active < this.limit) start();
      else {
        this.waiting.push(start);
        signal?.addEventListener("abort", abort, { once: true });
      }
    });
  }

  private release() {
    this.active -= 1;
    this.waiting.shift()?.();
  }
}

const videoProbeLimiter = new ProbeLimiter(PROBE_CONCURRENCY);
const defaultVideoProbe: VideoProbe = (source, signal) => runFfprobe(source, { signal });

export class MediaMetadataService {
  constructor(private readonly probeVideo: VideoProbe = defaultVideoProbe) {}

  async inspect(input: InspectMediaInput): Promise<MediaMetadataResponse> {
    const fileStat = await stat(input.canonicalPath);
    const response: MediaMetadataResponse = {
      kind: input.kind,
      file: {
        name: path.basename(input.requestedPath),
        rootLabel: input.rootLabel,
        relativePath: path.relative(input.rootPath, input.requestedPath).split(path.sep).join("/"),
        extension: path.extname(input.requestedPath).slice(1).toLowerCase(),
        mimeType: mimeTypeForPath(input.requestedPath),
        size: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString(),
      },
      warnings: [],
    };

    if (input.kind === "image") {
      const [technical, embedded] = await Promise.allSettled([
        readImageTechnicalMetadata(input.canonicalPath),
        readEmbeddedImageMetadata(input.canonicalPath),
      ]);
      if (technical.status === "fulfilled") response.image = technical.value;
      else response.warnings.push("Could not read the image properties.");
      if (embedded.status === "fulfilled") {
        if (embedded.value.capture) response.capture = embedded.value.capture;
        if (embedded.value.location) response.location = embedded.value.location;
        if (embedded.value.warning) response.warnings.push(embedded.value.warning);
      } else {
        response.warnings.push("Could not read the embedded image metadata.");
      }
    } else {
      try {
        const payload = await videoProbeLimiter.run(() => this.probeVideo(input.canonicalPath, input.signal), input.signal);
        if (input.signal?.aborted) throw createAbortError();
        const video = extractVideoMetadata(payload);
        response.video = video.video;
        if (video.capture) response.capture = video.capture;
      } catch (error) {
        if (input.signal?.aborted) throw error;
        response.warnings.push("Could not read the video stream metadata.");
      }
    }

    return response;
  }
}

async function readImageTechnicalMetadata(source: string): Promise<ImageTechnicalMetadata> {
  const metadata = await sharp(source, { animated: false }).metadata();
  const animatedHeight = metadata.pages && metadata.pageHeight ? metadata.pageHeight : undefined;
  const swapsDimensions = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8;
  const rawWidth = metadata.width;
  const rawHeight = animatedHeight ?? metadata.height;
  const width = animatedHeight ? (swapsDimensions ? rawHeight : rawWidth) : metadata.autoOrient.width;
  const height = animatedHeight ? (swapsDimensions ? rawWidth : rawHeight) : metadata.autoOrient.height;
  const megapixels = width * height / 1_000_000;
  return compactObject({
    format: metadata.format,
    width,
    height,
    megapixels: Number(megapixels.toPrecision(3)),
    orientation: metadata.orientation,
    colorSpace: metadata.space,
    channels: metadata.channels,
    depth: metadata.depth,
    bitsPerSample: metadata.bitsPerSample,
    densityDpi: metadata.density,
    hasAlpha: metadata.hasAlpha,
    hasProfile: metadata.hasProfile,
    isProgressive: metadata.isProgressive,
    chromaSubsampling: metadata.chromaSubsampling,
    compression: metadata.compression,
    frameCount: metadata.pages,
  });
}

async function readEmbeddedImageMetadata(source: string): Promise<EmbeddedMetadata> {
  const values = await exifr.parse(source, {
    tiff: true,
    ifd0: { reviveValues: true },
    xmp: true,
    iptc: true,
    icc: false,
    jfif: false,
    ihdr: false,
    makerNote: false,
    userComment: false,
    reviveValues: false,
    sanitize: true,
    mergeOutput: true,
  }) as ExifValues | undefined;
  return values ? extractEmbeddedMetadata(values) : {};
}

export function extractEmbeddedMetadata(values: ExifValues): EmbeddedMetadata {
  const capturedAt = captureDate(values);
  const capture = compactObject<CaptureMetadata>({
    capturedAt,
    cameraMake: textValue(values.Make),
    cameraModel: textValue(values.Model),
    lensModel: textValue(values.LensModel ?? values.Lens),
    exposureTimeSeconds: numberValue(values.ExposureTime),
    aperture: numberValue(values.FNumber ?? values.ApertureValue),
    iso: numberValue(values.ISO ?? values.ISOSpeedRatings),
    focalLengthMm: numberValue(values.FocalLength),
    focalLength35mm: numberValue(values.FocalLengthIn35mmFormat ?? values.FocalLengthIn35mmFilm),
    exposureBiasEv: numberValue(values.ExposureBiasValue),
    flash: textValue(values.Flash),
    whiteBalance: textValue(values.WhiteBalance),
    meteringMode: textValue(values.MeteringMode),
    exposureProgram: textValue(values.ExposureProgram),
    software: textValue(values.Software ?? values.CreatorTool),
    artist: textValue(values.Artist ?? values.Creator ?? values.Byline),
    copyright: textValue(values.Copyright ?? values.CopyrightNotice),
    description: textValue(values.ImageDescription ?? values.Description ?? values.CaptionAbstract),
    keywords: keywordValues(values.Keywords ?? values.Subject ?? values.XPKeywords),
  });

  const latitude = numberValue(values.latitude);
  const longitude = numberValue(values.longitude);
  let altitudeMeters = numberValue(values.GPSAltitude);
  if (altitudeMeters !== undefined && (values.GPSAltitudeRef === 1 || values.GPSAltitudeRef === "Below sea level")) altitudeMeters *= -1;
  const location = latitude !== undefined && longitude !== undefined
    ? compactObject<LocationMetadata>({ latitude, longitude, altitudeMeters })
    : undefined;
  return {
    ...(Object.keys(capture).length ? { capture } : {}),
    ...(location ? { location } : {}),
    ...(Array.isArray(values.errors) && values.errors.length ? { warning: "Some embedded image metadata could not be read." } : {}),
  };
}

export function extractVideoMetadata(input: unknown): { video: VideoTechnicalMetadata; capture?: CaptureMetadata } {
  const payload = isRecord(input) ? input as ProbePayload : {};
  const streams = Array.isArray(payload.streams) ? payload.streams : [];
  const videoStreams = streams.filter((stream) => stream.codec_type === "video").map(toVideoStream);
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio").map(toAudioStream);
  const format = payload.format ?? {};
  const video = compactObject<VideoTechnicalMetadata>({
    container: textValue(format.format_name),
    containerLongName: textValue(format.format_long_name),
    durationSeconds: numberValue(format.duration),
    bitRate: integerValue(format.bit_rate),
    videoStreams,
    audioStreams,
  });
  const tags = format.tags ?? {};
  const capture = compactObject<CaptureMetadata>({
    capturedAt: textValue(tags.creation_time ?? tags.DATE_RECORDED),
    software: textValue(tags.encoder),
    artist: textValue(tags.artist),
    copyright: textValue(tags.copyright),
    description: textValue(tags.description ?? tags.comment),
  });
  return { video, ...(Object.keys(capture).length ? { capture } : {}) };
}

function toVideoStream(stream: ProbeStream): VideoStreamMetadata {
  return compactObject({
    index: integerValue(stream.index) ?? 0,
    codec: textValue(stream.codec_name),
    codecLongName: textValue(stream.codec_long_name),
    profile: textValue(stream.profile),
    width: integerValue(stream.width),
    height: integerValue(stream.height),
    frameRate: rateValue(stream.avg_frame_rate ?? stream.r_frame_rate),
    pixelFormat: textValue(stream.pix_fmt),
    colorSpace: textValue(stream.color_space),
    colorTransfer: textValue(stream.color_transfer),
    colorPrimaries: textValue(stream.color_primaries),
    bitRate: integerValue(stream.bit_rate),
    durationSeconds: numberValue(stream.duration),
    language: textValue(stream.tags?.language),
  });
}

function toAudioStream(stream: ProbeStream): AudioStreamMetadata {
  return compactObject({
    index: integerValue(stream.index) ?? 0,
    codec: textValue(stream.codec_name),
    codecLongName: textValue(stream.codec_long_name),
    profile: textValue(stream.profile),
    sampleRateHz: integerValue(stream.sample_rate),
    channels: integerValue(stream.channels),
    channelLayout: textValue(stream.channel_layout),
    bitRate: integerValue(stream.bit_rate),
    durationSeconds: numberValue(stream.duration),
    language: textValue(stream.tags?.language),
  });
}

export function runFfprobe(source: string, options: ProbeRunOptions = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const child = (options.spawnProcess ?? spawn)("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", source], { shell: false });
    let output = "";
    let outputBytes = 0;
    let errorOutput = "";
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      child.kill("SIGKILL");
      finish(() => reject(createAbortError()));
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      callback();
    };
    timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("ffprobe timed out.")));
    }, options.timeoutMs ?? PROBE_TIMEOUT_MS);
    options.signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > (options.outputLimitBytes ?? PROBE_OUTPUT_LIMIT)) {
        child.kill("SIGKILL");
        finish(() => reject(new Error("ffprobe returned too much data.")));
        return;
      }
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (errorOutput.length < TEXT_LIMIT) errorOutput += chunk.toString("utf8");
    });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => finish(() => {
      if (code !== 0) reject(new Error(errorOutput.trim() || `ffprobe exited with code ${code}.`));
      else {
        try { resolve(JSON.parse(output)); }
        catch { reject(new Error("ffprobe returned invalid JSON.")); }
      }
    }));
  });
}

function createAbortError(): Error {
  const error = new Error("ffprobe was aborted.");
  error.name = "AbortError";
  return error;
}

function captureDate(values: ExifValues): string | undefined {
  const raw = textValue(values.DateTimeOriginal ?? values.CreateDate ?? values.DateCreated);
  if (!raw) return undefined;
  const offset = textValue(values.OffsetTimeOriginal ?? values.OffsetTime);
  return offset && !raw.endsWith(offset) ? `${raw} ${offset}` : raw;
}

function textValue(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return undefined;
  const normalized = String(value).replaceAll("\0", "").trim();
  return normalized ? normalized.slice(0, TEXT_LIMIT) : undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integerValue(value: unknown): number | undefined {
  const parsed = numberValue(value);
  return parsed === undefined ? undefined : Math.round(parsed);
}

function rateValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : undefined;
  if (typeof value !== "string") return undefined;
  const [numerator, denominator] = value.split("/").map(Number);
  if (numerator === undefined || denominator === undefined || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return undefined;
  const rate = numerator / denominator;
  return rate > 0 ? Math.round(rate * 1_000) / 1_000 : undefined;
}

function keywordValues(value: unknown): string[] | undefined {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;,]/) : [];
  const keywords = raw.map(textValue).filter((entry): entry is string => Boolean(entry)).slice(0, 50);
  return keywords.length ? keywords : undefined;
}

function compactObject<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
