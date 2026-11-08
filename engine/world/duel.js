// Format « Le Duel » : deux tours côte à côte qui montent année par année, une couleur de club par saison.
import { THREE, clamp, lerp, smooth, bigFall, orbitPose } from "./stadium.js";
import { RoundedBoxGeometry } from "../lib/RoundedBoxGeometry.js";

export async function setup(S, C) {
  const { scene, goldMat, darkMetal } = S;
  const K = C.k;
  const X = [-3.3, 3.3];
  const WD = 4.0;
  const PL = 0.6;
  const GAP = 0.035;

  // ---------------------------------------------------------------- couleurs de club, sans écusson
  function clubTexture(club) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d");
    const [c0, c1, c2] = club.colors;
    g.fillStyle = c0;
    g.fillRect(0, 0, 512, 512);
    if (club.pattern === "stripes") {
      g.fillStyle = c1;
      for (let i = 1; i < 6; i += 2) g.fillRect((i * 512) / 6, 0, 512 / 6, 512);
    } else if (club.pattern === "hoops") {
      g.fillStyle = c1;
      for (let i = 0; i < 4; i++) g.fillRect(0, i * 128 + 64, 512, 64);
    } else if (club.pattern === "band") {
      g.fillStyle = c2 || "#ffffff";
      g.fillRect(512 * 0.33, 0, 512 * 0.34, 512);
      g.fillStyle = c1;
      g.fillRect(512 * 0.36, 0, 512 * 0.28, 512);
    } else if (club.pattern === "trim") {
      g.fillStyle = c1;
      g.fillRect(512 * 0.07, 0, 512 * 0.035, 512);
      g.fillRect(512 * 0.895, 0, 512 * 0.035, 512);
    }
    // tissu : une trame très légère pour sortir de l'aplat
    const img = g.getImageData(0, 0, 512, 512);
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const i = (y * 512 + x) * 4;
        const n = ((x * 7 + y * 13) % 5) - 2 + (((x >> 1) + (y >> 1)) % 2 ? 1.5 : -1.5);
        img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
        img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
        img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
      }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }
  const clubMat = {};
  for (const [id, club] of Object.entries(C.clubs)) {
    const tex = clubTexture(club);
    clubMat[id] = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2, envMapIntensity: 0.25 });
  }

  // ---------------------------------------------------------------- tours : un segment par club et par saison
  const segments = [];
  const base = [PL, PL];
  C.steps.forEach((st, i) => {
    [st.a, st.b].forEach((parts, s) => {
      const total = parts.reduce((x, p) => x + p[1], 0);
      let off = 0;
      parts.forEach(([club, goals]) => {
        const h = goals * K;
        const hh = Math.max(h - GAP, 0.012);
        const geo = new THREE.BoxGeometry(WD, hh, WD);
        geo.translate(0, hh / 2, 0);
        const pos = geo.attributes.position;
        const nor = geo.attributes.normal;
        const uv = geo.attributes.uv;
        const col = new Float32Array(pos.count * 3);
        for (let v = 0; v < pos.count; v++) {
          if (Math.abs(nor.getY(v)) < 0.5) uv.setY(v, (base[s] + pos.getY(v)) / 4);
          else uv.setXY(v, 0.5, 0.5);
          const k = pos.getY(v) > hh * 0.5 ? 1 : 0.66;
          col.set([k, k, k], v * 3);
        }
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        const mesh = new THREE.Mesh(geo, clubMat[club]);
        mesh.position.set(X[s], base[s], 0);
        mesh.visible = false;
        scene.add(mesh);
        segments.push({ mesh, s, step: st, h, f0: off / total, f1: (off + goals) / total });
        base[s] += h;
        off += goals;
      });
    });
  });

  // socles, chapeaux dorés avec le drapeau, ombres et faisceau du meneur
  const flags = await Promise.all(C.sides.map((s) => S.loadFlag(s.flag)));
  const caps = [];
  const kits = [];
  const plinthGeo = new RoundedBoxGeometry(4.6, PL, 4.6, 3, 0.06);
  C.sides.forEach((side, s) => {
    const p = new THREE.Mesh(plinthGeo, darkMetal);
    p.position.set(X[s], PL / 2, 0);
    scene.add(p);
    const cap = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.16, 4.3), goldMat);
    plate.position.y = 0.08;
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.7), new THREE.MeshBasicMaterial({ map: flags[s] }));
    lid.rotation.x = -Math.PI / 2;
    lid.position.y = 0.17;
    cap.add(plate, lid);
    cap.position.set(X[s], PL, 0);
    scene.add(cap);
    caps.push(cap);
    kits.push(S.groundKit(X[s], 0, 8));
  });

  // ---------------------------------------------------------------- croissance au temps t
  function growth(st, t) {
    if (st.big) {
      if (t < st.L - st.fall) return 0;
      if (t >= st.L) return 1;
      return bigFall((t - (st.L - st.fall)) / st.fall);
    }
    const u = (t - (st.L - 0.1)) / 0.32;
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return 1 - Math.pow(1 - u, 3);
  }
  const P = C.pulse;
  const REW0 = 2 * P;
  const REW1 = C.t0 - 0.42;
  function tw(t) {
    if (t >= REW1) return t;
    if (t < REW0) return C.total;
    const u = (t - REW0) / (REW1 - REW0);
    return lerp(C.total, 0, 1 - Math.pow(1 - u, 2.2));
  }
  function tops(t) {
    t = tw(t);
    const out = [PL, PL];
    for (const sg of segments) {
      const g = growth(sg.step, t);
      const part = clamp((g - sg.f0) / Math.max(1e-6, sg.f1 - sg.f0));
      out[sg.s] += sg.h * part;
    }
    return out;
  }
  const hT = (t) => Math.max(...tops(t));

  // ---------------------------------------------------------------- impacts et confettis
  const sum = (parts) => parts.reduce((x, p) => x + p[1], 0);
  const heroOf = (st) => (st.big && st.after[0] === st.after[1] ? -1 : sum(st.a) >= sum(st.b) ? 0 : 1);
  const hits = C.steps.map((st) => {
    const hero = heroOf(st);
    const top = PL + Math.max(st.after[0], st.after[1]) * K;
    const x = hero < 0 ? 0 : X[hero];
    const y = hero < 0 ? top : PL + st.after[hero] * K;
    return { t: st.L, big: st.big, fall: st.fall, x, y, z: 0, color: hero < 0 ? "#ffc83d" : C.sides[hero].color, tifoTex: st.big && hero >= 0 ? flags[hero] : null, tifoAngle: -Math.PI / 2 };
  });
  C.steps.forEach((st) => {
    const hero = heroOf(st);
    const who = hero < 0 ? [0, 1] : [hero];
    who.forEach((s) => S.burst({ t: st.L, x: X[s], y: PL + st.after[s] * K + 0.3, z: 0, big: st.big, colors: C.sides[s].confetti, rainAngle: Math.PI / 2, rainR: 10, rainY: PL + st.after[s] * K + 6, seed: 7000 + st.year * 3 + s }));
  });

  // ---------------------------------------------------------------- plans
  const SH = {
    front: (u, h) => ({ x: lerp(-2.2, 2.2, u), y: h + 1.6, z: lerp(21, 18, u), tx: 0, ty: h - 2.3, tz: 0, fov: 40, roll: 0 }),
    sideA: (u, h) => ({ x: lerp(-15.5, -14, u), y: h + 2.4, z: lerp(9.5, 7, u), tx: -2.4, ty: h - 1.9, tz: 0, fov: 38, roll: 1.5 }),
    sideB: (u, h) => ({ x: lerp(15.5, 14, u), y: h + 2.4, z: lerp(9.5, 7, u), tx: 2.4, ty: h - 1.9, tz: 0, fov: 38, roll: -1.5 }),
    level: (u, h) => ({ x: lerp(1.5, -1.5, u), y: h + 0.1, z: lerp(23, 19.5, u), tx: 0, ty: h - 2.8, tz: 0, fov: 36, roll: 0 }),
    low: (u, h) => ({ x: lerp(4, 2.5, u), y: Math.max(1.4, h - 13), z: lerp(15, 13, u), tx: 0, ty: h - 1.2, tz: 0, fov: 52, roll: 0 }),
    orbit: (u, h) => {
      const a = lerp(0.95, 1.95, smooth(u));
      return { x: Math.cos(a) * 19, y: h + 4, z: Math.sin(a) * 19, tx: 0, ty: h - 2.2, tz: 0, fov: 40, roll: 0 };
    },
    snap: (u, h) => ({ x: lerp(0.8, 0.2, u), y: h + 1.1, z: lerp(15.5, 14.5, u), tx: 0, ty: h - 1.8, tz: 0, fov: 42, roll: 0 }),
    bigLevel: (u, h) => ({ x: lerp(-5, 5, smooth(u)), y: h + 0.2, z: lerp(27, 16, smooth(u)), tx: 0, ty: h - 2.6, tz: 0, fov: lerp(38, 34, u), roll: lerp(-2, 1.5, u) }),
  };
  const WHIP = 0.42;
  const segs = [];
  const hF = hT(C.total + 1);
  // accroche : les deux tours d'arrivée vues d'en bas, puis de côté, puis on rembobine en plongeant avec elles
  segs.push({ t0: 0, t1: P, trans: "cut", dur: 0, pose: (u) => ({ x: lerp(-3, 3, u), y: 1.6, z: lerp(19, 16, u), tx: 0, ty: hF * 0.62, tz: 0, fov: 64, roll: lerp(-3, 2, u) }) });
  segs.push({ t0: P, t1: 2 * P, trans: "cut", dur: 0, pose: (u) => orbitPose(lerp(30, 27, u), lerp(1.05, 1.3, u), hF * 0.55, hF * 0.62, 48, 0) });
  segs.push({ t0: 2 * P, t1: 0, trans: "cut", dur: 0, pose: (u, t) => ({ x: lerp(2, -1, u), y: hT(t) + 3, z: lerp(26, 17, u), tx: 0, ty: hT(t) - 3, tz: 0, fov: 44, roll: 0 }) });
  C.steps.forEach((st) => {
    const arrive = st.big ? st.L - st.fall : st.L - 0.1;
    const dur = st.trans === "cut" ? 0 : WHIP;
    segs[segs.length - 1].t1 = arrive - dur;
    segs.push({ t0: arrive, t1: 0, trans: st.trans, dur, craneH: 14, pose: (u, t) => SH[st.shot](u, hT(t)) });
  });
  const endArr = C.tEnd - 0.1;
  segs[segs.length - 1].t1 = endArr - 0.62;
  const topEnd = hT(C.total);
  segs.push({ t0: endArr, t1: C.total, trans: "crane", dur: 0.62, craneH: 18, pose: (u) => orbitPose(lerp(46, 40, u), lerp(1.25, 1.85, u), topEnd + lerp(14, 9, u), topEnd * 0.62, 50, 0) });

  // ---------------------------------------------------------------- état au temps t
  function update(t, ctx) {
    const tp = tops(t);
    const tt = tw(t);
    for (const sg of segments) {
      const g = growth(sg.step, tt);
      const part = clamp((g - sg.f0) / Math.max(1e-6, sg.f1 - sg.f0));
      sg.mesh.visible = part > 0.0005;
      sg.mesh.scale.y = Math.max(part, 0.0005);
    }
    // petit rebond du chapeau doré quand la tour arrive
    const last = ctx.env.e;
    const tau = last ? t - last.t : 99;
    const bounce = tau < 1 ? 0.25 * Math.exp(-tau * 7) * Math.cos(tau * 24) : 0;
    caps.forEach((cap, s) => {
      cap.position.y = tp[s] + Math.max(0, bounce) * 0.4;
      kits[s].setHeight(tp[s]);
    });
    let lastIdx = -1;
    for (let i = 0; i < C.steps.length; i++) if (t >= C.steps[i].L) lastIdx = i;
    const now = lastIdx >= 0 ? C.steps[lastIdx].lead : null;
    const prev = lastIdx > 0 ? C.steps[lastIdx - 1].lead : null;
    const w = clamp(tau / 0.22);
    [0, 1].forEach((s) => {
      const isL = now === s || now === -1 ? 1 : 0;
      const wasL = prev === s || prev === -1 ? 1 : 0;
      kits[s].setLead(lastIdx >= 0 ? lerp(wasL, isL, w) : 0);
    });
  }
  function minSamples(t) {
    for (const st of C.steps) if (!st.big && t >= st.L - 0.12 && t < st.L + 0.25) return 4;
    return 1;
  }
  function prepAim(prep, t) {
    return { x: 0, y: hT(t), z: 0 };
  }
  return { hits, segs, update, minSamples, prepAim };
}
