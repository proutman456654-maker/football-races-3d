// Format « Le Top qui monte » : 10 maillots géants suspendus en spirale, chacun se retourne pour montrer nom et total.
import { THREE, DEG, clamp, lerp, smooth, bigFall, orbitPose } from "./stadium.js";

export async function setup(S, C) {
  const { scene, darkMetal } = S;
  const items = C.items;
  const N = items.length;
  const RAD = 15;
  const JW = 6.4;
  const JH = 7.0;
  try {
    await document.fonts.load('200px "League Gothic"');
  } catch (e) {
    /* police de secours */
  }
  const FONT = '"League Gothic", "Oswald", sans-serif';

  // ---------------------------------------------------------------- maillot dessiné : silhouette, couleurs du club, pas d'écusson
  function jerseyPath(g, w, h) {
    const X = (v) => (v / 1024) * w;
    const Y = (v) => (v / 1100) * h;
    g.beginPath();
    g.moveTo(X(420), Y(58));
    g.quadraticCurveTo(X(512), Y(150), X(604), Y(58));
    g.lineTo(X(776), Y(104));
    g.lineTo(X(988), Y(318));
    g.lineTo(X(876), Y(440));
    g.lineTo(X(770), Y(352));
    g.lineTo(X(778), Y(1062));
    g.quadraticCurveTo(X(512), Y(1086), X(246), Y(1062));
    g.lineTo(X(254), Y(352));
    g.lineTo(X(148), Y(440));
    g.lineTo(X(36), Y(318));
    g.lineTo(X(248), Y(104));
    g.closePath();
  }
  function jerseyTexture(back, it) {
    const w = 1024;
    const h = 1100;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const [c0, c1, c2] = C.club.colors;
    g.save();
    jerseyPath(g, w, h);
    g.clip();
    g.fillStyle = c0;
    g.fillRect(0, 0, w, h);
    if (C.club.pattern === "band") {
      g.fillStyle = "#dcdcd8";
      g.fillRect(512 - 158, 0, 316, h);
      g.fillStyle = c1;
      g.fillRect(512 - 124, 0, 248, h);
    } else if (C.club.pattern === "stripes") {
      g.fillStyle = c1;
      for (let i = 0; i < 8; i += 2) g.fillRect(i * 128 + 64, 0, 64, h);
    }
    // ombres de tissu, plis doux
    const sh = g.createLinearGradient(0, 0, w, 0);
    sh.addColorStop(0, "rgba(0,0,0,.35)");
    sh.addColorStop(0.25, "rgba(0,0,0,0)");
    sh.addColorStop(0.75, "rgba(0,0,0,0)");
    sh.addColorStop(1, "rgba(0,0,0,.35)");
    g.fillStyle = sh;
    g.fillRect(0, 0, w, h);
    g.restore();
    // col et poignets
    g.lineWidth = 16;
    g.strokeStyle = c2 || "#fff";
    g.beginPath();
    g.moveTo(420, 58);
    g.quadraticCurveTo(512, 150, 604, 58);
    g.stroke();
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    if (back) {
      const name = it.name;
      let fs = 150;
      g.font = `${fs}px ${FONT}`;
      while (g.measureText(name).width > 600 && fs > 70) {
        fs -= 6;
        g.font = `${fs}px ${FONT}`;
      }
      g.lineWidth = 10;
      g.strokeStyle = "rgba(5,10,25,.9)";
      g.strokeText(name, 512, 300);
      g.fillStyle = "#ececec";
      g.fillText(name, 512, 300);
      const num = String(it.value);
      let ns = 520;
      g.font = `${ns}px ${FONT}`;
      while (g.measureText(num).width > 560 && ns > 260) {
        ns -= 10;
        g.font = `${ns}px ${FONT}`;
      }
      g.lineWidth = 22;
      g.strokeStyle = C.club.colors[0];
      g.strokeText(num, 512, 820);
      g.fillStyle = it.big ? "#f2c23a" : "#ececec";
      g.fillText(num, 512, 820);
      g.font = `86px ${FONT}`;
      g.lineWidth = 8;
      g.strokeText(C.unit, 512, 930);
      g.fillStyle = "#ffffff";
      g.fillText(C.unit, 512, 930);
    } else {
      g.font = `420px ${FONT}`;
      g.lineWidth = 20;
      g.strokeStyle = "rgba(5,10,25,.85)";
      g.strokeText(String(it.rank), 512, 760);
      g.fillStyle = it.big ? "#ffd24a" : "#ffffff";
      g.fillText(String(it.rank), 512, 760);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  const geo = new THREE.PlaneGeometry(JW, JH, 1, 1);
  const rodGeo = new THREE.CylinderGeometry(0.07, 0.07, 4.6, 10);
  rodGeo.rotateZ(Math.PI / 2);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x2a3140 });
  const jerseys = items.map((it, i) => {
    const a = -Math.PI / 2 + i * 0.64;
    const scale = it.big ? 1.25 : 1;
    const y = 6 + i * 3.6 + (it.big ? 1.5 : 0);
    const x = Math.cos(a) * RAD;
    const z = Math.sin(a) * RAD;
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    grp.scale.setScalar(scale);
    const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: jerseyTexture(false, it), alphaTest: 0.5, roughness: 0.75, metalness: 0, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0, envMapIntensity: 0.18 }));
    front.material.emissiveMap = front.material.map;
    front.material.emissiveIntensity = 0.1;
    const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: jerseyTexture(true, it), alphaTest: 0.5, roughness: 0.75, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.1, envMapIntensity: 0.18 }));
    back.material.emissiveMap = back.material.map;
    back.rotation.y = Math.PI;
    back.position.z = -0.03;
    const rod = new THREE.Mesh(rodGeo, darkMetal);
    rod.position.y = JH / 2 - 0.25;
    grp.add(front, back, rod);
    scene.add(grp);
    const wires = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x - 2.2, y + JH * scale * 0.45, z), new THREE.Vector3(x - 2.2, 80, z), new THREE.Vector3(x + 2.2, y + JH * scale * 0.45, z), new THREE.Vector3(x + 2.2, 80, z)]);
    scene.add(new THREE.LineSegments(wires, wireMat));
    return { it, i, a, x, y, z, grp, scale, facing: Math.PI / 2 - a };
  });

  // ---------------------------------------------------------------- impacts, confettis, tifo aux couleurs du club
  const tifoTex = (() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 768;
    const g = c.getContext("2d");
    const [c0, c1, c2] = C.club.colors;
    g.fillStyle = c0;
    g.fillRect(0, 0, 1024, 768);
    g.fillStyle = c2 || "#fff";
    g.fillRect(512 - 170, 0, 340, 768);
    g.fillStyle = c1;
    g.fillRect(512 - 132, 0, 264, 768);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const hits = jerseys.map((j) => ({ t: j.it.reveal, big: j.it.big, fall: j.it.fall, x: j.x, y: j.y, z: j.z, color: j.it.big ? "#ffc83d" : C.club.colors[1], tifoTex: j.it.big ? tifoTex : null, tifoAngle: j.a + Math.PI }));
  jerseys.forEach((j) => S.burst({ t: j.it.reveal, x: j.x, y: j.y + 1, z: j.z, big: j.it.big, colors: [C.club.colors[0], C.club.colors[1], C.club.colors[2] || "#ffffff", "#ffc83d"], rainAngle: j.a, rainR: RAD, rainY: j.y + 6, seed: 900 + j.it.rank }));

  // ---------------------------------------------------------------- plans : on reste face au maillot, à sa hauteur
  const jc = (j) => ({ x: j.x, y: j.y + 0.2, z: j.z });
  function around(j, D, dth, dy, fov, f, roll = 0) {
    const a = j.a + dth;
    const c = jc(j);
    const ty = c.y - (0.5 - f) * 2 * D * Math.tan(fov * 0.5 * DEG);
    return { x: c.x + Math.cos(a) * D, y: c.y + dy, z: c.z + Math.sin(a) * D, tx: c.x, ty, tz: c.z, fov, roll };
  }
  const SH = {
    front: (j, u) => around(j, lerp(21, 18.5, u), lerp(-0.12, 0.06, u), 0.8, 40, 0.52),
    low: (j, u) => around(j, lerp(19, 17, u), lerp(0.1, -0.04, u), -5.5, 44, 0.52),
    side: (j, u) => around(j, lerp(20, 18, u), lerp(0.42, 0.26, u), 1.2, 40, 0.52, -2),
    close: (j, u) => around(j, lerp(17.5, 16, u), lerp(-0.05, 0.05, u), 0.4, 42, 0.53),
    wide: (j, u) => around(j, lerp(28, 25, u), lerp(-0.3, -0.12, u), 3, 36, 0.52),
    dutch: (j, u) => around(j, lerp(20, 18.5, u), lerp(0.18, 0.3, u), 1.5, 40, 0.52, lerp(8, 5, u)),
    bigFront: (j, u) => around(j, lerp(30, 22, smooth(u)), lerp(-0.35, 0.1, smooth(u)), lerp(-4, 1, u), 40, 0.52, lerp(-3, 1, u)),
  };
  const P = C.pulse;
  const WHIP = 0.42;
  const segs = [];
  const topY = jerseys[N - 1].y;
  segs.push({ t0: 0, t1: P, trans: "cut", dur: 0, pose: (u) => orbitPose(lerp(52, 46, u), lerp(1.2, 1.45, u), lerp(14, 18, u), topY * 0.55, 58, 0) });
  segs.push({ t0: P, t1: 2 * P, trans: "cut", dur: 0, pose: (u) => SH.front(jerseys[N - 1], u) });
  segs.push({ t0: 2 * P, t1: 0, trans: "cut", dur: 0, pose: (u) => orbitPose(lerp(34, 26, u), lerp(-1.1, -1.35, u), lerp(30, 9, smooth(u)), lerp(24, 6, smooth(u)), 46, 0) });
  jerseys.forEach((j) => {
    const it = j.it;
    const arrive = it.L - 0.1;
    const dur = it.trans === "cut" ? 0 : WHIP;
    segs[segs.length - 1].t1 = arrive - dur;
    segs.push({ t0: arrive, t1: 0, trans: it.trans, dur, craneH: 6, pose: (u) => SH[it.shot](j, u) });
  });
  const endArr = C.tEnd - 0.1;
  segs[segs.length - 1].t1 = endArr - 0.62;
  const lastJ = jerseys[N - 1];
  segs.push({ t0: endArr, t1: C.total, trans: "crane", dur: 0.62, craneH: 10, pose: (u) => orbitPose(lerp(54, 46, u), lastJ.a + lerp(0.15, 0.55, u), lerp(30, 26, u), topY * 0.6, 56, 0) });

  // ---------------------------------------------------------------- état au temps t
  function flipAt(it, t) {
    const R = it.reveal;
    if (it.big) {
      // le n°1 tourne déjà doucement pendant l'attente, puis se retourne d'un coup
      if (t < R - it.fall) return 0;
      if (t < R - 0.3) return 0.12 * smooth((t - (R - it.fall)) / (it.fall - 0.3));
      if (t < R) return 0.12 + 0.88 * Math.pow((t - (R - 0.3)) / 0.3, 2.2);
    } else {
      if (t < R - 0.32) return 0;
      if (t < R) return Math.pow((t - (R - 0.32)) / 0.32, 2.2);
    }
    const tau = t - R;
    return 1 + 0.06 * Math.exp(-tau * 6) * Math.sin(tau * 18);
  }
  function update(t) {
    jerseys.forEach((j) => {
      const f = flipAt(j.it, t);
      const sway = 0.035 * Math.sin(t * 0.8 + j.i * 1.7);
      j.grp.rotation.set(0.02 * Math.sin(t * 0.6 + j.i), j.facing + f * Math.PI + sway, 0.015 * Math.sin(t * 0.9 + j.i * 2.3));
      // pendant l'attente du n°1, il descend légèrement vers la caméra
      j.grp.position.y = j.y + 0.12 * Math.sin(t * 0.7 + j.i);
    });
  }
  function minSamples(t) {
    for (const it of items) if (t >= it.reveal - 0.34 && t < it.reveal + 0.1) return 6;
    return 1;
  }
  function prepAim(prep) {
    return { x: prep.x, y: prep.y, z: prep.z };
  }
  return { hits, segs, update, minSamples, prepAim };
}
