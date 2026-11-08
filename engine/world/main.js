// Point d'entrée : le stade commun, puis le format demandé par la vidéo (course, duel, top...).
import { createStadium } from "./stadium.js";

const C = window.__COURSE;
const S = createStadium(C);
const mod = await import(`./${C.format}.js`);
const M = await mod.setup(S, C);
S.start(M);
const gl = S.renderer.getContext();
const dbg = gl.getExtension("WEBGL_debug_renderer_info");
console.log("GL", dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "?", "format", C.format, "qualité", JSON.stringify(C.quality));
