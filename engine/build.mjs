// node build.mjs <data.json> <dossier de sortie> [gpu|cpu|draft]
// Écrit un projet HyperFrames complet : index.html, compositions/hud.html, timing.json, data.json, monde 3D et drapeaux.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUAL, W, H, FPS, indexFile } from "./formats/common.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const [, , dataPath, outDir, qualityArg] = process.argv;
if (!dataPath || !outDir) {
  console.error("usage : node build.mjs <data.json> <dossier> [gpu|cpu|draft]");
  process.exit(1);
}
const quality = qualityArg || process.env.QUALITY || "cpu";
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const fmtMod = await import(`./formats/${data.format}.mjs`);
const r = fmtMod.build(data, { dataPath: path.resolve(dataPath), outDir });
if (r.total < 61) throw new Error(`Durée ${r.total} s, il en faut au moins 61`);

fs.mkdirSync(path.join(outDir, "compositions"), { recursive: true });
fs.mkdirSync(path.join(outDir, "assets", "flags"), { recursive: true });
fs.cpSync(path.join(here, "lib"), path.join(outDir, "lib"), { recursive: true });
fs.cpSync(path.join(here, "world"), path.join(outDir, "world"), { recursive: true });
for (const f of r.flags || []) fs.copyFileSync(path.join(here, "assets", "flags", `${f}.svg`), path.join(outDir, "assets", "flags", `${f}.svg`));
fs.writeFileSync(path.join(outDir, "compositions", "hud.html"), r.hud);
for (const [rel, content] of Object.entries(r.extraFiles || {})) {
  fs.mkdirSync(path.dirname(path.join(outDir, rel)), { recursive: true });
  fs.writeFileSync(path.join(outDir, rel), content);
}
const world = { width: W, height: H, fps: FPS, quality: QUAL[quality], ...r.world };
fs.writeFileSync(path.join(outDir, "index.html"), indexFile({ total: r.total, title: r.title, course: world }));
fs.writeFileSync(path.join(outDir, "timing.json"), JSON.stringify(r.timing, null, 1));
fs.writeFileSync(path.join(outDir, "data.json"), JSON.stringify(data, null, 1));
fs.writeFileSync(path.join(outDir, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", assets: "assets" } }, null, 1));
if (r.summary) console.log(JSON.stringify(r.summary));
console.log(`ok : ${data.format}, ${r.total.toFixed(2)} s, ${Math.round(r.total * FPS)} images, qualité ${quality}, décalage musique ${r.timing.offset.toFixed(3)} s`);
