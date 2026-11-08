// Format « La Ligue des Billes » : l'arène devient un terrain, deux billes et un ballon, un but à chaque bout.
import { THREE, clamp, lerp, smooth, orbitPose } from "./stadium.js";
import { SIM_B64 } from "./sim-data.js";

export async function setup(S, C) {
  const { scene, goldMat, darkMetal } = S;
  const A = C.pitch;
  const FY = A.floorY;
  const teams = Object.fromEntries(C.teams.map((t) => [t.id, t]));
  const ids = C.order;
  const NF = 21;

  // ---------------------------------------------------------------- trajectoires calculées au build
  const bin = atob(SIM_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const all = new Float32Array(bytes.buffer);
  let off = 0;
  C.matches.forEach((mt) => {
    mt.offset = off;
    off += mt.nFrames * NF;
  });
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  function simPose(mt, body, s, outPos, outQ) {
    const f = clamp(s * mt.hz, 0, mt.nFrames - 1.001);
    const i = Math.floor(f);
    const u = f - i;
    const o0 = mt.offset + i * NF + body * 7;
    const o1 = o0 + NF;
    outPos.set(lerp(all[o0], all[o1], u), lerp(all[o0 + 1], all[o1 + 1], u), lerp(all[o0 + 2], all[o1 + 2], u));
    qa.set(all[o0 + 3], all[o0 + 4], all[o0 + 5], all[o0 + 6]);
    qb.set(all[o1 + 3], all[o1 + 4], all[o1 + 5], all[o1 + 6]);
    outQ.copy(qa).slerp(qb, u);
  }

  // ---------------------------------------------------------------- terrain rond
  const arena = new THREE.Group();
  scene.add(arena);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(A.R + 0.9, A.R + 1.3, FY, 72), darkMetal);
  plat.position.y = FY / 2;
  arena.add(plat);
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uR: { value: A.R }, uGH: { value: A.goalHalf }, uFlash: S.U.uFlash },
    vertexShader: `varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `precision highp float; uniform float uR; uniform float uGH; uniform float uFlash; varying vec2 vP;
      float ln(float d,float w,float a){ return 1.-smoothstep(w-a,w+a,abs(d)); }
      void main(){
        vec2 p=vec2(vP.x,-vP.y); float r=length(p);
        float a=max(fwidth(p.x),fwidth(p.y))+.012;
        float st=mod(floor((p.x+20.)/1.25),2.);
        vec3 c=mix(vec3(.05,.24,.08),vec3(.035,.18,.06),st);
        c*=mix(1.05,.8,smoothstep(0.,uR,r));
        float l=0.;
        l=max(l,ln(p.x,.035,a)*step(r,uR));
        l=max(l,ln(r-1.25,.035,a));
        l=max(l,ln(r-uR+.06,.04,a));
        float box=max(abs(abs(p.x)-(uR-1.2)),0.);
        l=max(l,ln(abs(p.x)-(uR-1.3),.035,a)*step(abs(p.y),1.7)*step(r,uR));
        l=max(l,ln(abs(p.y)-1.7,.035,a)*step(uR-1.3,abs(p.x))*step(r,uR));
        c=mix(c,vec3(.86,.9,.86),l*.9);
        c+=vec3(1.,.9,.6)*uFlash*.05;
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
  // mur, ouvert devant chaque but
  const NW = 72;
  const wallGeo = new THREE.BoxGeometry(((2 * Math.PI * (A.R + 0.2)) / NW) * 0.86, 0.55, 0.3);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.32, metalness: 0.1, emissive: 0xffd27a, emissiveIntensity: 0.05 });
  for (let k = 0; k < NW; k++) {
    const a = ((k + 0.5) / NW) * Math.PI * 2;
    const inMouth = Math.min(Math.abs(Math.atan2(Math.sin(a), Math.cos(a))), Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI)))) < A.goalHalf + 0.02;
    if (inMouth) continue;
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.position.set(Math.cos(a) * (A.R + 0.2), FY + 0.275, Math.sin(a) * (A.R + 0.2));
    w.rotation.y = -a + Math.PI / 2;
    arena.add(w);
  }
  // buts : poteaux, barre et filet
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.12 });
  const netTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(255,255,255,.85)";
    g.lineWidth = 3;
    for (let i = 0; i <= 256; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(256, i);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 2);
    return t;
  })();
  const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const nets = [];
  [0, Math.PI].forEach((ga) => {
    const g = new THREE.Group();
    const half = Math.sin(A.goalHalf) * A.R;
    const H = 1.05;
    [-1, 1].forEach((s) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(A.postR, A.postR, H, 16), postMat);
      p.position.set(A.R * Math.cos(A.goalHalf), H / 2, s * half);
      g.add(p);
    });
    const cross = new THREE.Mesh(new THREE.CylinderGeometry(A.postR, A.postR, 2 * half + 0.1, 16), postMat);
    cross.rotation.x = Math.PI / 2;
    cross.position.set(A.R * Math.cos(A.goalHalf), H, 0);
    g.add(cross);
    const net = new THREE.Mesh(new THREE.BoxGeometry(A.netDepth, H, 2 * half), netMat);
    net.position.set(A.R * Math.cos(A.goalHalf) + A.netDepth / 2, H / 2, 0);
    g.add(net);
    g.position.y = FY;
    g.rotation.y = -ga;
    arena.add(g);
    nets.push({ g, net });
  });
  const bumpers = A.bumperAng.map((a) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(A.bumperR, A.bumperR * 1.08, 0.5, 40), darkMetal);
    body.position.y = 0.25;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(A.bumperR * 0.6, A.bumperR * 0.6, 0.08, 32), goldMat);
    cap.position.y = 0.52;
    g.add(body, cap);
    g.position.set(Math.cos(a) * A.bumperRad, FY, Math.sin(a) * A.bumperRad);
    arena.add(g);
    return g;
  });

  // ---------------------------------------------------------------- billes, ballon, râtelier
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
    marbles[id] = { mesh, rest };
  });
  // ballon : blanc à pentagones noirs, dessiné point par point sur la sphère
  const ballTex = (() => {
    const w = 512;
    const h = 256;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const img = g.createImageData(w, h);
    const t = (1 + Math.sqrt(5)) / 2;
    const verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => {
      const n = Math.hypot(...v);
      return v.map((x) => x / n);
    });
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const lon = (x / w) * Math.PI * 2;
        const lat = (y / h) * Math.PI;
        const d = [Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon)];
        let best = -1;
        for (const v of verts) best = Math.max(best, d[0] * v[0] + d[1] * v[1] + d[2] * v[2]);
        const black = best > 0.93;
        const i = (y * w + x) * 4;
        const k = black ? 24 : 238;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = k;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(A.rb, 40, 24), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.3, metalness: 0, emissive: 0xffffff, emissiveMap: ballTex, emissiveIntensity: 0.1 }));
  scene.add(ball);

  // ---------------------------------------------------------------- buts : impact, confettis aux couleurs du buteur
  const tmpP = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const hits = [];
  C.matches.forEach((mt) => {
    hits.push({ t: mt.S + C.intro, big: false, fall: 0, x: 0, y: FY, z: 0, color: "#ffd27a" });
    mt.goals.forEach((gl) => {
      const who = gl.team === 0 ? mt.h : mt.a;
      const x = (gl.team === 0 ? 1 : -1) * (A.R + 0.4);
      hits.push({ t: gl.t, big: false, fall: 0, x, y: FY + 0.6, z: 0, color: teams[who].color });
      S.burst({ t: gl.t, x, y: FY + 0.9, z: 0, big: false, colors: teams[who].confetti, seed: 4400 + Math.round(gl.t * 100) });
    });
  });
  if (C.next) {
    const [nh] = C.next;
    hits.push({ t: C.tNext + 0.1, big: true, fall: 0, x: 0, y: FY + 1.4, z: 0, color: teams[nh].color, tifoTex: flags[nh], tifoAngle: -Math.PI / 2 });
  }

  // ---------------------------------------------------------------- positions au temps t
  const up = (u) => 4 * u * (1 - u);
  function activeMatch(t) {
    for (const mt of C.matches) if (t >= mt.S && t < mt.end) return mt;
    return null;
  }
  function update(t) {
    const mt = activeMatch(t);
    ids.forEach((id) => {
      const mb = marbles[id];
      mb.mesh.position.copy(mb.rest);
      mb.mesh.quaternion.identity();
      mb.mesh.visible = true;
    });
    if (mt) {
      [mt.h, mt.a].forEach((id, k) => {
        const mb = marbles[id];
        const v = t - mt.S - C.intro;
        if (v < 0) {
          simPose(mt, k, 0, tmpP, tmpQ);
          const u = smooth(clamp((t - mt.S) / C.intro));
          mb.mesh.position.set(lerp(mb.rest.x, tmpP.x, u), lerp(mb.rest.y, tmpP.y, u) + up(u) * 3.2, lerp(mb.rest.z, tmpP.z, u));
        } else if (t > mt.end - 0.42) {
          simPose(mt, k, mt.end - 0.42 - mt.S - C.intro, tmpP, tmpQ);
          const u = smooth(clamp((t - (mt.end - 0.42)) / 0.42));
          mb.mesh.position.set(lerp(tmpP.x, mb.rest.x, u), lerp(tmpP.y, mb.rest.y, u) + up(u) * 3, lerp(tmpP.z, mb.rest.z, u));
          mb.mesh.quaternion.copy(tmpQ);
        } else {
          simPose(mt, k, v, tmpP, tmpQ);
          mb.mesh.position.copy(tmpP);
          mb.mesh.quaternion.copy(tmpQ);
        }
      });
      const v = t - mt.S - C.intro;
      simPose(mt, 2, Math.max(0, v), tmpP, tmpQ);
      ball.position.copy(tmpP);
      if (v < 0) ball.position.y += (1 - smooth(clamp((t - mt.S) / C.intro))) * 5;
      ball.quaternion.copy(tmpQ);
      ball.visible = t < mt.end - 0.3;
      // le filet se gonfle quand le ballon y entre
      nets.forEach((n, k) => {
        let bulge = 0;
        for (const gl of mt.goals) if ((gl.team === 0 ? 0 : 1) === k && t >= gl.t) bulge = Math.max(bulge, Math.exp(-(t - gl.t) * 4) * Math.sin(Math.min(Math.PI, (t - gl.t) * 9)));
        n.net.scale.x = 1 + bulge * 0.35;
      });
    } else {
      ball.visible = false;
      nets.forEach((n) => (n.net.scale.x = 1));
    }
    // l'affiche suivante : les deux billes face à face au centre
    if (C.next && t >= C.tNext - 0.5) {
      const u = smooth(clamp((t - (C.tNext - 0.5)) / 0.6));
      C.next.forEach((id, k) => {
        const mb = marbles[id];
        const target = new THREE.Vector3((k === 0 ? -1 : 1) * 1.05, FY + A.r + 0.5 + 0.12 * Math.sin(t * 2 + k), 0);
        mb.mesh.position.set(lerp(mb.rest.x, target.x, u), lerp(mb.rest.y, target.y, u) + up(u) * 3, lerp(mb.rest.z, target.z, u));
        mb.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (k === 0 ? -1 : 1) * 0.6 + t * 0.4);
        mb.mesh.scale.setScalar(1 + u * 0.35);
      });
    } else ids.forEach((id) => marbles[id].mesh.scale.setScalar(1));
  }

  // ---------------------------------------------------------------- plans : le terrain dans la longueur de l'écran
  const P = C.pulse;
  const look = (x, y, z, tx, ty, tz, fov, roll = 0) => ({ x, y, z, tx, ty, tz, fov, roll });
  const SH = [
    (u) => look(lerp(15.5, 14.5, u), 13.5, lerp(-1, 1, u), -0.8, FY - 1.4, 0, 56),
    (u) => look(lerp(-15.5, -14.5, u), 13.5, lerp(1, -1, u), 0.8, FY - 1.4, 0, 56),
    (u) => look(lerp(12.5, 11.8, u), 18, lerp(6, 4, u), -0.4, FY - 1.2, 0, 52),
  ];
  const segs = [];
  segs.push({ t0: 0, t1: P, trans: "cut", dur: 0, pose: (u) => orbitPose(lerp(4, 3, u), lerp(0.4, 0.8, u), lerp(30, 28, u), FY, 62) });
  segs.push({ t0: P, t1: 2 * P, trans: "cut", dur: 0, pose: (u) => ({ ...orbitPose(lerp(15.5, 14.5, u), lerp(-1.05, -0.7, u), lerp(1.5, 1.9, u), 0.9, 44) }) });
  segs.push({ t0: 2 * P, t1: 0, trans: "cut", dur: 0, pose: (u) => look(lerp(24, 15.5, smooth(u)), lerp(8, 13.5, smooth(u)), 0, -0.8, FY - 1.4, 0, 56) });
  C.matches.forEach((mt, k) => {
    segs[segs.length - 1].t1 = mt.S;
    const sh = SH[k % SH.length];
    segs.push({ t0: mt.S, t1: 0, trans: "cut", dur: 0, pose: (u) => sh(u) });
  });
  segs[segs.length - 1].t1 = C.tTable;
  // classement : la caméra survole lentement le stade derrière le tableau
  segs.push({ t0: C.tTable, t1: C.tNext - 0.62, trans: "cut", dur: 0, pose: (u) => orbitPose(lerp(40, 36, u), lerp(0.9, 1.6, u), lerp(34, 30, u), 6, 54) });
  segs.push({ t0: C.tNext, t1: C.total, trans: "crane", dur: 0.62, craneH: 12, pose: (u) => look(Math.cos(Math.PI / 2 + lerp(-0.25, 0.25, u)) * lerp(8, 7, u), lerp(2.6, 3, u), Math.sin(Math.PI / 2 + lerp(-0.25, 0.25, u)) * lerp(8, 7, u), 0, FY + 0.9, 0, 46) });
  function minSamples(t) {
    const mt = activeMatch(t);
    return mt && t > mt.S + C.intro ? 3 : 1;
  }
  return { hits, segs, update, minSamples };
}
