// Pièces communes aux formats : réglages de qualité, calques de texte, page HyperFrames.
export const W = 1080;
export const H = 1920;
export const FPS = 30;
export const QUAL = {
  gpu: { maxN: 16, msaa: 4, scale: 1, bloomScale: 0.5, bloomLevels: 7 },
  cpu: { maxN: 8, msaa: 0, scale: 0.67, bloomScale: 0.5, bloomLevels: 5 },
  draft: { maxN: 1, msaa: 0, scale: 0.5, bloomScale: 0.5, bloomLevels: 5 },
};
export const fmt = (x) => Number(x.toFixed(3));
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
export const WHIP = 0.42;

// Les ombres portées sont écrites en entier pour que GSAP puisse les interpoler.
export const SHADOW_BASE = "0px 0px 0px rgba(255,36,83,0), 0px 0px 0px rgba(18,224,255,0), 0px 10px 0px rgba(0,0,0,.38), 0px 26px 70px rgba(0,0,0,.6)";
export const SHADOW_CHROMA = "-26px 0px 0px rgba(255,36,83,.95), 26px 0px 0px rgba(18,224,255,.95), 0px 10px 0px rgba(0,0,0,.38), 0px 26px 70px rgba(0,0,0,.6)";

export const CSS = `
      #root{position:absolute;inset:0;overflow:hidden;font-family:'League Gothic',sans-serif;color:#fff;pointer-events:none}
      .vt{position:absolute;left:0;width:1080px;top:0;height:640px;background:linear-gradient(180deg,rgba(2,4,8,.62),rgba(2,4,8,0))}
      .vb{position:absolute;left:0;width:1080px;top:1020px;height:900px;background:linear-gradient(180deg,rgba(2,4,8,0),rgba(2,4,8,.66) 30%,rgba(2,4,8,.5) 62%,rgba(2,4,8,.08))}
      .ed,.nt{position:absolute;left:0;top:0;width:1080px;height:1920px}
      .edw{position:absolute;left:0;top:0;width:1080px;text-align:center}
      .yrw{position:absolute;left:0;top:172px;width:1080px;height:330px}
      .yr{position:absolute;left:0;top:0;width:1080px;font-size:430px;line-height:330px;letter-spacing:6px;color:#fff;text-shadow:${SHADOW_BASE}}
      .yr.gold{color:#ffd24a}
      .yr.mid{font-size:300px}
      .lb{position:absolute;left:0;width:1080px;top:506px;height:92px;background:linear-gradient(90deg,rgba(3,6,10,0),rgba(3,6,10,.82) 16%,rgba(3,6,10,.82) 84%,rgba(3,6,10,0))}
      .ln{position:absolute;left:0;width:1080px;top:506px;text-align:center;font-size:84px;line-height:92px;letter-spacing:1px;white-space:nowrap}
      .ln .w{display:inline-block}
      .ln .gold{color:#ffd24a}
      .ln .dim{color:#e8edf5}
      .pl{position:absolute;left:30px;width:1020px;top:604px;font:700 30px/38px Inter,sans-serif;letter-spacing:.5px;color:#fff;text-shadow:0 2px 3px rgba(0,0,0,.95),0 2px 14px rgba(0,0,0,.95)}
      .ntw{position:absolute;left:0;top:1090px;width:1080px;text-align:center}
      .note{display:inline-block;padding:6px 26px 4px;background:#ffc83d;color:#0a0d12;font-size:62px;line-height:70px;letter-spacing:1px;white-space:nowrap;transform:skewX(-7deg)}
      .note.big{background:#fff;font-size:70px;line-height:78px}
      .hk,.en{position:absolute;left:0;top:0;width:1080px;height:1920px;text-align:center}
      .hkw{position:absolute;left:0;top:0;width:1080px}
      .h1{position:absolute;left:0;width:1080px;top:186px;font-size:118px;line-height:120px;letter-spacing:2px;text-shadow:0 6px 0 rgba(0,0,0,.42),0 16px 40px rgba(0,0,0,.65)}
      .h2{position:absolute;left:0;width:1080px;top:306px;font-size:204px;line-height:214px;letter-spacing:1px;white-space:nowrap;text-shadow:0 10px 0 rgba(0,0,0,.42),0 26px 70px rgba(0,0,0,.65)}
      .h3w{position:absolute;left:0;width:1080px;top:530px;text-align:center}
      .h3{display:inline-block;padding:6px 34px 2px;background:#ffc83d;color:#0a0d12;font-size:104px;line-height:112px;letter-spacing:1px;transform:skewX(-7deg)}
      .e1{position:absolute;left:0;width:1080px;top:190px;font-size:136px;line-height:140px;letter-spacing:1px;white-space:nowrap;text-shadow:0 8px 0 rgba(0,0,0,.42),0 22px 60px rgba(0,0,0,.7)}
      .e2{position:absolute;left:0;width:1080px;top:330px;font-size:76px;line-height:84px;color:#ffd24a;letter-spacing:1px;text-shadow:0 4px 0 rgba(0,0,0,.5),0 10px 30px rgba(0,0,0,.7)}
      .e3{position:absolute;left:0;width:1080px;top:194px;font-size:112px;line-height:124px;letter-spacing:1px;white-space:nowrap;text-shadow:0 8px 0 rgba(0,0,0,.42),0 22px 60px rgba(0,0,0,.7)}
      .e4w{position:absolute;left:0;width:1080px;top:330px;text-align:center}
      .e4{display:inline-block;padding:6px 30px 2px;background:#ffc83d;color:#0a0d12;font-size:84px;line-height:92px;letter-spacing:1px;transform:skewX(-7deg)}
      .e5{position:absolute;left:0;width:1080px;top:440px;font:700 36px/44px Inter,sans-serif;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.9)}
      .src{position:absolute;left:60px;width:880px;top:1148px;font:700 28px/34px Inter,sans-serif;text-align:center;color:#eef2f8;text-shadow:0 2px 10px rgba(0,0,0,.95)}
`;

export const SVG_FILTERS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
      <filter id="vblur" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="0 26"/></filter>
      <filter id="hblur" x="-30%" y="-5%" width="160%" height="110%"><feGaussianBlur stdDeviation="22 0"/></filter>
    </defs></svg>`;

// Grand titre qui claque (recette headline-slam + décalage rouge et bleu), ligne sous bandeau, lieu, sortie floue.
export function titleBlock({ id, appear, L, label, lineHtml, place, gold, mid, whipOut, outAt, clipEnd }) {
  const html = `
    <div id="${id}" class="clip ed" data-start="${fmt(appear)}" data-duration="${fmt(clipEnd - appear)}" data-track-index="2">
      <div class="edw" id="${id}w">
        <div class="yrw" id="${id}s"><div class="yr${gold ? " gold" : ""}${mid ? " mid" : ""}" id="${id}y">${esc(label)}</div></div>
        ${lineHtml ? `<div class="lb" id="${id}k" data-layout-ignore></div><div class="ln" id="${id}l">${lineHtml}</div>` : ""}
        ${place ? `<div class="pl" id="${id}p">${esc(place)}</div>` : ""}
      </div>
    </div>`;
  const js = `
  (function(){
    var s=${fmt(appear)}, L=${fmt(L)};
    tl.fromTo("#${id}y",{scale:1.8,opacity:0,filter:"blur(12px)"},{scale:1,opacity:1,filter:"blur(0px)",duration:.36,ease:"expo.out"},s);
    tl.fromTo("#${id}y",{textShadow:"${SHADOW_CHROMA}"},{textShadow:"${SHADOW_BASE}",duration:.3,ease:"power2.out"},s+.04);
    tl.fromTo("#${id}s",{x:0,y:0},{x:9,y:-6,duration:.034,ease:"none"},s+.1);
    tl.to("#${id}s",{x:-7,y:4,duration:.034,ease:"none"},s+.134);
    tl.to("#${id}s",{x:0,y:0,duration:.034,ease:"none"},s+.168);
    ${lineHtml ? `tl.fromTo("#${id}k",{opacity:0,scaleX:.4},{opacity:1,scaleX:1,duration:.16,ease:"power3.out"},L);
    tl.fromTo("#${id}l .w",{opacity:0},{opacity:1,duration:.08,stagger:.067,ease:"none"},L+.02);` : ""}
    ${place ? `tl.fromTo("#${id}p",{opacity:0},{opacity:1,duration:.12,ease:"none"},L+.1);` : ""}
    ${whipOut ? `tl.set("#${id}w",{filter:"url(#vblur)"},${fmt(outAt + 0.06)});tl.to("#${id}w",{y:-1500,duration:.3,ease:"power4.in"},${fmt(outAt)});` : ""}
  })();`;
  return { html, js };
}

export function noteBlock({ id, start, end, text, big, whipOut, outAt }) {
  const html = `
    <div id="${id}" class="clip nt" data-start="${fmt(start)}" data-duration="${fmt(end - start)}" data-track-index="3">
      <div class="ntw" id="${id}w"><div class="note${big ? " big" : ""}" id="${id}t">${esc(text)}</div></div>
    </div>`;
  const js = `
  tl.fromTo("#${id}t",{clipPath:"inset(0% 100% 0% 0%)",x:-40},{clipPath:"inset(0% 0% 0% 0%)",x:0,duration:.24,ease:"power4.out"},${fmt(start)});
  ${whipOut ? `tl.set("#${id}w",{filter:"url(#hblur)"},${fmt(outAt + 0.04)});tl.to("#${id}w",{x:1200,duration:.2,ease:"power3.in"},${fmt(outAt)});` : ""}`;
  return { html, js };
}

export function hudFile({ total, css, body, js }) {
  return `<template>
  <div id="root" data-composition-id="hud" data-duration="${fmt(total)}" data-fps="${FPS}">
    <style>${CSS}${css || ""}
    </style>
    ${SVG_FILTERS}
    <div id="vt" class="vt clip" data-start="0" data-duration="${fmt(total)}" data-track-index="0" data-layout-ignore></div>
    <div id="vb" class="vb clip" data-start="0" data-duration="${fmt(total)}" data-track-index="0" data-layout-ignore></div>
    ${body}
    <script>
      (function(){
        var tl=gsap.timeline({paused:true});
        ${js}
        tl.to({},{duration:.01},${fmt(total - 0.02)});
        window.__timelines=window.__timelines||{};
        window.__timelines["hud"]=tl;
      })();
    </script>
  </div>
</template>
`;
}

export function indexFile({ total, title, course }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${W}, height=${H}">
<title>${esc(title)}</title>
<script type="importmap">{"imports":{"three":"./lib/three.module.js"}}</script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
html,body{margin:0;padding:0;width:${W}px;height:${H}px;background:#04060a;overflow:hidden}
#stage{position:absolute;left:0;top:0;width:${W}px;height:${H}px;display:block}
</style>
</head>
<body>
<div id="main" data-composition-id="main" data-start="0" data-duration="${fmt(total)}" data-width="${W}" data-height="${H}" data-fps="${FPS}">
  <canvas id="stage" width="${W}" height="${H}" data-layout-ignore></canvas>
  <div id="hud" data-composition-id="hud" data-composition-src="compositions/hud.html" data-start="0" data-duration="${fmt(total)}" data-track-index="2" data-track-kind="graphics" data-width="${W}" data-height="${H}"></div>
  <audio id="mix" src="assets/mix.m4a" data-start="0" data-duration="${fmt(total)}" data-track-index="5" data-volume="1"></audio>
</div>
<script>
  window.__COURSE=${JSON.stringify(course)};
  window.__hf=window.__hf||{};
  window.__hf.buildReady=window.__hf.buildReady||{};
  window.__hf.buildReady.world=new Promise(function(res){window.__worldDone=res;});
  window.__timelines=window.__timelines||{};
  var mainTl=gsap.timeline({paused:true});
  mainTl.to({}, {duration:.01}, ${fmt(total - 0.02)});
  window.__timelines["main"]=mainTl;
</script>
<script type="module" src="world/main.js"></script>
</body>
</html>
`;
}

// Textes fixes du moteur, en français et en anglais. Les textes propres à chaque vidéo restent dans son fichier de données.
export const STR = {
  fr: { rank: "N°", goal: "BUT !", draw: "MATCH NUL", win: (n) => `VICTOIRE ${n}`, matchday: "JOURNÉE", match: "MATCH", bigMatch: "L'AFFICHE", others: "LES AUTRES RÉSULTATS", standings: "CLASSEMENT", team: "ÉQUIPE", played: "J", gd: "DIFF", pts: "PTS", through: (t, agree) => `${t.name} ${agree(t, "QUALIFIÉ", "QUALIFIÉE", "QUALIFIÉS")}`, champions: (t, agree) => `${t.name} ${agree(t, "CHAMPION", "CHAMPIONNE", "CHAMPIONS")} !` },
  en: { rank: "#", goal: "GOAL!", draw: "DRAW", win: (n) => `${n} WIN`, matchday: "MATCHDAY", match: "MATCH", bigMatch: "BIG MATCH", others: "OTHER RESULTS", standings: "STANDINGS", team: "TEAM", played: "P", gd: "GD", pts: "PTS", through: (t) => `${t.name} THROUGH`, champions: (t) => `${t.name} CHAMPIONS!` },
};
export const strings = (data) => STR[data.lang || "fr"];

// « Drapeau » de club dessiné : couleurs et trois lettres, jamais d'écusson ni de sponsor.
export function clubFlagSvg(club) {
  const [c0, c1, c2] = club.colors;
  let body = `<rect width="640" height="480" fill="${c0}"/>`;
  const p = club.pattern;
  if (p === "stripes") for (let i = 1; i < 8; i += 2) body += `<rect x="${i * 80}" width="80" height="480" fill="${c1}"/>`;
  else if (p === "hoops") for (let i = 0; i < 6; i += 2) body += `<rect y="${i * 80 + 40}" width="640" height="80" fill="${c1}"/>`;
  else if (p === "halves") body += `<rect x="320" width="320" height="480" fill="${c1}"/>`;
  else if (p === "sides") body += `<rect width="110" height="480" fill="${c1}"/><rect x="530" width="110" height="480" fill="${c1}"/>`;
  else if (p === "band") body += `<rect x="200" width="240" height="480" fill="${c2 || "#ffffff"}"/><rect x="230" width="180" height="480" fill="${c1}"/>`;
  else if (p === "trim") body += `<rect y="0" width="640" height="46" fill="${c1}"/><rect y="434" width="640" height="46" fill="${c1}"/>`;
  else if (p === "sash") body += `<polygon points="0,380 0,480 120,480 640,100 640,0 520,0" fill="${c1}"/>`;
  const ink = club.ink || "#ffffff";
  body += `<text x="320" y="300" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="190" fill="${ink}" stroke="rgba(0,0,0,.55)" stroke-width="10" paint-order="stroke">${club.code}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" width="640" height="480">${body}</svg>`;
}
