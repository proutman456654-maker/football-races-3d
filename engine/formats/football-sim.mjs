// Foot de billes, vu de dessus, calculé au build : deux billes poursuivent un ballon dans l'arène, un but de chaque côté.
// L'équipe 0 attaque le but est (angle 0), l'équipe 1 le but ouest (angle pi). Le terrain est symétrique : aucun camp n'est avantagé.
export const PITCH = { R: 5.0, r: 0.6, rb: 0.42, goalHalf: 0.46, postR: 0.11, bumperR: 0.5, bumperRad: 3.0, bumperAng: [Math.PI / 2, (3 * Math.PI) / 2], floorY: 1.2, netDepth: 1.0 };

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
function hash(i, seed) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
}

export function simulateFootball(seed, T = 12, HZ = 120, tune = {}) {
  const A = PITCH;
  const K = tune.k ?? 11;
  const VMAX = tune.vmax ?? 7;
  const GH = tune.goalHalf ?? A.goalHalf;
  const r = rng(seed * 7919 + 101);
  const mk = (x, z, dir) => ({ x, z, vx: 0, vz: 0, dir, q: [0, 0, 0, 1], m: 1, rad: A.r, n1: Math.floor(r() * 1e6), n2: Math.floor(r() * 1e6) });
  const p = [mk(-2.3, (r() - 0.5) * 1.2, 1), mk(2.3, (r() - 0.5) * 1.2, -1)];
  const ball = { x: 0, z: 0, vx: (r() - 0.5) * 1.5, vz: (r() - 0.5) * 3, m: 0.45, rad: A.rb, q: [0, 0, 0, 1], y: A.floorY + A.rb, out: false, outUntil: 0, frozen: null };
  const DT = 1 / 960;
  const steps = Math.round(T / DT);
  const every = Math.round(1 / (HZ * DT));
  const frames = [];
  const events = [];
  const score = [0, 0];
  const posts = [];
  [0, Math.PI].forEach((ga) => [-1, 1].forEach((s) => posts.push({ x: Math.cos(ga + s * GH) * A.R, z: Math.sin(ga + s * GH) * A.R })));
  const bumpers = A.bumperAng.map((a) => ({ x: Math.cos(a) * A.bumperRad, z: Math.sin(a) * A.bumperRad }));
  const roll = (b, dt) => {
    const v = Math.hypot(b.vx, b.vz);
    if (v < 1e-6) return;
    const ax = b.vz / v;
    const az = -b.vx / v;
    const ang = (v * dt) / b.rad;
    const s2 = Math.sin(ang / 2);
    const [x1, y1, z1, w1] = [ax * s2, 0, az * s2, Math.cos(ang / 2)];
    const [x2, y2, z2, w2] = b.q;
    const q = [w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2];
    const n = Math.hypot(...q);
    b.q = q.map((c) => c / n);
  };
  const push = () => frames.push([p[0].x, A.floorY + A.r, p[0].z, ...p[0].q, p[1].x, A.floorY + A.r, p[1].z, ...p[1].q, ball.x, ball.y, ball.z, ...ball.q]);
  const collide = (a, b, e, kind, tau) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    const md = a.rad + b.rad;
    if (d >= md || d < 1e-6) return;
    const nx = dx / d;
    const nz = dz / d;
    const inv = 1 / a.m + 1 / b.m;
    const over = md - d;
    a.x -= (nx * over) / a.m / inv;
    a.z -= (nz * over) / a.m / inv;
    b.x += (nx * over) / b.m / inv;
    b.z += (nz * over) / b.m / inv;
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0) {
      const j = (-(1 + e) * rv) / inv;
      a.vx -= (j * nx) / a.m;
      a.vz -= (j * nz) / a.m;
      b.vx += (j * nx) / b.m;
      b.vz += (j * nz) / b.m;
      if (-rv > 2.2) events.push({ t: tau, kind, s: Math.min(1, -rv / 12) });
    }
  };
  const bounceStatic = (b, sx, sz, sr, e, kind, tau) => {
    const dx = b.x - sx;
    const dz = b.z - sz;
    const d = Math.hypot(dx, dz);
    const md = b.rad + sr;
    if (d >= md || d < 1e-6) return;
    const nx = dx / d;
    const nz = dz / d;
    b.x = sx + nx * md;
    b.z = sz + nz * md;
    const vn = b.vx * nx + b.vz * nz;
    if (vn < 0) {
      b.vx -= (1 + e) * vn * nx;
      b.vz -= (1 + e) * vn * nz;
      if (-vn > 2.5) events.push({ t: tau, kind, s: Math.min(1, -vn / 10) });
    }
  };
  push();
  for (let s = 1; s <= steps; s++) {
    const tau = s * DT;
    // les billes cherchent à se placer derrière le ballon, puis poussent vers le but adverse
    for (const m of p) {
      const gx = m.dir * A.R;
      let tx;
      let tz;
      const live = !ball.out;
      const bx = live ? ball.x : 0;
      const bz = live ? ball.z : 0;
      let dx = gx - bx;
      let dz = -bz;
      const dd = Math.hypot(dx, dz) || 1;
      dx /= dd;
      dz /= dd;
      const behind = (m.x - bx) * dx + (m.z - bz) * dz < -0.25;
      if (!live) {
        tx = -m.dir * 1.6;
        tz = m.z * 0.6;
      } else if (behind) {
        tx = bx + dx * 0.4;
        tz = bz + dz * 0.4;
      } else {
        // contourner le ballon par le côté le plus proche
        const side = (m.x - bx) * -dz + (m.z - bz) * dx >= 0 ? 1 : -1;
        tx = bx - dx * (A.rb + A.r + 0.35) - dz * side * 0.9;
        tz = bz - dz * (A.rb + A.r + 0.35) + dx * side * 0.9;
      }
      let ax = tx - m.x;
      let az = tz - m.z;
      const al = Math.hypot(ax, az) || 1;
      const wander = 0.55;
      const na = (noise(tau * 1.3, m.n1) - 0.5) * 2 * Math.PI;
      ax = (ax / al) * K + Math.cos(na) * K * wander * noise(tau * 0.7, m.n2);
      az = (az / al) * K + Math.sin(na) * K * wander * noise(tau * 0.7, m.n2);
      m.vx += ax * DT;
      m.vz += az * DT;
      const dmp = Math.exp(-0.9 * DT);
      m.vx *= dmp;
      m.vz *= dmp;
      const v = Math.hypot(m.vx, m.vz);
      if (v > VMAX) {
        m.vx *= VMAX / v;
        m.vz *= VMAX / v;
      }
      m.x += m.vx * DT;
      m.z += m.vz * DT;
    }
    if (!ball.out) {
      const dmp = Math.exp(-0.32 * DT);
      ball.vx *= dmp;
      ball.vz *= dmp;
      ball.x += ball.vx * DT;
      ball.z += ball.vz * DT;
    } else if (tau >= ball.outUntil) {
      // remise en jeu : le ballon retombe au centre
      ball.out = false;
      ball.x = 0;
      ball.z = (r() - 0.5) * 0.6;
      ball.vx = (r() - 0.5) * 1.2;
      ball.vz = (r() < 0.5 ? -1 : 1) * (1 + r() * 1.5);
      ball.y = A.floorY + A.rb;
      events.push({ t: tau, kind: "kickoff", s: 0.5 });
    }
    collide(p[0], p[1], 0.7, "clack", tau);
    if (!ball.out) {
      collide(p[0], ball, 0.88, "kick", tau);
      collide(p[1], ball, 0.88, "kick", tau);
    }
    for (const b of ball.out ? p : [...p, ball]) {
      bumpers.forEach((bp) => bounceStatic(b, bp.x, bp.z, A.bumperR, b === ball ? 0.95 : 0.6, "bump", tau));
      posts.forEach((pp) => bounceStatic(b, pp.x, pp.z, A.postR, 0.8, b === ball ? "post" : "postm", tau));
      const rad = Math.hypot(b.x, b.z);
      if (rad > A.R - b.rad) {
        const ang = Math.atan2(b.z, b.x);
        const inMouth = Math.min(Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))), Math.abs(Math.atan2(Math.sin(ang - Math.PI), Math.cos(ang - Math.PI)))) < GH - 0.05;
        if (b === ball && inMouth) {
          if (rad > A.R + A.rb * 0.6) {
            // but : l'équipe qui attaque ce côté marque, que le ballon ait été poussé par elle ou non
            const east = Math.cos(ang) > 0;
            const team = east ? 0 : 1;
            score[team] += 1;
            events.push({ t: tau, kind: "goal", team, s: 1 });
            ball.out = true;
            ball.outUntil = tau + 0.75;
            const gx = (east ? 1 : -1) * (A.R + A.netDepth * 0.65);
            ball.frozen = { x: gx, z: b.z };
            ball.vx = 0;
            ball.vz = 0;
            ball.x = gx;
          }
        } else {
          const nx = b.x / rad;
          const nz = b.z / rad;
          b.x = nx * (A.R - b.rad);
          b.z = nz * (A.R - b.rad);
          const vn = b.vx * nx + b.vz * nz;
          if (vn > 0) {
            const e = b === ball ? 0.85 : 0.55;
            b.vx -= (1 + e) * vn * nx;
            b.vz -= (1 + e) * vn * nz;
            if (b === ball && vn > 3) events.push({ t: tau, kind: "wall", s: Math.min(1, vn / 10) });
          }
        }
      }
    }
    p.forEach((m) => roll(m, DT));
    if (!ball.out) roll(ball, DT);
    if (s % every === 0) push();
  }
  return { frames, events, score, hz: HZ, T };
}
