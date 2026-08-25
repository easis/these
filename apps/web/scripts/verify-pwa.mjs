import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(packageRoot, "dist");
const manifest = JSON.parse(await readFile(path.join(dist, "manifest.webmanifest"), "utf8"));
const html = await readFile(path.join(dist, "index.html"), "utf8");
const serviceWorker = await readFile(path.join(dist, "sw.js"), "utf8");

assert(manifest.name === "these", "manifest name must be these");
assert(manifest.display === "standalone", "manifest display must be standalone");
assert(manifest.id === "/" && manifest.scope === "/" && manifest.start_url === "/", "manifest must remain rooted at /");

const themeMeta = html.match(/<meta[^>]+name=["']theme-color["'][^>]*>/i)?.[0];
const htmlThemeColor = themeMeta?.match(/content=["']([^"']+)["']/i)?.[1];
assert(Boolean(htmlThemeColor), "index.html must include a theme-color meta tag");
assert(manifest.theme_color === htmlThemeColor, "manifest and index.html theme colors must match");

const expectedIcons = [
  { src: "/pwa-192x192.png", sizes: "192x192", purpose: "any" },
  { src: "/pwa-512x512.png", sizes: "512x512", purpose: "any" },
  { src: "/pwa-maskable-512x512.png", sizes: "512x512", purpose: "maskable" },
];
for (const expected of expectedIcons) {
  assert(manifest.icons?.some((icon) => icon.src === expected.src && icon.sizes === expected.sizes && icon.purpose === expected.purpose), `manifest is missing ${expected.src}`);
  await access(path.join(dist, expected.src.slice(1)));
}

const appleIcon = await readPng(path.join(dist, "apple-touch-icon.png"));
assert(appleIcon.width === 180 && appleIcon.height === 180, "apple-touch-icon.png must be 180x180");
assert(appleIcon.colorType !== 4 && appleIcon.colorType !== 6, "apple-touch-icon.png must not contain an alpha channel");

const precachedPaths = [...serviceWorker.matchAll(/url:"([^"]+)"/g)].map((match) => match[1]);
for (const required of ["index.html", "manifest.webmanifest", "pwa-192x192.png", "pwa-512x512.png", "pwa-maskable-512x512.png"]) {
  assert(precachedPaths.includes(required), `service worker must precache ${required}`);
}
assert(!precachedPaths.some((entry) => entry.startsWith("api/")), "service worker must not precache API routes");
assert((serviceWorker.match(/\.registerRoute\(/g) ?? []).length === 1, "service worker must not add runtime cache routes");
assert(/denylist:\[\/\^\\\/api/.test(serviceWorker), "navigation fallback must exclude /api");

console.log("PWA artifacts verified.");

function assert(condition, message) {
  if (!condition) throw new Error(`PWA verification failed: ${message}`);
}

async function readPng(filename) {
  const contents = await readFile(filename);
  assert(contents.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${path.basename(filename)} must be a PNG`);
  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
    colorType: contents.readUInt8(25),
  };
}
