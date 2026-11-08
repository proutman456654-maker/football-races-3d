// Format « La Course » : 8 tours de titres autour d'une coupe, un bloc-drapeau par titre.
import { THREE, DEG, clamp, lerp, smooth, bigFall, orbitPose } from "./stadium.js";
import { RoundedBoxGeometry } from "../lib/RoundedBoxGeometry.js";

export async function setup(S, C) {
  const { scene, goldMat, darkMetal } = S;
  const R = 13.5;
  const blockGeo = new RoundedBoxGeometry(3.4, C.block, 3.4, 4, 0.11);
  {
    const pa = blockGeo.attributes.position;
    const col = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      const v = clamp((pa.getY(i) + C.block / 2) / C.block);
      const k = 0.58 + 0.42 * Math.pow(v, 0.8);
      col.set([k, k, k], i * 3);
    }
    blockGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  }
  const plateGeo = new THREE.BoxGeometry(3.72, C.plate, 3.72);
  const plinthGeo = new RoundedBoxGeometry(3.9, C.plinth, 3.9, 3, 0.06);

  const stacks = C.teams.map((t, i) => ({ ...t, angle: (i / C.teams.length) * Math.PI * 2 + Math.PI / 8, index: i, blocks: [], landings: C.events.filter((e) => e.team === i) }));
  stacks.forEach((s) => {
    s.x = Math.cos(s.angle) * R;
    s.z = Math.sin(s.angle) * R;
    s.group = new THREE.Group();
    s.group.position.set(s.x, 0, s.z);
    s.group.rotation.y = -s.angle + Math.PI / 2;
    scene.add(s.group);
    s.kit = S.groundKit(s.x, s.z, 9);
  });

  // coupe générique (forme maison, jamais le trophée officiel)
  const trophy = new THREE.Group();
  {
    const pts = [
      [0.0, 0.0], [1.75, 0.0], [1.75, 0.42], [1.25, 0.56], [0.78, 0.9], [0.5, 1.5], [0.42, 2.4], [0.5, 3.0], [0.92, 3.5],
      [1.45, 4.25], [1.82, 5.2], [2.02, 6.2], [2.06, 6.7], [1.96, 6.72], [1.84, 6.1], [1.6, 5.2], [1.0, 4.3], [0.2, 3.9], [0.0, 3.85],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    const lathe = new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(90), 64);
    const cup = new THREE.Mesh(lathe, new THREE.MeshStandardMaterial({ color: 0xffc247, metalness: 1, roughness: 0.2, emissive: 0x5a3400, emissiveIntensity: 0.16 }));
    trophy.add(cup);
    [1, -1].forEach((sg) => {
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sg * 1.72, 5.7, 0),
        new THREE.Vector3(sg * 2.9, 5.65, 0),
        new THREE.Vector3(sg * 3.1, 4.7, 0),
        new THREE.Vector3(sg * 2.1, 3.8, 0),
        new THREE.Vector3(sg * 1.05, 3.55, 0),
      ]);
      trophy.add(new THREE.Mesh(new THREE.TubeGeometry(path, 40, 0.15, 12), cup.material));
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 1, 48), darkMetal);
    base.position.y = 0.5;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.33, 2.36, 0.14, 48), goldMat);
    band.position.y = 0.92;
    scene.add(base, band);
    trophy.position.y = 1;
    scene.add(trophy);
  }

  const flags = await Promise.all(stacks.map((s) => S.loadFlag(s.flag)));
  stacks.forEach((s, i) => {
    s.flagTex = flags[i];
    const mat = new THREE.MeshStandardMaterial({ map: flags[i], vertexColors: true, roughness: 0.5, metalness: 0, emissive: 0xffffff, emissiveMap: flags[i], emissiveIntensity: 0.22, envMapIntensity: 0.22 });
    const matTop = new THREE.MeshStandardMaterial({ map: flags[i], roughness: 0.5, metalness: 0, emissive: 0xffffff, emissiveMap: flags[i], emissiveIntensity: 0.22, envMapIntensity: 0.22 });
    const plinth = new THREE.Mesh(plinthGeo, darkMetal);
    plinth.position.y = C.plinth / 2;
    s.group.add(plinth);
    const rimM = new THREE.Mesh(new THREE.BoxGeometry(3.72, 0.06, 3.72), goldMat);
    rimM.position.y = C.plinth + 0.03;
    s.group.add(rimM);
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.55), new THREE.MeshBasicMaterial({ map: flags[i] }));
    lid.rotation.x = -Math.PI / 2;
    lid.position.y = C.plinth + 0.07;
    s.group.add(lid);
    s.landings.forEach(() => {
      const g = new THREE.Group();
      const b = new THREE.Mesh(blockGeo, mat);
      const p = new THREE.Mesh(plateGeo, goldMat);
      p.position.y = C.block / 2 + C.plate / 2;
      const top = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 3.3), matTop);
      top.rotation.x = -Math.PI / 2;
      top.position.y = C.block / 2 + C.plate + 0.012;
      g.add(b, p, top);
      g.visible = false;
      s.group.add(g);
      s.blocks.push(g);
    });
  });

  const hits = C.events.map((e) => {
    const st = stacks[e.team];
    return { t: e.L, big: e.big, fall: e.big ? e.fall : 0, x: st.x, y: e.top, z: st.z, color: C.teams[e.team].color, tifoTex: flags[e.team], tifoAngle: st.angle + Math.PI };
  });
  C.events.forEach((e) => {
    const st = stacks[e.team];
    S.burst({ t: e.L, x: st.x, y: e.top + 0.3, z: st.z, big: e.big, colors: C.teams[e.team].confetti, rainAngle: st.angle, rainR: R, seed: 2026 + e.year });
  });

  // ---------------------------------------------------------------- plans
  const SHOTS = {
    heroLow: { side: 1, D: [16, 14], h: [1.2, 1.7], dth: [-0.24, -0.1], f: 0.5, fov: [38, 36], roll: [0, 0] },
    highDive: { side: 1, D: [13, 11.5], h: [9, 7.5], hrel: true, dth: [0.36, 0.24], f: 0.62, fov: [42, 40], roll: [-2, -1] },
    dutch: { side: 1, D: [15, 13.5], h: [2, 2.4], dth: [0.16, 0.3], f: 0.5, fov: [40, 38], roll: [9, 6] },
    insideUp: { side: -1, D: [10.2, 9.2], h: [1, 1.2], dth: [0.28, 0.14], f: 0.5, fov: [52, 50], roll: [0, 0] },
    sideTrack: { side: 1, D: [14.5, 14], h: [0.6, 0.66], hfrac: true, dth: [-0.66, 0.02], f: 0.5, fov: [36, 36], roll: [1.5, -1] },
    wideOrbit: { side: 1, D: [27, 24], h: [6, 7.5], dth: [-0.34, -0.06], f: 0.53, fov: [34, 34], roll: [0, 0] },
    bigOrbit: { side: 1, D: [18.5, 15], h: [1, 3.2], dth: [-1.0, 0.42], f: 0.5, fov: [41, 36], roll: [-3, 2] },
    snap: { side: 1, D: [13, 12.2], h: [1.1, 1.3], dth: [0.06, 0], f: 0.5, fov: [40, 38], roll: [0, 0] },
    snapHigh: { side: 1, D: [11, 10.4], h: [7, 6.2], hrel: true, dth: [-0.22, -0.16], f: 0.62, fov: [44, 42], roll: [0, 0] },
  };
  function shotPose(e, u, t) {
    const s = SHOTS[e.shot];
    const st = stacks[e.team];
    const k = smooth(u);
    let D = lerp(s.D[0], s.D[1], k);
    if (t !== undefined && e.big && t < e.L) D -= 6.5 * (1 - bigFall(clamp((t - (e.L - e.fall)) / e.fall)));
    let h = lerp(s.h[0], s.h[1], k);
    if (s.hrel) h += e.top;
    if (s.hfrac) h = h * e.top + 1;
    const th = st.angle + lerp(s.dth[0], s.dth[1], k);
    const fov = lerp(s.fov[0], s.fov[1], k);
    let ty = e.top - (0.5 - s.f) * 2 * D * Math.tan(fov * 0.5 * DEG);
    if (t !== undefined && e.big && t < e.L) {
      // la caméra accompagne le bloc au ralenti, la tour entre dans l'image au dernier moment
      const w = 1 - bigFall(clamp((t - (e.L - e.fall)) / e.fall));
      ty += 13 * w * 0.94;
      h = lerp(h, ty - 2.5, w);
    }
    return { x: st.x + Math.cos(th) * D * s.side, y: h, z: st.z + Math.sin(th) * D * s.side, tx: st.x, ty, tz: st.z, fov, roll: lerp(s.roll[0], s.roll[1], k) };
  }
  const WHIP = 0.42;
  const ARRIVE = 0.1;
  const P = C.pulse;
  const segs = [];
  segs.push({ t0: 0, t1: P, trans: "cut", dur: 0, pose: (u) => orbitPose(lerp(12.5, 10.6, u), lerp(-0.7, -0.28, u), lerp(1.3, 1.9, u), 5.3, 46, 0) });
  segs.push({ t0: P, t1: 2 * P, trans: "cut", dur: 0, pose: (u) => orbitPose(lerp(25, 28, u), lerp(0.6, 0.86, u), lerp(46, 42, u), 3, 60, 0) });
  segs.push({ t0: 2 * P, t1: 0, trans: "cut", dur: 0, pose: (u) => orbitPose(lerp(36, 24, u), lerp(1.7, 1.86, u), lerp(0.9, 1.5, u), 3.2, 40, 0) });
  C.events.forEach((e, i) => {
    const arrive = e.big ? e.L - e.fall : e.L - ARRIVE;
    const dur = e.trans === "cut" ? 0 : WHIP;
    segs[segs.length - 1].t1 = arrive - dur;
    const seg = { t0: arrive, t1: 0, trans: e.trans, dur, ev: e };
    const through = e.big && i < C.events.length - 1 && C.events[i + 1].trans === "cut";
    seg.pose = (u, t) => {
      const p = shotPose(e, u, t);
      if (!through) return p;
      // après un grand moment, on traverse le drapeau puis on coupe sur le plan suivant
      const v = clamp((t - (seg.t1 - 0.34)) / 0.34);
      if (v > 0) {
        const st = stacks[e.team];
        const w = v * v * v;
        const ty = e.top - C.block * 0.55;
        const len = Math.hypot(p.x - st.x, p.z - st.z) || 1;
        p.x = lerp(p.x, st.x + ((p.x - st.x) / len) * 2.05, w);
        p.z = lerp(p.z, st.z + ((p.z - st.z) / len) * 2.05, w);
        p.y = lerp(p.y, ty, w);
        p.ty = lerp(p.ty, ty, w);
        p.fov = lerp(p.fov, 58, w);
        p.roll = lerp(p.roll, 0, w);
      }
      return p;
    };
    segs.push(seg);
  });
  const endArr = C.tEnd - 0.1;
  segs[segs.length - 1].t1 = endArr - 0.62;
  const lastC = C.events[C.events.length - 1].counts;
  const lead = lastC.indexOf(Math.max(...lastC));
  const endBase = stacks[lead].angle + Math.PI;
  segs.push({ t0: endArr, t1: C.total, trans: "crane", dur: 0.62, pose: (u) => orbitPose(lerp(30, 27, u), endBase + lerp(-0.32, 0.22, u), lerp(48, 44, u), 7.5, 60, 0) });

  // ---------------------------------------------------------------- état au temps t
  function update(t, ctx) {
    const last = ctx.env.e;
    const lastIdx = last ? hits.indexOf(last) : -1;
    const counts = lastIdx >= 0 ? C.events[lastIdx].counts : C.teams.map(() => 0);
    const before = lastIdx > 0 ? C.events[lastIdx - 1].counts : C.teams.map(() => 0);
    stacks.forEach((s) => {
      let topNow = C.plinth;
      s.blocks.forEach((b, j) => {
        const e = s.landings[j];
        const rest = C.plinth + j * (C.block + C.plate) + C.block / 2;
        const st = e.L - e.fall;
        if (t < st) {
          b.visible = false;
          return;
        }
        b.visible = true;
        if (t >= e.L) {
          b.position.y = rest;
          b.rotation.y = 0;
          topNow = rest + C.block / 2 + C.plate;
        } else {
          const u = (t - st) / e.fall;
          const fallK = e.big ? bigFall(u) : Math.pow(u, 3);
          b.position.y = rest + (e.big ? 13 : 19) * (1 - fallK);
          b.rotation.y = (1 - u) * (1 - u) * (e.big ? 1.6 : 2.4);
        }
      });
      let sq = 0;
      const landed = s.landings.filter((e) => t >= e.L);
      if (landed.length) {
        const e = landed[landed.length - 1];
        const tau = t - e.L;
        sq = (e.big ? 0.3 : 0.2) * Math.exp(-tau * 7) * Math.cos(tau * 26);
      }
      s.group.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
      s.kit.setHeight(topNow);
      const max = Math.max(...counts);
      const isLead = max > 0 && counts[s.index] === max ? 1 : 0;
      const mb = Math.max(...before);
      const wasLead = mb > 0 && before[s.index] === mb ? 1 : 0;
      s.kit.setLead(lerp(wasLead, isLead, clamp((last ? t - last.t : 99) / 0.22)));
    });
    trophy.rotation.y = t * 0.34;
  }
  function minSamples(t) {
    for (const e of C.events) if (!e.big && t >= e.L - e.fall && t < e.L) return 5;
    return 1;
  }
  return { hits, segs, update, minSamples };
}
