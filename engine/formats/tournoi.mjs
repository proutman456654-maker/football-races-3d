// Format « Le Tournoi de billes » : 16 équipes, un tableau, chaque match se joue en physique dans l'arène.
import { fmt, esc, hudFile, strings } from "./common.mjs";
import { pickMatch, ARENA } from "./marbles-sim.mjs";

const fit = (text, max, width = 980) => Math.min(max, Math.floor(width / (String(text).length * 0.4)));
const hashStr = (s) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
};
const INTRO = 0.45; // saut des billes dans l'arène
// accord en français : le Brésil qualifié, la France qualifiée, les Pays-Bas qualifiés
const agree = (team, m, f, p) => (team.g === "f" ? f : team.g === "mp" ? p : m);

export function build(data) {
  const L10N = strings(data);
  const P = data.music.pulse;
  const BEAT = P / 2;
  const T0 = data.music.hook_pulses * P;
  const byId = Object.fromEntries(data.teams.map((t, i) => [t.id, { ...t, index: i }]));
  const base = hashStr(data.seed || data.title);
  const sim = [];
  const matches = [];
  let cur = T0;
  let alive = data.pairs.map((p) => [...p]);
  data.rounds.forEach((rd, ri) => {
    const next = [];
    alive.forEach((pair, mi) => {
      const len = rd.beats * BEAT;
      const S = cur;
      cur += len;
      const res = pickMatch(base % 100000 + ri * 1000 + mi * 37, len - INTRO, rd.win[0], rd.win[1]);
      // qui prend la bille 0 dépend aussi de la graine : aucun avantage d'être cité en premier
      const swap = (res.m.seed + ri) % 2 === 1;
      const ballTeam = swap ? [pair[1], pair[0]] : [pair[0], pair[1]];
      const loserId = ballTeam[res.loser];
      const winnerId = ballTeam[1 - res.loser];
      next.push(winnerId);
      // en finale, on rejoue au ralenti la seconde décisive : la vidéo garde sa durée, la physique ne change pas
      const big = ri === data.rounds.length - 1;
      const slow = big ? { a: Math.max(0, res.elimT - 0.7), b: res.elimT + 0.3, k: 0.35 } : null;
      const vOf = (s) => (!slow || s <= slow.a ? s : s <= slow.b ? slow.a + (s - slow.a) / slow.k : slow.a + (slow.b - slow.a) / slow.k + (s - slow.b));
      const E = S + INTRO + vOf(res.elimT);
      matches.push({ round: ri, roundName: rd.name, idx: mi, of: alive.length, S, len, end: cur, pair, ballTeam, winner: winnerId, loser: loserId, E, simIndex: sim.length, m: res.m, events: res.events.map((e) => ({ ...e, t: vOf(e.t) })), hz: res.hz, nFrames: res.frames.length, big, slow });
      sim.push(res.frames);
    });
    // on reforme les paires dans l'ordre du tableau
    alive = [];
    for (let k = 0; k < next.length; k += 2) alive.push(next.slice(k, k + 2));
  });
  const final = matches[matches.length - 1];
  const champion = final.winner;
  const finalist = final.loser;
  const tEnd = cur;
  const endLen = data.music.end_beats * BEAT;
  const TOTAL = tEnd + endLen;
  if (TOTAL < 61) throw new Error(`Durée ${TOTAL} s, il en faut au moins 61`);

  // ---------------------------------------------------------------- calques de texte
  const T = (id) => byId[id];
  let body = "";
  let js = "";
  matches.forEach((mt, k) => {
    const id = `m${k}`;
    const [a, b] = mt.pair;
    const label = mt.big ? mt.roundName : `${mt.roundName} · ${mt.idx + 1}/${mt.of}`;
    const fs = Math.min(92, fit(`${T(a).name} VS ${T(b).name}`, 92, 780));
    const winName = T(mt.winner).name;
    const res = mt.big ? L10N.champions(T(mt.winner), agree) : L10N.through(T(mt.winner), agree);
    body += `
    <div id="${id}" class="clip mt" data-start="${fmt(mt.S)}" data-duration="${fmt(mt.len - 0.01)}" data-track-index="2">
      <div class="mtw" id="${id}w">
        <div class="rnd" id="${id}r">${esc(label)}</div>
        <div class="vs" id="${id}v" style="font-size:${fs}px"><span class="tm" id="${id}a"><img src="assets/flags/${T(a).flag}.svg" alt="">${esc(T(a).name)}</span><span class="vsx">VS</span><span class="tm" id="${id}b">${esc(T(b).name)}<img src="assets/flags/${T(b).flag}.svg" alt=""></span></div>
        <div class="resw"><div class="res${mt.big ? " big" : ""}" id="${id}c">${esc(res)}</div></div>
      </div>
    </div>`;
    const loserSide = mt.loser === a ? "a" : "b";
    const winSide = loserSide === "a" ? "b" : "a";
    js += `
  tl.fromTo("#${id}v",{scale:1.5,opacity:0,filter:"blur(10px)"},{scale:1,opacity:1,filter:"blur(0px)",duration:.3,ease:"expo.out"},${fmt(mt.S)});
  tl.fromTo("#${id}r",{opacity:0,y:-14},{opacity:1,y:0,duration:.2,ease:"power3.out"},${fmt(mt.S + 0.04)});
  tl.set("#${id}${loserSide}",{opacity:1},${fmt(mt.S)});
  tl.to("#${id}${loserSide}",{opacity:.28,duration:.12,ease:"none"},${fmt(mt.E)});
  tl.set("#${id}${winSide}",{color:"#ffffff"},${fmt(mt.S)});
  tl.set("#${id}${winSide}",{color:"#ffd24a"},${fmt(mt.E)});
  tl.fromTo("#${id}${winSide}",{scale:1},{scale:1.16,duration:.07,ease:"power2.out"},${fmt(mt.E)});
  tl.to("#${id}${winSide}",{scale:1,duration:.45,ease:"elastic.out(1,.55)"},${fmt(mt.E + 0.07)});
  tl.fromTo("#${id}c",{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:.22,ease:"power4.out"},${fmt(mt.E + 0.12)});`;
  });

  // ---------------------------------------------------------------- tableau : 16 drapeaux en bas, les vainqueurs montent d'un étage
  const X0 = 62;
  const W = 884;
  const rowY = [1288, 1236, 1188, 1142, 1088];
  const slotX = (level, i) => {
    const n = 16 >> level;
    const step = W / n;
    return X0 + step * (i + 0.5);
  };
  let svg = "";
  for (let level = 0; level < 4; level++) {
    const n = 16 >> level;
    for (let i = 0; i < n; i += 2) {
      const x1 = slotX(level, i);
      const x2 = slotX(level, i + 1);
      const xm = slotX(level + 1, i / 2);
      const y1 = rowY[level] - 4;
      const y2 = rowY[level + 1] + 24;
      const ym = (y1 + y2) / 2 + 4;
      svg += `<path d="M${x1} ${y1} V${ym} H${x2} V${y1} M${xm} ${ym} V${y2}" />`;
    }
  }
  const order = data.pairs.flat();
  const flagW = [46, 52, 58, 64, 84];
  let br = `<svg class="brl" width="1080" height="1920" viewBox="0 0 1080 1920" aria-hidden="true">${svg}</svg>`;
  order.forEach((id, i) => {
    br += `<img class="bf" id="b0-${id}" src="assets/flags/${T(id).flag}.svg" alt="" style="left:${fmt(slotX(0, i) - flagW[0] / 2)}px;top:${rowY[0]}px;width:${flagW[0]}px;height:${Math.round(flagW[0] * 0.75)}px">`;
  });
  // position de chaque équipe à chaque étage
  const slotOf = {};
  order.forEach((id, i) => (slotOf[id] = [i]));
  matches.forEach((mt) => {
    const lvl = mt.round + 1;
    const i = Math.floor(slotOf[mt.winner][mt.round] / 2);
    slotOf[mt.winner][lvl] = i;
    const w = flagW[lvl];
    br += `<img class="bf" id="b${lvl}-${mt.winner}" src="assets/flags/${T(mt.winner).flag}.svg" alt="" style="left:${fmt(slotX(lvl, i) - w / 2)}px;top:${rowY[lvl]}px;width:${w}px;height:${Math.round(w * 0.75)}px">`;
    js += `
  tl.set("#b${lvl}-${mt.winner}",{opacity:0,scale:.4},0);
  tl.to("#b${lvl}-${mt.winner}",{opacity:1,scale:1,duration:.4,ease:"back.out(2)"},${fmt(mt.E + 0.18)});
  tl.to("#b${mt.round}-${mt.loser}",{opacity:.25,duration:.2,ease:"none"},${fmt(mt.E)});`;
  });
  body += `
    <div id="bracket" class="clip" data-start="0" data-duration="${fmt(TOTAL)}" data-track-index="4" style="position:absolute;left:0;top:0;width:1080px;height:1920px" data-layout-ignore>
      ${br}
    </div>`;

  // ---------------------------------------------------------------- accroche et fin
  const hk = data.hook;
  const end = data.end;
  const withArt = (t) => `${t.art || ""}${t.name}`;
  const fill = (s) =>
    s
      .replace(/\{CHAMP\}/g, agree(T(champion), "CHAMPION", "CHAMPIONNE", "CHAMPIONS"))
      .replace(/\{BAT\}/g, T(champion).g === "mp" ? "BATTENT" : "BAT")
      .replace(/\{W\}/g, withArt(T(champion)))
      .replace(/\{F\}/g, withArt(T(finalist)));
  const end2At = tEnd + 5 * BEAT;
  body =
    `
    <div id="hook" class="hk clip" data-start="0" data-duration="${fmt(T0 - 0.02)}" data-track-index="1">
      <div class="hkw" id="hookw">
        <div class="h1" id="h1" style="font-size:${fit(hk.small, 96)}px;color:#ffd24a">${esc(hk.small)}</div>
        <div class="h2" id="h2" style="font-size:${fit(hk.big, 204)}px">${esc(hk.big)}</div>
        <div class="h3w" id="h3w"><div class="h3" id="h3">${esc(hk.question)}</div></div>
      </div>
    </div>` +
    body +
    `
    <div id="end1" class="en clip" data-start="${fmt(tEnd)}" data-duration="${fmt(end2At - tEnd - 0.02)}" data-track-index="2">
      <div class="hkw" id="end1w"><div class="e1" id="e1" style="font-size:${fit(fill(end.one.big), 136)}px;color:#ffd24a">${esc(fill(end.one.big))}</div><div class="e2" id="e2" style="font-size:${fit(fill(end.one.small), 76)}px;color:#fff">${esc(fill(end.one.small))}</div></div>
    </div>
    <div id="end2" class="en clip" data-start="${fmt(end2At)}" data-duration="${fmt(TOTAL - end2At)}" data-track-index="2">
      <div class="e3" id="e3" style="font-size:${fit(end.two.big, 136)}px">${esc(end.two.big)}</div>
      <div class="e4w" id="e4w"><div class="e4" id="e4">${esc(end.two.small)}</div></div>
      <div class="e5" id="e5">${esc(end.two.tiny)}</div>
    </div>
    <div id="src" class="src clip" data-start="${fmt(tEnd + 0.4)}" data-duration="${fmt(TOTAL - tEnd - 0.4)}" data-track-index="2" style="top:1030px">${esc(end.foot)}</div>`;
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
      .mt{position:absolute;left:0;top:0;width:1080px;height:1920px}
      .mtw{position:absolute;left:0;top:0;width:1080px;text-align:center}
      .rnd{position:absolute;left:0;width:1080px;top:184px;font-size:58px;line-height:64px;letter-spacing:2px;color:#ffd24a;text-shadow:0 3px 10px rgba(0,0,0,.9)}
      .vs{position:absolute;left:0;width:1080px;top:258px;line-height:104px;white-space:nowrap;text-shadow:0 6px 0 rgba(0,0,0,.4),0 14px 40px rgba(0,0,0,.7)}
      .vs .tm{display:inline-block}
      .vs .tm:first-child{transform-origin:100% 55%}
      .vs .tm:last-child{transform-origin:0% 55%}
      .vs img{width:76px;height:57px;border-radius:6px;vertical-align:4px;margin:0 16px;box-shadow:0 4px 14px rgba(0,0,0,.6)}
      .vs .vsx{display:inline-block;margin:0 22px;font-size:.62em;color:#ffd24a}
      .resw{position:absolute;left:0;width:1080px;top:392px;text-align:center}
      .res{display:inline-block;padding:4px 26px 2px;background:#ffc83d;color:#0a0d12;font-size:62px;line-height:70px;letter-spacing:1px;transform:skewX(-7deg)}
      .res.big{background:#fff;font-size:76px;line-height:84px}
      .brl{position:absolute;left:0;top:0}
      .brl path{fill:none;stroke:rgba(255,255,255,.38);stroke-width:3}
      .bf{position:absolute;border-radius:4px;box-shadow:0 3px 8px rgba(0,0,0,.7)}`;
  const hud = hudFile({ total: TOTAL, css, body, js });

  // ---------------------------------------------------------------- données du monde 3D et de la physique
  const flat = [];
  sim.forEach((frames) => frames.forEach((f) => flat.push(...f)));
  const f32 = new Float32Array(flat);
  const b64 = Buffer.from(f32.buffer).toString("base64");
  const simFile = `// Trajectoires des billes calculées au build (14 nombres par image : deux billes, position et rotation).\nexport const SIM_B64 = "${b64}";\n`;
  const world = {
    format: "tournoi",
    total: TOTAL,
    pulse: P,
    t0: T0,
    tEnd,
    intro: INTRO,
    arena: ARENA,
    champion,
    teams: data.teams.map((t) => ({ id: t.id, name: t.name, flag: t.flag, color: t.color, confetti: t.confetti })),
    order,
    matches: matches.map((mt) => ({ round: mt.round, S: mt.S, len: mt.len, end: mt.end, E: mt.E, ballTeam: mt.ballTeam, winner: mt.winner, loser: mt.loser, big: mt.big, m: mt.m, hz: mt.hz, nFrames: mt.nFrames, simIndex: mt.simIndex, slow: mt.slow, bumps: mt.events.filter((e) => e.kind === "bump").map((e) => [fmt(e.t), e.k]) })),
  };
  // sons : les chocs les plus forts de chaque match, sans en mettre partout
  const sfx = [];
  matches.forEach((mt) => {
    const t0 = mt.S + INTRO;
    const strong = mt.events.filter((e) => e.kind !== "out" && e.t < mt.E - mt.S - INTRO + 0.6).sort((x, y) => y.s - x.s).slice(0, mt.big ? 6 : 3);
    strong.forEach((e) => sfx.push({ t: fmt(t0 + e.t), kind: e.kind, s: fmt(e.s) }));
  });
  const events = [];
  matches.forEach((mt) => {
    events.push({ year: `${mt.round}-${mt.idx}-in`, L: mt.S + INTRO, big: false, fall: 0, hasNote: false, soft: true });
    events.push({ year: `${mt.round}-${mt.idx}-out`, L: mt.E, big: mt.big, fall: mt.big ? 1.6 : 0, hasNote: true });
  });
  const timing = { offset: data.music.phase + data.music.entry_pulse_index * P - T0, total: TOTAL, t0: T0, tEnd, pulse: P, riser: final.E, events, sfx };
  const flags = [...new Set(data.teams.map((t) => t.flag))];
  return { hud, world, timing, total: TOTAL, title: data.title, flags, extraFiles: { "world/sim-data.js": simFile }, summary: { champion: T(champion).name, finalist: T(finalist).name, results: matches.map((mt) => `${T(mt.pair[0]).name}-${T(mt.pair[1]).name}: ${T(mt.winner).name}`) } };
}
