// Format « Le Duel » : deux tours qui montent année par année, une couleur de club par saison.
import { fmt, esc, WHIP, titleBlock, noteBlock, hudFile, clubFlagSvg } from "./common.mjs";

const SHOT_CYCLE = ["front", "sideA", "level", "sideB", "low", "orbit"];
// taille de police qui tient sur une ligne (League Gothic en capitales : environ 0,4 em par signe)
const fit = (text, max, width = 980) => Math.min(max, Math.floor(width / (String(text).length * 0.4)));

export function build(data) {
  const P = data.music.pulse;
  const T0 = data.music.hook_pulses * P;
  const [A, B] = data.sides;
  let cur = T0;
  let tot = [0, 0];
  let shotI = 0;
  let craneNext = false;
  let prevLead = null;
  const steps = data.steps.map((s, i) => {
    const ga = s.a.reduce((x, p) => x + p[1], 0);
    const gb = s.b.reduce((x, p) => x + p[1], 0);
    const before = [...tot];
    tot = [tot[0] + ga, tot[1] + gb];
    const lead = tot[0] === tot[1] ? -1 : tot[0] > tot[1] ? 0 : 1;
    const big = !!s.big;
    const L = cur;
    cur += s.p * P;
    const prevBig = i > 0 && !!data.steps[i - 1].big;
    let shot;
    let trans;
    if (big) {
      shot = "bigLevel";
      trans = prevBig ? "cut" : "whip";
    } else if (s.p === 1) {
      shot = "snap";
      trans = "cut";
    } else {
      shot = SHOT_CYCLE[shotI++ % SHOT_CYCLE.length];
      trans = prevBig ? "cut" : craneNext ? "crane" : "whip";
      craneNext = !craneNext;
    }
    const st = { ...s, i, L, next: cur, big, ga, gb, before, after: [...tot], lead, changed: prevLead !== null && lead !== prevLead, shot, trans, fall: big ? 1.5 * P : 0 };
    prevLead = lead;
    return st;
  });
  const tEnd = cur;
  const TOTAL = tEnd + data.music.end_pulses * P;
  steps.forEach((s) => (s.appear = s.big ? s.L - s.fall : s.L - 0.1));
  const clubName = (parts) => parts.map((p) => data.clubs[p[0]].name).join(" + ");

  let body = "";
  let js = "";
  steps.forEach((s, i) => {
    const id = `d${s.year}`;
    const nx = steps[i + 1];
    const nextShows = nx ? nx.appear : s.next;
    const whipOut = nx ? nx.trans !== "cut" : true;
    const clipEnd = nx ? (whipOut ? nextShows : nextShows - 0.01) : s.next - 0.02;
    const side = (who, g, parts, other) => (parts.length ? `<span class="w${g > other ? " gold" : ""}">${esc(who.name)} +${g}</span>` : `<span class="w dim">${esc(who.name)} —</span>`);
    // sur une seule pulsation, les compteurs du bas suffisent : pas de ligne qu'on n'aurait pas le temps de lire
    const lineHtml = s.p === 1 ? "" : `${side(A, s.ga, s.a, s.gb)} <span class="w dim">·</span> ${side(B, s.gb, s.b, s.ga)}`;
    const place = s.p === 1 ? "" : s.place ?? [s.a.length ? clubName(s.a) : "", s.b.length ? clubName(s.b) : ""].filter(Boolean).join("  ·  ");
    const tb = titleBlock({ id, appear: s.appear, L: s.L, label: s.label || String(s.year), lineHtml, place, gold: s.big, whipOut, outAt: nextShows - WHIP, clipEnd });
    body += tb.html;
    js += tb.js;
    if (s.note) {
      const noteEnd = nx ? (whipOut ? nextShows - WHIP + 0.2 : nextShows - 0.01) : s.next - 0.02;
      const nb = noteBlock({ id: `${id}n`, start: s.L + 0.2, end: noteEnd, text: s.note, big: s.big, whipOut, outAt: nextShows - WHIP });
      body += nb.html;
      js += nb.js;
    }
  });

  // tableau de score : deux compteurs qui roulent, un trait d'or sous celui qui mène
  body += `
    <div id="score" class="clip" data-start="0" data-duration="${fmt(TOTAL)}" data-track-index="4" style="position:absolute;left:0;top:0;width:1080px;height:1920px">
      <div id="scorew" style="position:absolute;left:0;top:0;width:1080px;height:1920px">
      <div class="sb sbA" id="sbA"><div class="sbn"><img src="assets/flags/${A.flag}.svg" alt="">${esc(A.name)}</div><div class="sbv" id="sbAv">0</div><div class="sbl" id="sbAl"></div></div>
      <div class="sb sbB" id="sbB"><div class="sbn"><img src="assets/flags/${B.flag}.svg" alt="">${esc(B.name)}</div><div class="sbv" id="sbBv">0</div><div class="sbl" id="sbBl"></div></div>
      </div>
    </div>`;
  js += `\n  tl.set("#sbAv",{textContent:0},0);tl.set("#sbBv",{textContent:0},0);tl.set("#sbA",{scale:1},0);tl.set("#sbB",{scale:1},0);`;
  // le tableau de score n'apparaît qu'au départ, après le retour en arrière de l'accroche
  js += `\n  tl.set("#scorew",{opacity:0},0);tl.to("#scorew",{opacity:1,duration:.2,ease:"none"},${fmt(T0 - 0.1)});`;
  let prevL = null;
  steps.forEach((s) => {
    if (s.ga) js += `\n  tl.fromTo("#sbAv",{textContent:${s.before[0]}},{textContent:${s.after[0]},duration:.5,ease:"power2.out",snap:{textContent:1}},${fmt(s.L)});`;
    if (s.gb) js += `\n  tl.fromTo("#sbBv",{textContent:${s.before[1]}},{textContent:${s.after[1]},duration:.5,ease:"power2.out",snap:{textContent:1}},${fmt(s.L)});`;
    const winners = s.ga > s.gb ? ["A"] : s.gb > s.ga ? ["B"] : ["A", "B"];
    winners.forEach((w) => {
      js += `\n  tl.to("#sb${w}",{scale:1.12,duration:.07,ease:"power2.out"},${fmt(s.L)});tl.to("#sb${w}",{scale:1,duration:.5,ease:"elastic.out(1,.55)"},${fmt(s.L + 0.07)});`;
    });
    const la = s.lead === 0 || s.lead === -1 ? 1 : 0;
    const lb = s.lead === 1 || s.lead === -1 ? 1 : 0;
    if (!prevL || prevL[0] !== la) js += `\n  tl.to("#sbAl",{opacity:${la},duration:.16,ease:"none"},${fmt(s.L + 0.1)});`;
    if (!prevL || prevL[1] !== lb) js += `\n  tl.to("#sbBl",{opacity:${lb},duration:.16,ease:"none"},${fmt(s.L + 0.1)});`;
    prevL = [la, lb];
  });

  const hk = data.hook;
  const end = data.end;
  const end2At = tEnd + 3 * P;
  body =
    `
    <div id="hook" class="hk clip" data-start="0" data-duration="${fmt(T0 - 0.02)}" data-track-index="1">
      <div class="hkw" id="hookw">
        <div class="h1" id="h1" style="font-size:${fit(hk.small, 118)}px;color:#ffd24a">${esc(hk.small)}</div>
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
    <div id="src" class="src clip" data-start="${fmt(tEnd + 0.4)}" data-duration="${fmt(TOTAL - tEnd - 0.4)}" data-track-index="2" style="top:1092px">${esc(end.foot)}</div>`;
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
      .sb{position:absolute;top:1186px;width:420px;height:142px;text-align:center;transform-origin:50% 60%}
      .sbA{left:56px}
      .sbB{left:520px}
      .sbn{font-size:50px;line-height:56px;letter-spacing:1px;text-shadow:0 3px 10px rgba(0,0,0,.9)}
      .sbn img{width:64px;height:48px;border-radius:5px;vertical-align:-5px;margin-right:12px;box-shadow:0 4px 12px rgba(0,0,0,.6)}
      .sbv{display:inline-block;min-width:200px;margin-top:2px;padding:0 18px;font-size:96px;line-height:86px;font-variant-numeric:tabular-nums;background:rgba(3,6,10,.82);border-radius:10px}
      .sbl{position:absolute;left:110px;width:200px;top:146px;height:8px;background:#ffc83d;border-radius:4px;opacity:0}`;
  const hud = hudFile({ total: TOTAL, css, body, js });
  const world = {
    format: "duel",
    total: TOTAL,
    pulse: P,
    t0: T0,
    tEnd,
    k: data.k,
    sides: data.sides.map((s) => ({ name: s.name, flag: s.flag, color: s.color, confetti: s.confetti })),
    clubs: data.clubs,
    steps: steps.map((s) => ({ year: s.year, L: s.L, next: s.next, big: s.big, fall: s.fall, a: s.a, b: s.b, before: s.before, after: s.after, lead: s.lead, shot: s.shot, trans: s.trans })),
  };
  const timing = {
    offset: data.music.phase + data.music.entry_pulse_index * P - T0,
    total: TOTAL,
    t0: T0,
    tEnd,
    pulse: P,
    riser: steps.filter((s) => s.big).slice(-1)[0]?.L ?? null,
    events: steps.map((s) => ({ year: s.year, L: s.L, big: s.big, fall: s.fall, hasNote: !!s.note })),
  };
  // un duel de clubs : leurs couleurs et trois lettres à la place d'un drapeau de pays
  const extraFiles = {};
  data.sides.forEach((s) => {
    if (s.club) extraFiles[`assets/flags/${s.flag}.svg`] = clubFlagSvg({ ...s.club, code: s.club.code || s.id });
  });
  return { hud, world, timing, total: TOTAL, title: data.title, flags: data.sides.filter((s) => !s.club).map((s) => s.flag), extraFiles };
}
