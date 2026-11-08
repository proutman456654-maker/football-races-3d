// Physique des billes, vue de dessus, calculée une fois au moment du build (déterministe : même graine, même match).
// Arène ronde, barre tournante au centre, 3 bumpers qui relancent, une brèche qui s'ouvre et tourne dans le mur.
// La première bille qui sort par la brèche est éliminée.

export const ARENA = { R: 5.0, r: 0.6, barLen: 3.4, barW: 0.18, bumperR: 0.55, bumperRad: 3.05, bumperAng: [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6], floorY: 1.2 };

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
const angNorm = (a) => {
  a = a % (2 * Math.PI);
  return a < -Math.PI ? a + 2 * Math.PI : a > Math.PI ? a - 2 * Math.PI : a;
};

// Paramètres du mur : la brèche tourne et s'élargit avec le temps du match
export function gapAt(m, tau) {
  const open = Math.min(1, Math.max(0, (tau - m.openAt) / m.openDur));
  return { center: m.gap0 + m.gapW * tau, half: (m.gapMin + (m.gapMax - m.gapMin) * open) / 2, open };
}
export function barAngle(m, tau) {
  return m.bar0 + m.barW * tau;
}

// Simule un match. Renvoie les positions à HZ images par seconde de match, les chocs et le moment de l'élimination.
export function simulateMatch(seed, maxT, HZ = 120) {
  const A = ARENA;
  const r = rng(seed * 7919 + 13);
  const m = {
    seed,
    gap0: r() * Math.PI * 2,
    gapW: (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5),
    gapMin: 0.0,
    gapMax: 1.25 + r() * 0.35,
    openAt: 0.35,
    openDur: Math.max(1.2, maxT * 0.55),
    bar0: r() * Math.PI,
    barW: (r() < 0.5 ? -1 : 1) * (1.4 + r() * 0.8),
  };
  const balls = [0, 1].map((k) => {
    const a = r() * Math.PI * 2;
    const d = 2.2 + r() * 1.4;
    const sp = 6 + r() * 4;
    const va = a + Math.PI / 2 + (r() - 0.5) * 1.6;
    return { x: Math.cos(a + k * Math.PI) * d, z: Math.sin(a + k * Math.PI) * d, vx: Math.cos(va) * sp, vz: Math.sin(va) * sp, y: A.floorY + A.r, vy: 0, out: false, outT: null, q: [0, 0, 0, 1] };
  });
  const DT = 1 / 960;
  const steps = Math.round(maxT / DT);
  const every = Math.round(1 / (HZ * DT));
  const frames = [];
  const events = [];
  let elimT = null;
  let loser = null;
  const push = () => frames.push(balls.flatMap((b) => [b.x, b.y, b.z, ...b.q]));
  push();
  const bumpCool = [0, 0, 0];
  for (let s = 1; s <= steps; s++) {
    const tau = s * DT;
    const g = gapAt(m, tau);
    const ba = barAngle(m, tau);
    for (const b of balls) {
      if (b.out) {
        // la bille éliminée roule hors de l'arène puis tombe
        b.vy -= 9.81 * 1.6 * DT;
        b.x += b.vx * DT;
        b.z += b.vz * DT;
        b.y += b.vy * DT;
        if (Math.hypot(b.x, b.z) < A.R + 1.0 && b.y < A.floorY + A.r) b.y = A.floorY + A.r, (b.vy = 0);
        if (b.y < A.r) {
          b.y = A.r;
          b.vy = -b.vy * 0.35;
        }
        continue;
      }
      // frottement léger, plus une petite poussée pour que le match reste vivant
      const v = Math.hypot(b.vx, b.vz);
      const damp = Math.exp(-0.18 * DT);
      b.vx *= damp;
      b.vz *= damp;
      if (v < 3.2 && v > 1e-6) {
        b.vx *= 1 + 0.9 * DT;
        b.vz *= 1 + 0.9 * DT;
      }
      b.x += b.vx * DT;
      b.z += b.vz * DT;
      // barre tournante (capsule)
      const ux = Math.cos(ba);
      const uz = Math.sin(ba);
      const proj = Math.max(-A.barLen, Math.min(A.barLen, b.x * ux + b.z * uz));
      const cx = proj * ux;
      const cz = proj * uz;
      let dx = b.x - cx;
      let dz = b.z - cz;
      let d = Math.hypot(dx, dz);
      const minD = A.r + A.barW;
      if (d < minD && d > 1e-6) {
        const nx = dx / d;
        const nz = dz / d;
        b.x = cx + nx * minD;
        b.z = cz + nz * minD;
        // vitesse de la barre au point de contact (rotation autour du centre)
        const svx = -m.barW * cz;
        const svz = m.barW * cx;
        const rvx = b.vx - svx;
        const rvz = b.vz - svz;
        const vn = rvx * nx + rvz * nz;
        if (vn < 0) {
          b.vx -= 1.85 * vn * nx;
          b.vz -= 1.85 * vn * nz;
          if (-vn > 2.5) events.push({ t: tau, kind: "bar", s: Math.min(1, -vn / 10) });
        }
      }
      // bumpers : ils rendent plus d'énergie qu'ils n'en reçoivent
      A.bumperAng.forEach((a, k) => {
        const bx = Math.cos(a) * A.bumperRad;
        const bz = Math.sin(a) * A.bumperRad;
        dx = b.x - bx;
        dz = b.z - bz;
        d = Math.hypot(dx, dz);
        const md = A.r + A.bumperR;
        if (d < md && d > 1e-6) {
          const nx = dx / d;
          const nz = dz / d;
          b.x = bx + nx * md;
          b.z = bz + nz * md;
          const vn = b.vx * nx + b.vz * nz;
          if (vn < 0) {
            b.vx -= 2.25 * vn * nx;
            b.vz -= 2.25 * vn * nz;
            if (tau - bumpCool[k] > 0.12) {
              events.push({ t: tau, kind: "bump", k, s: Math.min(1, -vn / 9) });
              bumpCool[k] = tau;
            }
          }
        }
      });
      // mur : rebond sauf dans la brèche
      const rad = Math.hypot(b.x, b.z);
      if (rad > A.R - A.r) {
        const ang = Math.atan2(b.z, b.x);
        const inGap = g.half > 0.02 && Math.abs(angNorm(ang - g.center)) < g.half - 0.04;
        if (inGap) {
          if (rad > A.R + A.r * 0.2 && !b.out) {
            b.out = true;
            b.outT = tau;
            if (elimT === null) {
              elimT = tau;
              loser = balls.indexOf(b);
              events.push({ t: tau, kind: "out", s: 1 });
            }
          }
        } else {
          const nx = b.x / rad;
          const nz = b.z / rad;
          b.x = nx * (A.R - A.r);
          b.z = nz * (A.R - A.r);
          const vn = b.vx * nx + b.vz * nz;
          if (vn > 0) {
            b.vx -= 1.8 * vn * nx;
            b.vz -= 1.8 * vn * nz;
            if (vn > 3) events.push({ t: tau, kind: "wall", s: Math.min(1, vn / 10) });
          }
        }
      }
    }
    // choc entre les deux billes
    const [p, q] = balls;
    if (!p.out && !q.out) {
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 2 * A.r && d > 1e-6) {
        const nx = dx / d;
        const nz = dz / d;
        const over = (2 * A.r - d) / 2;
        p.x -= nx * over;
        p.z -= nz * over;
        q.x += nx * over;
        q.z += nz * over;
        const rv = (q.vx - p.vx) * nx + (q.vz - p.vz) * nz;
        if (rv < 0) {
          const j = -(1 + 0.95) * rv * 0.5;
          p.vx -= j * nx;
          p.vz -= j * nz;
          q.vx += j * nx;
          q.vz += j * nz;
          if (-rv > 2) events.push({ t: tau, kind: "clack", s: Math.min(1, -rv / 12) });
        }
      }
    }
    // rotation de roulement : axe perpendiculaire à la vitesse, angle = distance / rayon
    for (const b of balls) {
      const v = Math.hypot(b.vx, b.vz);
      if (v < 1e-6) continue;
      const ax = b.vz / v;
      const az = -b.vx / v;
      const ang = (v * DT) / A.r;
      const s2 = Math.sin(ang / 2);
      const dq = [ax * s2, 0, az * s2, Math.cos(ang / 2)];
      const [x1, y1, z1, w1] = dq;
      const [x2, y2, z2, w2] = b.q;
      b.q = [w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2];
      const n = Math.hypot(...b.q);
      b.q = b.q.map((c) => c / n);
    }
    if (s % every === 0) push();
  }
  return { m, frames, events, elimT, loser, hz: HZ };
}

// Cherche la première graine dont l'élimination tombe dans la fenêtre voulue.
// Le choix ne regarde jamais qui gagne : seulement quand le match se termine.
export function pickMatch(baseSeed, maxT, lo, hi) {
  for (let k = 0; k < 400; k++) {
    const res = simulateMatch(baseSeed + k * 101, maxT);
    if (res.elimT !== null && res.elimT >= lo && res.elimT <= hi) return { ...res, tries: k + 1 };
  }
  throw new Error("aucune graine ne termine le match à temps");
}
