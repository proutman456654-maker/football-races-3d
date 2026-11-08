// Format « Le Top qui monte » : 10 maillots suspendus en spirale, du 10e au 1er, de plus en plus haut.
import { fmt, esc, WHIP, titleBlock, noteBlock, hudFile, strings } from "./common.mjs";

const SHOT_CYCLE = ["front", "low", "side", "close", "wide", "dutch"];
const fit = (text, max, width = 980) => Math.min(max, Math.floor(width / (String(text).length * 0.4)));

export function build(data) {
  const L10N = strings(data);
  const P = data.music.pulse;
  const T0 = data.music.hook_pulses * P;
  let cur = T0;
  let shotI = 0;
  let craneNext = true;
  const items = data.items
    .slice()
    .sort((a, b) => b.rank - a.rank)
    .map((it, i) => {
      const big = it.rank === 1;
      const p = big ? 6 : 5;
      const L = cur;
      cur += p * P;
      const reveal = big ? L + 2 * P : L + P;
      const shot = big ? "bigFront" : SHOT_CYCLE[shotI++ % SHOT_CYCLE.length];
      const trans = i === 0 ? "whip" : craneNext ? "crane" : "whip";
      craneNext = !craneNext;
      return { ...it, i, L, next: cur, big, reveal, shot, trans, fall: big ? 2 * P : 0 };
    });
  const tEnd = cur;
  const TOTAL = tEnd + data.music.end_pulses * P;
  items.forEach((it) => (it.appear = it.L - 0.1));

  let body = "";
  let js = "";
  items.forEach((it, i) => {
    const id = `r${it.rank}`;
    const nx = items[i + 1];
    const nextShows = nx ? nx.appear : it.next;
    const clipEnd = nx ? nextShows : it.next - 0.02;
    const lineHtml = `<span class="w gold">${esc(it.name)}</span> <span class="w">${it.value} ${esc(data.unit)}</span>`;
    const tb = titleBlock({ id, appear: it.appear, L: it.reveal, label: `${L10N.rank}${it.rank}`, lineHtml, place: `${it.years} · ${it.country}`, gold: it.big, mid: true, whipOut: true, outAt: nextShows - WHIP, clipEnd });
    body += tb.html;
    js += tb.js;
    if (it.note) {
      const nb = noteBlock({ id: `${id}n`, start: it.reveal + 0.25, end: nextShows - WHIP + 0.2, text: it.note, big: it.big, whipOut: true, outAt: nextShows - WHIP });
      body += nb.html;
      js += nb.js;
    }
  });

  // rangée des 10 places : chaque place révélée passe à l'or avec son total
  const TW = 92;
  const X0 = 80;
  body += `
    <div id="ranks" class="clip" data-start="0" data-duration="${fmt(TOTAL)}" data-track-index="4" style="position:absolute;left:0;top:0;width:1080px;height:1920px">
      ${items
        .map((it, k) => `<div class="rk" id="k${it.rank}" style="left:${X0 + k * TW}px"><div class="rkn">${it.rank}</div><div class="rkv" id="k${it.rank}v">${it.value}</div></div>`)
        .join("\n      ")}
    </div>`;
  items.forEach((it) => {
    js += `\n  tl.set("#k${it.rank}",{scale:1},0);tl.set("#k${it.rank}v",{opacity:0},0);`;
    js += `\n  tl.to("#k${it.rank}",{scale:1.2,duration:.07,ease:"power2.out"},${fmt(it.reveal)});tl.to("#k${it.rank}",{scale:1,duration:.5,ease:"elastic.out(1,.55)"},${fmt(it.reveal + 0.07)});`;
    js += `\n  tl.to("#k${it.rank}v",{opacity:1,duration:.12,ease:"none"},${fmt(it.reveal)});`;
    js += `\n  tl.set("#k${it.rank}",{borderColor:"rgba(255,255,255,.18)"},0);tl.set("#k${it.rank} .rkn",{color:"#9aa4b6"},0);`;
    js += `\n  tl.set("#k${it.rank}",{borderColor:"#ffc83d"},${fmt(it.reveal)});tl.set("#k${it.rank} .rkn",{color:"#ffd24a"},${fmt(it.reveal)});`;
  });

  const hk = data.hook;
  const end = data.end;
  const end2At = tEnd + 3 * P;
  body =
    `
    <div id="hook" class="hk clip" data-start="0" data-duration="${fmt(T0 - 0.02)}" data-track-index="1">
      <div class="hkw" id="hookw">
        <div class="h1" id="h1" style="font-size:${fit(hk.small, 118)}px">${esc(hk.small)}</div>
        <div class="h2" id="h2" style="font-size:${fit(hk.big, 204)}px">${esc(hk.big)}</div>
        <div class="h3w" id="h3w"><div class="h3" id="h3">${esc(hk.question)}</div></div>
      </div>
    </div>` +
    body +
    `
    <div id="end1" class="en clip" data-start="${fmt(tEnd)}" data-duration="${fmt(3 * P - 0.02)}" data-track-index="2">
      <div class="hkw" id="end1w"><div class="e1" id="e1" style="font-size:${fit(end.one.big, 136)}px">${esc(end.one.big)}</div><div class="e2" id="e2" style="font-size:${fit(end.one.small, 76)}px">${esc(end.one.small)}</div></div>
    </div>
    <div id="end2" class="en clip" data-start="${fmt(end2At)}" data-duration="${fmt(TOTAL - end2At)}" data-track-index="2">
      <div class="e3" id="e3" style="font-size:${fit(end.two.big, 150)}px">${esc(end.two.big)}</div>
      <div class="e4w" id="e4w"><div class="e4" id="e4">${esc(end.two.small)}</div></div>
      <div class="e5" id="e5">${esc(end.two.tiny)}</div>
    </div>
    <div id="src" class="src clip" data-start="${fmt(tEnd + 0.4)}" data-duration="${fmt(TOTAL - tEnd - 0.4)}" data-track-index="2" style="top:1150px">${esc(end.foot)}</div>`;
  js =
    `
        tl.fromTo("#h3",{scale:1,x:0},{scale:1.16,duration:.06,ease:"power2.out"},${fmt(P)});
        tl.to("#h3",{scale:1,duration:.42,ease:"elastic.out(1,.6)"},${fmt(P + 0.06)});
        tl.fromTo("#h2",{scale:1},{scale:1.05,duration:.06,ease:"power2.out"},${fmt(2 * P)});
        tl.to("#h2",{scale:1,duration:.4,ease:"expo.out"},${fmt(2 * P + 0.06)});
        tl.set("#hookw",{filter:"url(#vblur)"},${fmt(T0 - 0.26)});
        tl.to("#hookw",{y:-1500,duration:.3,ease:"power4.in"},${fmt(T0 - 0.32)});` +
    js +
    `
        tl.fromTo("#e1",{scale:1.7,opacity:0},{scale:1,opacity:1,duration:.36,ease:"expo.out"},${fmt(tEnd)});
        tl.fromTo("#e2",{opacity:0},{opacity:1,duration:.16,ease:"none"},${fmt(tEnd + 0.45)});
        tl.set("#end1w",{filter:"url(#vblur)"},${fmt(end2At - 0.26)});
        tl.to("#end1w",{y:-1500,duration:.3,ease:"power4.in"},${fmt(end2At - 0.32)});
        tl.fromTo("#e3",{scale:1.7,opacity:0},{scale:1,opacity:1,duration:.36,ease:"expo.out"},${fmt(end2At)});
        tl.fromTo("#e4",{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:.26,ease:"power4.out"},${fmt(end2At + 0.34)});
        tl.fromTo("#e5",{opacity:0},{opacity:1,duration:.2,ease:"none"},${fmt(end2At + 0.7)});`;
  const css = `
      .yrw{height:250px}
      .yr.mid{line-height:250px}
      .lb,.ln{top:432px}
      .pl{top:530px}
      .rk{position:absolute;top:1228px;width:80px;height:96px;border-radius:9px;background:rgba(3,6,10,.78);border:3px solid rgba(255,255,255,.18);box-sizing:border-box;text-align:center;transform-origin:50% 60%}
      .rk.on{background:rgba(3,6,10,.88);border-color:#ffc83d}
      .rkn{font-size:44px;line-height:52px;color:#9aa4b6}
      .rk.on .rkn{color:#ffd24a}
      .rkv{font-size:30px;line-height:32px;color:#fff}`;
  const hud = hudFile({ total: TOTAL, css, body, js });
  const world = {
    format: "top",
    total: TOTAL,
    pulse: P,
    t0: T0,
    tEnd,
    club: data.club,
    unit: data.unit,
    items: items.map((it) => ({ rank: it.rank, name: it.name, value: it.value, L: it.L, next: it.next, reveal: it.reveal, big: it.big, fall: it.fall, shot: it.shot, trans: it.trans })),
  };
  const timing = {
    offset: data.music.phase + data.music.entry_pulse_index * P - T0,
    total: TOTAL,
    t0: T0,
    tEnd,
    pulse: P,
    riser: items.find((it) => it.big)?.reveal ?? null,
    events: items.map((it) => ({ year: it.rank, L: it.reveal, big: it.big, fall: it.fall, hasNote: !!it.note })),
  };
  return { hud, world, timing, total: TOTAL, title: data.title, flags: [] };
}
