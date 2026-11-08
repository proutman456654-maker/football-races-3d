// Format « La Course » : timing sur la pulsation, calques de texte et bandeau de classement.
import { fmt, esc, WHIP, titleBlock, noteBlock, hudFile, clubFlagSvg } from "./common.mjs";

const SHOT_CYCLE = ["heroLow", "highDive", "dutch", "insideUp", "sideTrack", "wideOrbit"];
const SNAPS = ["snap", "snapHigh"];
const PLINTH = 0.6;
const BLOCK = 2.55;
const PLATE = 0.16;
const topOf = (n) => PLINTH + n * (BLOCK + PLATE);

export function build(data) {
  const P = data.music.pulse;
  const T0 = data.music.hook_pulses * P;
  const teams = data.teams.map((t, i) => ({ ...t, index: i }));
  const byId = Object.fromEntries(teams.map((t) => [t.id, t]));
  const counts = Object.fromEntries(teams.map((t) => [t.id, 0]));
  let order = teams.map((t) => t.id);
  let cur = T0;
  let shotI = 0;
  let snapI = 0;
  let craneNext = false;
  const events = data.events.map((e, i) => {
    counts[e.winner] += 1;
    // on remonte seulement au-dessus des équipes qui ont strictement moins de titres
    order = order.filter((id) => id !== e.winner);
    let at = order.findIndex((id) => counts[id] < counts[e.winner]);
    if (at < 0) at = order.length;
    order.splice(at, 0, e.winner);
    const big = !!e.big;
    const L = cur;
    cur += e.p * P;
    const prevBig = i > 0 && !!data.events[i - 1].big;
    let shot;
    let trans;
    if (big) {
      shot = "bigOrbit";
      trans = prevBig ? "cut" : "whip";
    } else if (e.p === 1) {
      shot = SNAPS[snapI++ % SNAPS.length];
      trans = "cut";
    } else {
      shot = SHOT_CYCLE[shotI++ % SHOT_CYCLE.length];
      trans = prevBig ? "cut" : craneNext ? "crane" : "whip";
      craneNext = !craneNext;
    }
    return { ...e, i, team: byId[e.winner].index, L, next: cur, big, count: counts[e.winner], top: topOf(counts[e.winner]), counts: teams.map((x) => counts[x.id]), order: [...order], shot, trans, fall: big ? 1.5 * P : 0.34 };
  });
  const tEnd = cur;
  const TOTAL = tEnd + data.music.end_pulses * P;
  if (TOTAL < 61) throw new Error(`Durée ${TOTAL} s, il en faut au moins 61`);
  events.forEach((e) => (e.appear = e.big ? e.L - e.fall : e.L - 0.1));

  let body = "";
  let js = "";
  events.forEach((e, i) => {
    const id = `e${e.year}`;
    const nx = events[i + 1];
    const nextShows = nx ? nx.appear : e.next;
    const whipOut = nx ? nx.trans !== "cut" : true;
    const clipEnd = nx ? (whipOut ? nextShows : nextShows - 0.01) : e.next - 0.02;
    const lineHtml =
      e.p === 1
        ? `<span class="w gold">${esc(e.w)}</span> <span class="w">${esc(e.score)}</span>`
        : `<span class="w gold">${esc(e.w)}</span> <span class="w">${esc(e.score)}</span> <span class="w dim">${esc(e.l)}</span>`;
    const tb = titleBlock({ id, appear: e.appear, L: e.L, label: String(e.year), lineHtml, place: e.p === 1 ? "" : e.place, gold: e.big, whipOut, outAt: nextShows - WHIP, clipEnd });
    body += tb.html;
    js += tb.js;
    if (e.note) {
      const noteEnd = nx ? (whipOut ? nextShows - WHIP + 0.2 : nextShows - 0.01) : e.next - 0.02;
      const nb = noteBlock({ id: `${id}n`, start: e.L + 0.2, end: noteEnd, text: e.note, big: e.big, whipOut, outAt: nextShows - WHIP });
      body += nb.html;
      js += nb.js;
    }
  });

  // bandeau de classement
  const TILE = 110;
  const X0 = 70;
  body += `
    <div id="bar" class="clip" data-start="0" data-duration="${fmt(TOTAL)}" data-track-index="4" style="position:absolute;left:0;top:0;width:1080px;height:1920px">
      ${teams
        .map((t) => {
          const max = events.filter((e) => e.winner === t.id).length;
          const strip = Array.from({ length: max + 1 }, (_, i) => `<span>${i}</span>`).join("");
          return `<div class="tile" id="t${t.id}"><div class="tin" id="t${t.id}i"><img class="fl" src="assets/flags/${t.flag}.svg" alt=""><div class="lead" id="t${t.id}g"></div><div class="dg" data-layout-ignore><div class="st" id="t${t.id}n" data-layout-ignore>${strip}</div></div></div></div>`;
        })
        .join("\n      ")}
    </div>`;
  teams.forEach((t, i) => {
    js += `\n  tl.set("#t${t.id}",{x:${X0 + i * TILE}},0);\n  tl.set("#t${t.id}i",{scale:1},0);`;
  });
  let prevOrder = teams.map((t) => t.id);
  let prevLeaders = [];
  events.forEach((e) => {
    const c = Object.fromEntries(teams.map((t, i) => [t.id, e.counts[i]]));
    js += `\n  tl.to("#t${e.winner}n",{y:${-44 * c[e.winner]},duration:.34,ease:"power3.out"},${fmt(e.L)});`;
    js += `\n  tl.to("#t${e.winner}i",{scale:1.24,duration:.07,ease:"power2.out"},${fmt(e.L)});`;
    js += `\n  tl.to("#t${e.winner}i",{scale:1,duration:.5,ease:"elastic.out(1,.55)"},${fmt(e.L + 0.07)});`;
    e.order.forEach((id, r) => {
      if (prevOrder.indexOf(id) !== r) js += `\n  tl.to("#t${id}",{x:${X0 + r * TILE},duration:.42,ease:"power3.inOut"},${fmt(e.L + 0.12)});`;
    });
    prevOrder = e.order;
    const max = Math.max(...e.counts);
    const leaders = teams.filter((t) => c[t.id] === max && max > 0).map((t) => t.id);
    teams.forEach((t) => {
      const was = prevLeaders.includes(t.id);
      const is = leaders.includes(t.id);
      if (was !== is) js += `\n  tl.to("#t${t.id}g",{opacity:${is ? 1 : 0},duration:.16,ease:"none"},${fmt(e.L + 0.1)});`;
    });
    prevLeaders = leaders;
  });

  // accroche et fin
  const hk = data.hook;
  const end = data.end;
  const end2At = tEnd + 3 * P;
  // la source tient sur une seule ligne : juste en dessous, il n'y a que la place des cases du classement
  const srcFs = Math.min(28, Math.floor(880 / (String(end.foot).length * 0.5)));
  body =
    `
    <div id="hook" class="hk clip" data-start="0" data-duration="${fmt(T0 - 0.02)}" data-track-index="1">
      <div class="hkw" id="hookw">
        <div class="h1" id="h1">${esc(hk.small)}</div>
        <div class="h2" id="h2">${esc(hk.big)}</div>
        <div class="h3w" id="h3w"><div class="h3" id="h3">${esc(hk.question)}</div></div>
      </div>
    </div>` +
    body +
    `
    <div id="end1" class="en clip" data-start="${fmt(tEnd)}" data-duration="${fmt(3 * P - 0.02)}" data-track-index="2">
      <div class="hkw" id="end1w"><div class="e1" id="e1">${esc(end.one.big)}</div><div class="e2" id="e2">${esc(end.one.small)}</div></div>
    </div>
    <div id="end2" class="en clip" data-start="${fmt(end2At)}" data-duration="${fmt(TOTAL - end2At)}" data-track-index="2">
      <div class="e3" id="e3">${esc(end.two.big)}</div>
      <div class="e4w" id="e4w"><div class="e4" id="e4">${esc(end.two.small)}</div></div>
      <div class="e5" id="e5">${esc(end.two.tiny)}</div>
    </div>
    <div id="src" class="src clip" data-start="${fmt(tEnd + 0.4)}" data-duration="${fmt(TOTAL - tEnd - 0.4)}" data-track-index="2" style="font-size:${srcFs}px;white-space:nowrap">${esc(end.foot)}</div>`;
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
      .tile{position:absolute;left:0;top:1205px;width:100px;height:113px}
      .tin{position:absolute;inset:0;transform-origin:50% 60%}
      .fl{position:absolute;left:2px;top:0;width:96px;height:72px;border-radius:7px;object-fit:cover;box-shadow:0 6px 16px rgba(0,0,0,.6)}
      .lead{position:absolute;left:-3px;top:-5px;width:106px;height:82px;border:5px solid #ffc83d;border-radius:11px;opacity:0;box-sizing:border-box}
      .dg{position:absolute;left:12px;top:76px;width:76px;height:44px;overflow:hidden;text-align:center;font-size:44px;line-height:44px;color:#fff;background:rgba(3,6,10,.82);border-radius:6px}
      .st{display:block}
      .st span{display:block;height:44px}`;
  const hud = hudFile({ total: TOTAL, css, body, js });
  const world = {
    format: "course",
    total: TOTAL,
    pulse: P,
    t0: T0,
    tEnd,
    plinth: PLINTH,
    block: BLOCK,
    plate: PLATE,
    teams: teams.map((t) => ({ id: t.id, flag: t.flag, color: t.color, confetti: t.confetti })),
    events: events.map((e) => ({ year: e.year, team: e.team, L: e.L, next: e.next, big: e.big, count: e.count, top: e.top, counts: e.counts, shot: e.shot, trans: e.trans, fall: e.fall })),
  };
  const timing = {
    offset: data.music.phase + data.music.entry_pulse_index * P - T0,
    total: TOTAL,
    t0: T0,
    tEnd,
    pulse: P,
    riser: events.filter((e) => e.big).slice(-1)[0]?.L ?? null,
    events: events.map((e) => ({ year: e.year, L: e.L, big: e.big, fall: e.fall, hasNote: !!e.note })),
  };
  // les clubs n'ont pas de drapeau : on dessine leurs couleurs avec trois lettres
  const extraFiles = {};
  teams.forEach((t) => {
    if (t.club) extraFiles[`assets/flags/${t.flag}.svg`] = clubFlagSvg({ ...t.club, code: t.club.code || t.id });
  });
  return { hud, world, timing, total: TOTAL, title: data.title || "La Course au titre", flags: teams.filter((t) => !t.club).map((t) => t.flag), extraFiles };
}
