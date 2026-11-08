// Format « La Ligue des Billes » : un vrai championnat fictif de 20 nations, une journée chaque dimanche.
// La mémoire du championnat vit dans state.json : calendrier, résultats et classement passent d'une vidéo à la suivante.
import fs from "node:fs";
import path from "node:path";
import { fmt, esc, hudFile, strings } from "./common.mjs";
import { simulateFootball, PITCH } from "./football-sim.mjs";

const fit = (text, max, width = 980) => Math.min(max, Math.floor(width / (String(text).length * 0.4)));
const hashStr = (s) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
};
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const INTRO = 0.45;

// calendrier aller-retour par la méthode du cercle : chaque équipe rencontre toutes les autres, une fois à domicile
export function makeFixtures(ids, seed) {
  const r = rng(seed);
  const t = [...ids];
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  const n = t.length;
  const rounds = [];
  let arr = [...t];
  for (let k = 0; k < n - 1; k++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      pairs.push(k % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return [...rounds, ...rounds.map((pairs) => pairs.map(([a, b]) => [b, a]))];
}
export function newState(data) {
  const ids = data.teams.map((t) => t.id);
  return {
    season: data.season,
    journee: 0,
    fixtures: makeFixtures(ids, hashStr(`ligue-${data.season}`)),
    table: Object.fromEntries(ids.map((id) => [id, { j: 0, v: 0, n: 0, d: 0, bp: 0, bc: 0, pts: 0 }])),
    history: [],
  };
}
export function ranking(table, ids) {
  return [...ids].sort((a, b) => {
    const A = table[a];
    const B = table[b];
    return B.pts - A.pts || B.bp - B.bc - (A.bp - A.bc) || B.bp - A.bp || ids.indexOf(a) - ids.indexOf(b);
  });
}

export function build(data, ctx = {}) {
  const L10N = strings(data);
  const P = data.music.pulse;
  const T0 = data.music.hook_pulses * P;
  const ids = data.teams.map((t) => t.id);
  const byId = Object.fromEntries(data.teams.map((t) => [t.id, t]));
  const statePath = ctx.dataPath ? path.resolve(path.dirname(ctx.dataPath), data.statePath) : null;
  const state = statePath && fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : newState(data);
  const J = state.journee + 1;
  if (J > state.fixtures.length) throw new Error("saison terminée : créer la saison suivante");
  const before = JSON.parse(JSON.stringify(state.table));
  const orderBefore = ranking(before, ids);

  // ---------------------------------------------------------------- les 10 matchs de la journée, tous joués en physique
  const MATCH_P = 11;
  const simT = MATCH_P * P - INTRO - 0.35;
  const results = state.fixtures[J - 1].map(([h, a]) => {
    const res = simulateFootball(hashStr(`${state.season}-${J}-${h}-${a}`) % 1000003, simT);
    return { h, a, res, gh: res.score[0], ga: res.score[1] };
  });
  const table = JSON.parse(JSON.stringify(state.table));
  results.forEach(({ h, a, gh, ga }) => {
    const H = table[h];
    const A = table[a];
    H.j++;
    A.j++;
    H.bp += gh;
    H.bc += ga;
    A.bp += ga;
    A.bc += gh;
    if (gh > ga) {
      H.v++;
      A.d++;
      H.pts += 3;
    } else if (gh < ga) {
      A.v++;
      H.d++;
      A.pts += 3;
    } else {
      H.n++;
      A.n++;
      H.pts++;
      A.pts++;
    }
  });
  const orderAfter = ranking(table, ids);
  // les 3 matchs à l'écran : les plus riches en buts, puis les plus serrés. Le choix ne change aucun résultat.
  // l'affiche annoncée la semaine d'avant est toujours montrée, en dernier
  const ann = state.announced ? results.find((r) => r.h === state.announced[0] && r.a === state.announced[1]) : null;
  const byGoals = [...results].filter((r) => r !== ann).sort((x, y) => y.gh + y.ga - (x.gh + x.ga) || Math.abs(x.gh - x.ga) - Math.abs(y.gh - y.ga));
  const featured = ann ? [...byGoals.slice(0, 2), ann] : byGoals.slice(0, 3);
  const others = results.filter((r) => !featured.includes(r));

  // ---------------------------------------------------------------- minutage
  const matches = featured.map((f, k) => {
    const S = T0 + k * MATCH_P * P;
    const goals = f.res.events.filter((e) => e.kind === "goal").map((e) => ({ t: S + INTRO + e.t, team: e.team, min: Math.min(90, Math.max(1, Math.ceil((e.t / simT) * 90))) }));
    return { ...f, k, S, len: MATCH_P * P, end: S + MATCH_P * P, goals };
  });
  const tTable = T0 + 3 * MATCH_P * P;
  const TABLE_P = 13;
  const tNext = tTable + TABLE_P * P;
  const NEXT_P = 9;
  const TOTAL = tNext + NEXT_P * P;
  if (TOTAL < 61) throw new Error(`Durée ${TOTAL} s, il en faut au moins 61`);
  const nextRound = state.fixtures[J] || null;
  // l'affiche de la semaine suivante : le match entre les deux équipes les mieux classées
  const rankOf = Object.fromEntries(orderAfter.map((id, i) => [id, i]));
  const nextPick = nextRound ? [...nextRound].sort((x, y) => rankOf[x[0]] + rankOf[x[1]] - (rankOf[y[0]] + rankOf[y[1]]))[0] : null;

  // ---------------------------------------------------------------- calques
  const T = (id) => byId[id];
  const sub = (s) => s.replace(/\{J\}/g, J).replace(/\{N\}/g, J + 1);
  let body = "";
  let js = "";
  matches.forEach((mt) => {
    const id = `g${mt.k}`;
    const fs1 = Math.min(84, fit(`${T(mt.h).name} 0 - 0 ${T(mt.a).name}`, 84, 760));
    body += `
    <div id="${id}" class="clip mt" data-start="${fmt(mt.S)}" data-duration="${fmt(mt.len - 0.01)}" data-track-index="2">
      <div class="mtw" id="${id}w">
        <div class="rnd">${esc(ann && mt.h === ann.h && mt.a === ann.a ? `${L10N.matchday} ${J} · ${L10N.bigMatch}` : `${L10N.matchday} ${J} · ${L10N.match} ${mt.k + 1}/3`)}</div>
        <div class="sc" style="font-size:${fs1}px"><span class="tm"><img src="assets/flags/${T(mt.h).flag}.svg" alt="">${esc(T(mt.h).name)}</span><span class="sv"><span id="${id}h">0</span>-<span id="${id}a">0</span></span><span class="tm">${esc(T(mt.a).name)}<img src="assets/flags/${T(mt.a).flag}.svg" alt=""></span></div>
        <div class="clk"><span id="${id}c">1</span>'</div>
      </div>
    </div>`;
    js += `
  tl.fromTo("#${id}w",{scale:1.25,opacity:0,filter:"blur(10px)"},{scale:1,opacity:1,filter:"blur(0px)",duration:.3,ease:"expo.out"},${fmt(mt.S)});
  tl.set("#${id}h",{textContent:0},0);tl.set("#${id}a",{textContent:0},0);
  tl.fromTo("#${id}c",{textContent:1},{textContent:90,duration:${fmt(simT)},ease:"none",snap:{textContent:1}},${fmt(mt.S + INTRO)});`;
    const sc = [0, 0];
    mt.goals.forEach((g, gi) => {
      sc[g.team]++;
      const who = g.team === 0 ? mt.h : mt.a;
      const gid = `${id}b${gi}`;
      body += `
    <div id="${gid}" class="clip nt" data-start="${fmt(g.t)}" data-duration="${fmt(Math.min(1.6, mt.end - g.t - 0.02))}" data-track-index="3">
      <div class="gw"><div class="goal" id="${gid}t">${esc(`${L10N.goal} ${T(who).name} ${g.min}'`)}</div></div>
    </div>`;
      js += `
  tl.set("#${id}${g.team === 0 ? "h" : "a"}",{textContent:${sc[g.team]}},${fmt(g.t)});
  tl.fromTo("#${gid}t",{scale:1.6,opacity:0},{scale:1,opacity:1,duration:.25,ease:"expo.out"},${fmt(g.t)});`;
    });
    const fin = mt.gh === mt.ga ? L10N.draw : L10N.win(mt.gh > mt.ga ? withArt(T(mt.h)) : withArt(T(mt.a)));
    const fid = `${id}f`;
    const fStart = mt.S + INTRO + simT;
    body += `
    <div id="${fid}" class="clip nt" data-start="${fmt(fStart)}" data-duration="${fmt(mt.end - fStart - 0.01)}" data-track-index="3">
      <div class="gw"><div class="goal fin" id="${fid}t">${esc(fin)}</div></div>
    </div>`;
    js += `
  tl.fromTo("#${fid}t",{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:.2,ease:"power4.out"},${fmt(fStart)});`;
  });
  function withArt(t) {
    return `${t.art || ""}${t.name}`;
  }

  // autres résultats puis classement animé
  const listEnd = tTable + 3.6;
  body += `
    <div id="oth" class="clip tb" data-start="${fmt(tTable)}" data-duration="${fmt(listEnd - tTable)}" data-track-index="2">
      <div class="pan" id="othp" style="top:300px;height:${80 + others.length * 74}px"></div>
      <div class="tt" style="top:316px">${esc(`${L10N.others} · ${L10N.matchday} ${J}`)}</div>
      ${others
        .map(
          (o, i) => `<div class="orow" id="o${i}" style="top:${384 + i * 74}px"><span class="on l"><img src="assets/flags/${T(o.h).flag}.svg" alt="">${esc(T(o.h).name)}</span><span class="os">${o.gh}-${o.ga}</span><span class="on r">${esc(T(o.a).name)}<img src="assets/flags/${T(o.a).flag}.svg" alt=""></span></div>`,
        )
        .join("\n      ")}
    </div>`;
  js += `\n  tl.fromTo("#othp",{opacity:0},{opacity:1,duration:.2,ease:"none"},${fmt(tTable)});`;
  others.forEach((o, i) => (js += `\n  tl.fromTo("#o${i}",{opacity:0,x:-40},{opacity:1,x:0,duration:.22,ease:"power3.out"},${fmt(tTable + 0.15 + i * 0.12)});`));
  const RH = 41;
  const RY = 330;
  body += `
    <div id="tab" class="clip tb" data-start="${fmt(listEnd)}" data-duration="${fmt(tNext - listEnd - 0.01)}" data-track-index="2">
      <div class="pan" style="top:${RY - 92}px;height:${92 + 20 * RH + 16}px"></div>
      <div class="tt" style="top:${RY - 76}px">${esc(`${L10N.standings} · ${L10N.matchday} ${J}`)}</div>
      <div class="th" style="top:${RY - 30}px"><span class="c1">#</span><span class="c2">${L10N.team}</span><span class="c3">${L10N.played}</span><span class="c4">${L10N.gd}</span><span class="c5">${L10N.pts}</span></div>
      ${ids
        .map((id) => {
          const t = table[id];
          const d = t.bp - t.bc;
          const i0 = orderBefore.indexOf(id);
          return `<div class="row" id="r${id}" style="top:${RY + i0 * RH}px"><span class="c1" id="r${id}k">${i0 + 1}</span><span class="c2"><img src="assets/flags/${T(id).flag}.svg" alt="">${esc(T(id).name)}</span><span class="c3">${t.j}</span><span class="c4">${d > 0 ? "+" + d : d}</span><span class="c5" id="r${id}p">${before[id].pts}</span></div>`;
        })
        .join("\n      ")}
    </div>`;
  const moveAt = listEnd + 0.9;
  ids.forEach((id) => {
    const i0 = orderBefore.indexOf(id);
    const i1 = orderAfter.indexOf(id);
    js += `\n  tl.fromTo("#r${id}",{opacity:0},{opacity:1,duration:.18,ease:"none"},${fmt(listEnd + i0 * 0.025)});`;
    js += `\n  tl.fromTo("#r${id}",{y:0},{y:${(i1 - i0) * RH},duration:.8,ease:"power3.inOut"},${fmt(moveAt)});`;
    js += `\n  tl.fromTo("#r${id}p",{textContent:${before[id].pts}},{textContent:${table[id].pts},duration:.5,ease:"none",snap:{textContent:1}},${fmt(moveAt)});`;
    js += `\n  tl.set("#r${id}k",{textContent:${i1 + 1}},${fmt(moveAt + 0.4)});`;
  });
  const leader = orderAfter[0];
  js += `\n  tl.set("#r${leader}",{backgroundColor:"rgba(255,200,61,.22)"},${fmt(moveAt + 0.8)});`;

  // affiche de la semaine suivante
  if (nextPick) {
    const [nh, na] = nextPick;
    const vsSize = Math.min(120, fit(`${T(nh).name} VS ${T(na).name}`, 120, 860));
    body += `
    <div id="nx" class="clip en" data-start="${fmt(tNext)}" data-duration="${fmt(TOTAL - tNext)}" data-track-index="2">
      <div class="nxl" id="nxl">${esc(sub(data.end.label))}</div>
      <div class="nxv" id="nxv" style="font-size:${vsSize}px"><span class="tm"><img src="assets/flags/${T(nh).flag}.svg" alt="">${esc(T(nh).name)}</span><span class="vsx">VS</span><span class="tm">${esc(T(na).name)}<img src="assets/flags/${T(na).flag}.svg" alt=""></span></div>
      <div class="nxw" id="nxw">${esc(data.end.when)}</div>
      <div class="e4w" style="top:560px"><div class="e4" id="nxc">${esc(data.end.cta)}</div></div>
      <div class="e5" style="top:672px" id="nxt">${esc(data.end.tiny)}</div>
    </div>
    <div id="src" class="src clip" data-start="${fmt(tNext + 0.4)}" data-duration="${fmt(TOTAL - tNext - 0.4)}" data-track-index="2" style="top:1180px">${esc(data.end.foot)}</div>`;
    js += `
  tl.fromTo("#nxl",{opacity:0,y:-20},{opacity:1,y:0,duration:.25,ease:"power3.out"},${fmt(tNext)});
  tl.fromTo("#nxv",{scale:1.6,opacity:0},{scale:1,opacity:1,duration:.36,ease:"expo.out"},${fmt(tNext + 0.1)});
  tl.fromTo("#nxw",{opacity:0},{opacity:1,duration:.2,ease:"none"},${fmt(tNext + 0.6)});
  tl.fromTo("#nxc",{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:.26,ease:"power4.out"},${fmt(tNext + 1.0)});
  tl.fromTo("#nxt",{opacity:0},{opacity:1,duration:.2,ease:"none"},${fmt(tNext + 1.4)});`;
  }

  const hk = data.hook;
  body =
    `
    <div id="hook" class="hk clip" data-start="0" data-duration="${fmt(T0 - 0.02)}" data-track-index="1">
      <div class="hkw" id="hookw">
        <div class="h1" id="h1" style="font-size:${fit(sub(hk.small), 96)}px;color:#ffd24a">${esc(sub(hk.small))}</div>
        <div class="h2" id="h2" style="font-size:${fit(hk.big, 204)}px">${esc(hk.big)}</div>
        <div class="h3w" id="h3w"><div class="h3" id="h3" style="font-size:${fit(hk.question, 96, 900)}px">${esc(hk.question)}</div></div>
      </div>
    </div>` + body;
  js =
    `
        tl.fromTo("#h3",{scale:1,x:0},{scale:1.16,duration:.06,ease:"power2.out"},${fmt(P)});
        tl.to("#h3",{scale:1,duration:.42,ease:"elastic.out(1,.6)"},${fmt(P + 0.06)});
        tl.fromTo("#h2",{scale:1},{scale:1.05,duration:.06,ease:"power2.out"},${fmt(2 * P)});
        tl.to("#h2",{scale:1,duration:.4,ease:"expo.out"},${fmt(2 * P + 0.06)});
        tl.set("#hookw",{filter:"url(#vblur)"},${fmt(T0 - 0.26)});
        tl.to("#hookw",{y:-1500,duration:.3,ease:"power4.in"},${fmt(T0 - 0.32)});` + js;
  const css = `
      .mt,.tb{position:absolute;left:0;top:0;width:1080px;height:1920px}
      .mtw{position:absolute;left:0;top:0;width:1080px;text-align:center}
      .rnd{position:absolute;left:0;width:1080px;top:184px;font-size:56px;line-height:62px;letter-spacing:2px;color:#ffd24a;text-shadow:0 3px 10px rgba(0,0,0,.9)}
      .sc{position:absolute;left:0;width:1080px;top:254px;line-height:100px;white-space:nowrap;text-shadow:0 6px 0 rgba(0,0,0,.4),0 14px 40px rgba(0,0,0,.7)}
      .sc .tm{display:inline-block}
      .sc img{width:72px;height:54px;border-radius:6px;vertical-align:6px;margin:0 14px;box-shadow:0 4px 14px rgba(0,0,0,.6)}
      .sc .sv{display:inline-block;margin:0 22px;padding:0 20px;background:rgba(3,6,10,.82);border-radius:12px;color:#ffd24a;font-variant-numeric:tabular-nums}
      .clk{position:absolute;left:0;width:1080px;top:364px;font:700 40px/48px Inter,sans-serif;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.9)}
      .gw{position:absolute;left:0;width:1080px;top:432px;text-align:center}
      .goal{display:inline-block;padding:6px 28px 2px;background:#ffc83d;color:#0a0d12;font-size:72px;line-height:80px;letter-spacing:1px;transform:skewX(-7deg)}
      .goal.fin{background:#fff;font-size:62px;line-height:70px}
      .pan{position:absolute;left:40px;width:1000px;background:rgba(3,6,10,.86);border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.5)}
      .tt{position:absolute;left:0;width:1080px;text-align:center;font-size:54px;line-height:60px;color:#ffd24a;letter-spacing:1px}
      .orow{position:absolute;left:60px;width:960px;height:70px;font-size:50px;line-height:70px}
      .orow .on{position:absolute;top:0;width:400px;white-space:nowrap}
      .orow .on.l{left:0;text-align:right}
      .orow .on.r{left:560px;text-align:left}
      .orow img{width:52px;height:39px;border-radius:4px;vertical-align:4px;margin:0 12px}
      .orow .os{position:absolute;left:410px;width:140px;text-align:center;color:#ffd24a;font-variant-numeric:tabular-nums}
      .th{position:absolute;left:60px;width:880px;height:30px;font:700 24px/30px Inter,sans-serif;color:#9aa4b6}
      .row{position:absolute;left:52px;width:896px;height:${RH - 3}px;font-size:34px;line-height:${RH - 3}px;border-radius:7px}
      .th span,.row span{position:absolute;top:0}
      .c1{left:8px;width:44px;text-align:right;color:#9aa4b6}
      .c2{left:70px;width:560px;white-space:nowrap}
      .c2 img{width:40px;height:30px;border-radius:3px;vertical-align:-3px;margin-right:12px}
      .c3{left:640px;width:60px;text-align:center}
      .c4{left:720px;width:80px;text-align:center}
      .c5{left:810px;width:80px;text-align:right;color:#ffd24a}
      .nxl{position:absolute;left:0;width:1080px;top:190px;text-align:center;font-size:66px;line-height:72px;color:#ffd24a;text-shadow:0 3px 10px rgba(0,0,0,.9)}
      .nxv{position:absolute;left:0;width:1080px;top:276px;text-align:center;line-height:130px;white-space:nowrap;text-shadow:0 8px 0 rgba(0,0,0,.42),0 22px 60px rgba(0,0,0,.7)}
      .nxv .tm{display:inline-block}
      .nxv img{width:92px;height:69px;border-radius:7px;vertical-align:10px;margin:0 18px;box-shadow:0 4px 14px rgba(0,0,0,.6)}
      .nxv .vsx{display:inline-block;margin:0 18px;font-size:.55em;color:#ffd24a}
      .nxw{position:absolute;left:0;width:1080px;top:440px;text-align:center;font:700 40px/48px Inter,sans-serif;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.9)}`;
  const hud = hudFile({ total: TOTAL, css, body, js });

  // ---------------------------------------------------------------- monde 3D et physique
  const flat = [];
  matches.forEach((mt) => mt.res.frames.forEach((f) => flat.push(...f)));
  const b64 = Buffer.from(new Float32Array(flat).buffer).toString("base64");
  const world = {
    format: "ligue",
    total: TOTAL,
    pulse: P,
    t0: T0,
    tEnd: tTable,
    intro: INTRO,
    pitch: PITCH,
    teams: data.teams.map((t) => ({ id: t.id, name: t.name, flag: t.flag, color: t.color, confetti: t.confetti })),
    order: orderBefore,
    matches: matches.map((mt) => ({ h: mt.h, a: mt.a, S: mt.S, len: mt.len, end: mt.end, goals: mt.goals, hz: mt.res.hz, nFrames: mt.res.frames.length })),
    tTable,
    tNext,
    next: nextPick,
  };
  const sfx = [];
  matches.forEach((mt) => {
    const t0 = mt.S + INTRO;
    mt.res.events
      .filter((e) => ["kick", "post", "clack"].includes(e.kind))
      .sort((x, y) => y.s - x.s)
      .slice(0, 6)
      .forEach((e) => sfx.push({ t: fmt(t0 + e.t), kind: e.kind === "kick" ? "clack" : e.kind === "post" ? "bump" : "clack", s: fmt(e.s) }));
  });
  const events = [];
  matches.forEach((mt) => {
    events.push({ year: `m${mt.k}-in`, L: mt.S + INTRO, big: false, fall: 0, hasNote: false, soft: true });
    mt.goals.forEach((g, gi) => events.push({ year: `m${mt.k}-g${gi}`, L: g.t, big: false, fall: 0, hasNote: true }));
  });
  events.push({ year: "table", L: tTable + 3.6 + 0.9, big: false, fall: 0, hasNote: false });
  events.push({ year: "next", L: tNext + 0.1, big: true, fall: 0, hasNote: false });
  events.sort((x, y) => x.L - y.L);
  const timing = { offset: data.music.phase + data.music.entry_pulse_index * P - T0, total: TOTAL, t0: T0, tEnd: TOTAL - 0.6, pulse: P, riser: tNext + 0.1, events, sfx };
  const nextState = { ...state, journee: J, announced: nextPick, table, history: [...state.history, { journee: J, results: results.map((r) => [r.h, r.a, r.gh, r.ga]) }] };
  const flags = [...new Set(data.teams.map((t) => t.flag))];
  return {
    hud,
    world,
    timing,
    total: TOTAL,
    title: data.title,
    flags,
    extraFiles: { "world/sim-data.js": `export const SIM_B64 = "${b64}";\n`, "state-next.json": JSON.stringify(nextState, null, 1) },
    summary: { journee: J, results: results.map((r) => `${r.h} ${r.gh}-${r.ga} ${r.a}`), featured: matches.map((m) => `${m.h}-${m.a}`), leader: orderAfter[0], next: nextPick },
  };
}
