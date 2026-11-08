// Format « Le Tournoi de billes » : une arène au centre du stade, 16 billes-drapeaux, la physique calculée au build.
import { THREE, clamp, lerp, smooth, orbitPose } from "./stadium.js";
import { SIM_B64 } from "./sim-data.js";

export async function setup(S, C) {
  const { scene, goldMat, darkMetal } = S;
  const A = C.arena;
  const FY = A.floorY;
  const teams = Object.fromEntries(C.teams.map((t) => [t.id, t]));
  const ids = C.order;

  // ---------------------------------------------------------------- trajectoires
  const bin = atob(SIM_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const all = new Float32Array(bytes.buffer);
  let off = 0;
  C.matches.forEach((mt) => {
    mt.offset = off;
    off += mt.nFrames * 14;
  });
  const simT = (mt, v) => {
    // temps vidéo dans le match -> temps de la physique (ralenti de la finale)
    const sl = mt.slow;
    if (!sl) return v;
    const va = sl.a;
    const vb = sl.a + (sl.b - sl.a) / sl.k;
    if (v <= va) return v;
    if (v <= vb) return sl.a + (v - va) * sl.k;
    return sl.b + (v - vb);
  };
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  function simPose(mt, ball, s, outPos, outQ) {
    const f = clamp(s * mt.hz, 0, mt.nFrames - 1.001);
    const i = Math.floor(f);
    const u = f - i;
    const o0 = mt.offset + i * 14 + ball * 7;
    const o1 = o0 + 14;
    outPos.set(lerp(all[o0], all[o1], u), lerp(all[o0 + 1], all[o1 + 1], u), lerp(all[o0 + 2], all[o1 + 2], u));
    qa.set(all[o0 + 3], all[o0 + 4], all[o0 + 5], all[o0 + 6]);
    qb.set(all[o1 + 3], all[o1 + 4], all[o1 + 5], all[o1 + 6]);
    outQ.copy(qa).slerp(qb, u);
  }

  // ---------------------------------------------------------------- arène
  const arena = new THREE.Group();
  scene.add(arena);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(A.R + 0.9, A.R + 1.3, FY, 72), darkMetal);
  plat.position.y = FY / 2;
  arena.add(plat);
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uTime: S.U.uTime, uFlash: S.U.uFlash, uR: { value: A.R } },
    vertexShader: `varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `precision highp float; uniform float uTime; uniform float uFlash; uniform float uR; varying vec2 vP;
      void main(){
        float r=length(vP); float a=atan(vP.y,vP.x);
        float aa=fwidth(r)*1.2;
        vec3 c=mix(vec3(.035,.05,.09),vec3(.012,.018,.035),smoothstep(0.,uR,r));
        float rings=0.;
        for(int i=1;i<5;i++){ float rr=float(i)*uR/4.6; rings=max(rings,1.-smoothstep(.02,.02+aa,abs(r-rr))); }
        float spokes=(1.-smoothstep(.015,.015+aa*.25,abs(sin(a*6.))*r*.06))*step(.9,r);
        c+=vec3(.9,.72,.3)*(rings*.22+spokes*.08);
        c+=vec3(1.,.8,.4)*exp(-r*r*.5)*.18;
        c+=vec3(1.,.85,.5)*uFlash*.08;
        gl_FragColor=vec4(c,1.);
      }`,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(A.R + 0.9, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FY + 0.005;
  arena.add(floor);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(A.R + 0.9, 0.09, 10, 120), goldMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = FY;
  arena.add(rim);
  // mur en 72 plots : ceux qui sont dans la brèche s'enfoncent
  const NW = 72;
  const wallGeo = new THREE.BoxGeometry(((2 * Math.PI * (A.R + 0.2)) / NW) * 0.86, 0.55, 0.3);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.32, metalness: 0.1, emissive: 0xffd27a, emissiveIntensity: 0.05 });
  const walls = [];
  for (let k = 0; k < NW; k++) {
    const a = (k / NW) * Math.PI * 2;
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.position.set(Math.cos(a) * (A.R + 0.2), FY + 0.275, Math.sin(a) * (A.R + 0.2));
    w.rotation.y = -a + Math.PI / 2;
    arena.add(w);
    walls.push({ w, a });
  }
  // barre tournante et pivot
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2 * A.barLen + 2 * A.barW, 0.34, 2 * A.barW), goldMat);
  bar.position.y = FY + 0.2;
  arena.add(bar);
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.6, 32), darkMetal);
  pivot.position.y = FY + 0.3;
  arena.add(pivot);
  // bumpers avec un anneau lumineux qui s'allume au choc
  const bumpers = A.bumperAng.map((a) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(A.bumperR, A.bumperR * 1.08, 0.5, 40), darkMetal);
    body.position.y = 0.25;
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.25) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(A.bumperR * 0.82, 0.07, 8, 40), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.52;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(A.bumperR * 0.6, A.bumperR * 0.6, 0.08, 32), goldMat);
    cap.position.y = 0.52;
    g.add(body, ring, cap);
    g.position.set(Math.cos(a) * A.bumperRad, FY, Math.sin(a) * A.bumperRad);
    arena.add(g);
    return { g, ringMat };
  });

  // ---------------------------------------------------------------- billes et râtelier autour de l'arène
  const flags = Object.fromEntries(await Promise.all(C.teams.map(async (t) => [t.id, await S.loadFlag(t.flag)])));
  const sphere = new THREE.SphereGeometry(A.r, 48, 32);
  const marbles = {};
  const RACK = A.R + 3.4;
  ids.forEach((id, i) => {
    const mat = new THREE.MeshStandardMaterial({ map: flags[id], roughness: 0.16, metalness: 0.05, envMapIntensity: 0.95, emissive: 0xffffff, emissiveMap: flags[id], emissiveIntensity: 0.12 });
    const mesh = new THREE.Mesh(sphere, mat);
    scene.add(mesh);
    const a = -Math.PI / 2 + ((i + 0.5) / ids.length) * Math.PI * 2;
    const rest = new THREE.Vector3(Math.cos(a) * RACK, A.r, Math.sin(a) * RACK);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.12, 24), goldMat);
    ped.position.set(rest.x, 0.06, rest.z);
    scene.add(ped);
    marbles[id] = { mesh, rest, a, matches: C.matches.filter((mt) => mt.ballTeam.includes(id)) };
  });

  // ---------------------------------------------------------------- impacts, confettis, tifo du champion
  const tmpP = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const hits = [];
  C.matches.forEach((mt) => {
    hits.push({ t: mt.S + C.intro, big: false, fall: 0, x: 0, y: FY, z: 0, color: "#ffd27a" });
    const wb = mt.ballTeam.indexOf(mt.winner);
    simPose(mt, wb, simT(mt, mt.E - mt.S - C.intro), tmpP, tmpQ);
    const lb = 1 - wb;
    const lp = new THREE.Vector3();
    simPose(mt, lb, simT(mt, mt.E - mt.S - C.intro), lp, tmpQ);
    hits.push({ t: mt.E, big: mt.big, fall: mt.big ? 1.6 : 0, x: lp.x, y: FY + 0.4, z: lp.z, color: teams[mt.winner].color, tifoTex: mt.big ? flags[mt.winner] : null, tifoAngle: Math.atan2(-14, 0) });
    S.burst({ t: mt.E + 0.05, x: tmpP.x, y: tmpP.y + 0.4, z: tmpP.z, big: mt.big, colors: teams[mt.winner].confetti, rainAngle: Math.PI / 2, rainR: 6, rainY: 12, seed: 3100 + mt.S * 10 });
  });

  // ---------------------------------------------------------------- position d'une bille au temps t
  const up = (u) => 4 * u * (1 - u);
  function marbleState(id, t, outPos, outQ) {
    const mb = marbles[id];
    outQ.identity();
    outPos.copy(mb.rest);
    let scale = 1;
    for (const mt of mb.matches) {
      const ball = mt.ballTeam.indexOf(id);
      if (t < mt.S) break;
      const v = t - mt.S - C.intro;
      if (t < mt.S + C.intro) {
        // saut du râtelier vers l'arène
        simPose(mt, ball, 0, tmpP, tmpQ);
        const u = smooth(clamp((t - mt.S) / C.intro));
        outPos.set(lerp(outPos.x, tmpP.x, u), lerp(outPos.y, tmpP.y, u) + up(u) * 3.2, lerp(outPos.z, tmpP.z, u));
        outQ.copy(tmpQ);
        return 1;
      }
      const isLoser = mt.loser === id;
      if (t < mt.end || isLoser) {
        if (!isLoser && t >= mt.end - 0.42 && !(mt.big)) {
          // le vainqueur retourne à sa place pendant que les suivants entrent
          simPose(mt, ball, simT(mt, mt.end - 0.42 - mt.S - C.intro), tmpP, tmpQ);
          const u = smooth(clamp((t - (mt.end - 0.42)) / 0.42));
          outPos.set(lerp(tmpP.x, mb.rest.x, u), lerp(tmpP.y, mb.rest.y, u) + up(u) * 3, lerp(tmpP.z, mb.rest.z, u));
          outQ.copy(tmpQ);
          return 1;
        }
        simPose(mt, ball, simT(mt, v), outPos, outQ);
        if (isLoser) {
          // l'éliminée sort, tombe, puis disparaît
          scale = 1 - smooth(clamp((t - mt.E - 0.9) / 0.4));
          return scale;
        }
        return 1;
      }
      if (mt.big && mt.winner === id) {
        // le champion monte au-dessus de l'arène
        simPose(mt, ball, simT(mt, mt.end - mt.S - C.intro), tmpP, tmpQ);
        const u = smooth(clamp((t - mt.end) / 0.9));
        outPos.set(lerp(tmpP.x, 0, u), lerp(tmpP.y, FY + 3.4, u), lerp(tmpP.z, 0, u));
        outQ.copy(tmpQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (t - mt.end) * 1.4));
        return 1 + 0.6 * u;
      }
      outPos.copy(mb.rest);
    }
    return scale;
  }

  // ---------------------------------------------------------------- plans
  const P = C.pulse;
  const look = (r, a, h, ty = FY, fov = 58, roll = 0) => ({ x: Math.cos(a) * r, y: h, z: Math.sin(a) * r, tx: 0, ty, tz: 0, fov, roll });
  const SH = [
    (u) => look(lerp(17.5, 16.5, u), Math.PI / 2 + lerp(-0.08, 0.08, u), 17, FY - 1.2, 58),
    (u) => look(lerp(17.5, 16.5, u), lerp(0.25, 0.4, u), 17.5, FY - 1.2, 58),
    (u) => look(lerp(6, 5.6, u), Math.PI / 2 + lerp(0.6, 0.9, u), 23, FY - 0.6, 60),
    (u) => look(lerp(17, 16, u), Math.PI + lerp(0.9, 0.75, u), 17, FY - 1.2, 58),
  ];
  const segs = [];
  // accroche : l'arène et les 16 billes vues d'en haut dès la première image, puis la rangée de drapeaux au ras du sol
  segs.push({ t0: 0, t1: P, trans: "cut", dur: 0, pose: (u) => look(lerp(4, 3, u), lerp(0.4, 0.8, u), lerp(30, 28, u), FY, 62) });
  segs.push({ t0: P, t1: 2 * P, trans: "cut", dur: 0, pose: (u) => look(lerp(15.5, 14.5, u), lerp(-1.05, -0.7, u), lerp(1.5, 1.9, u), 0.9, 44) });
  segs.push({ t0: 2 * P, t1: 0, trans: "cut", dur: 0, pose: (u) => look(lerp(26, 18, smooth(u)), Math.PI / 2 + lerp(-0.5, 0, smooth(u)), lerp(9, 16.5, smooth(u)), FY - 1.2, 56) });
  C.matches.forEach((mt, k) => {
    segs[segs.length - 1].t1 = mt.S;
    if (mt.big) {
      // la finale : départ bas et dramatique, puis le plan large qui lit tout
      segs.push({ t0: mt.S, t1: 0, trans: "cut", dur: 0, pose: (u, t) => {
        const w = smooth(clamp((t - mt.S) / 1.6));
        const a = Math.PI / 2 + lerp(-0.7, 0.15, u);
        return look(lerp(11, 17, w), a, lerp(3.2, 17.5, w), lerp(FY + 0.6, FY - 1.2, w), lerp(48, 58, w), lerp(-4, 0, w));
      } });
      return;
    }
    const sh = SH[(k + (mt.round % 2)) % SH.length];
    segs.push({ t0: mt.S, t1: 0, trans: "cut", dur: 0, pose: (u) => sh(u) });
  });
  segs[segs.length - 1].t1 = C.tEnd;
  segs.push({ t0: C.tEnd, t1: C.total, trans: "cut", dur: 0, pose: (u) => look(lerp(10.5, 9, u), Math.PI / 2 + lerp(-0.5, 0.5, u), lerp(6.5, 7.2, u), FY + 2.6, 52) });

  // ---------------------------------------------------------------- état au temps t
  function activeMatch(t) {
    for (const mt of C.matches) if (t >= mt.S && t < mt.end) return mt;
    return null;
  }
  const angNorm = (a) => {
    a = a % (2 * Math.PI);
    return a < -Math.PI ? a + 2 * Math.PI : a > Math.PI ? a - 2 * Math.PI : a;
  };
  function update(t) {
    const mt = activeMatch(t);
    let center = 0;
    let half = 0;
    let barA = t * 0.6;
    if (mt) {
      const s = simT(mt, Math.max(0, t - mt.S - C.intro));
      const open = clamp((s - mt.m.openAt) / mt.m.openDur);
      center = mt.m.gap0 + mt.m.gapW * s;
      half = (mt.m.gapMin + (mt.m.gapMax - mt.m.gapMin) * open) / 2;
      barA = mt.m.bar0 + mt.m.barW * s;
    }
    walls.forEach(({ w, a }) => {
      const d = Math.abs(angNorm(a - center));
      const sink = half > 0.01 ? smooth(clamp((half - d) / 0.06 + 0.5)) : 0;
      w.scale.y = 1 - sink * 0.94;
      w.position.y = FY + 0.275 * (1 - sink * 0.94);
    });
    bar.rotation.y = -barA;
    bumpers.forEach((b, k) => {
      let fl = 0;
      if (mt)
        for (const [tb, kb] of mt.bumps) {
          if (kb !== k) continue;
          const tt = mt.S + C.intro + tb;
          if (t >= tt) fl = Math.max(fl, Math.exp(-(t - tt) / 0.14));
        }
      b.ringMat.color.setRGB(1 + fl * 5, 0.75 + fl * 3.6, 0.25 + fl * 1.8);
      b.g.scale.setScalar(1 + fl * 0.12);
    });
    ids.forEach((id) => {
      const sc = marbleState(id, t, tmpP, tmpQ);
      const mb = marbles[id];
      mb.mesh.position.copy(tmpP);
      mb.mesh.quaternion.copy(tmpQ);
      mb.mesh.visible = sc > 0.01;
      mb.mesh.scale.setScalar(Math.max(sc, 0.01));
    });
  }
  function minSamples(t) {
    const mt = activeMatch(t);
    if (mt && t > mt.S + C.intro) return 3;
    return 1;
  }
  function prepAim() {
    return { x: 0, y: FY, z: 0 };
  }
  return { hits, segs, update, minSamples, prepAim };
}
