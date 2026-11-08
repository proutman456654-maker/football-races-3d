// Le stade commun à tous les formats : rendu, pelouse, public, projecteurs, caméra, flou de mouvement, étalonnage.
// Chaque format (course, duel, top...) ajoute ses objets et ses plans. Tout est une fonction du temps.
import * as THREE from "three";
import {
  EffectComposer,
  Pass,
  EffectPass,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  Effect,
  EffectAttribute,
  BlendFunction,
} from "../lib/postprocessing.js";

export { THREE };
export const DEG = Math.PI / 180;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, u) => a + (b - a) * u;
export const smooth = (u) => u * u * (3 - 2 * u);
export const inOut = (u, p = 3) => (u < 0.5 ? 0.5 * Math.pow(2 * u, p) : 1 - 0.5 * Math.pow(2 * (1 - u), p));
export const bigFall = (u) => 0.22 * u + 0.78 * Math.pow(u, 9);
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const angDiff = (a, b) => {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
};
// bruit du composant camera-shake du catalogue HyperFrames (fonction pure de t)
function csHash(i, seed) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function csNoise(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return csHash(i, seed) * (1 - u) + csHash(i + 1, seed) * u;
}
export function csSample(rot, t, k) {
  const out = [0, 0, 0];
  for (let o = 0; o < rot.length; o++)
    for (let a = 0; a < 3; a++) {
      const ch = rot[o][a];
      if (!ch) continue;
      const seed = o * 3 + a;
      out[a] += (csNoise(ch[1] * t + seed * 7.13, seed) - 0.5) * ch[0] * k;
    }
  return out;
}
export const HANDHELD_MILD = [
  [[7, 0.15], [5, 0.1], null],
  [[4, 0.8], [2, 0.75], null],
  [[1, 1.2], [0.8, 1.5], null],
];
export const RIG_WOBBLE = [
  [[0.987, 5.2], [1.34, 5.39], [2, 2.23]],
  [[0.73, 9.17], [0.86, 11.35], [0.51, 8.31]],
  [[0.78, 13.52], [0.55, 27.66], [0.28, 18.91]],
];
export const orbitPose = (rho, phi, y, ty, fov, roll = 0) => ({ x: Math.cos(phi) * rho, y, z: Math.sin(phi) * rho, tx: 0, ty, tz: 0, fov, roll });

export function createStadium(C) {
  const WIDTH = C.width;
  const HEIGHT = C.height;
  const Q = C.quality;
  const canvas = document.getElementById("stage");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, depth: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(Math.round(WIDTH * Q.scale), Math.round(HEIGHT * Q.scale), false);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, WIDTH / HEIGHT, 0.2, 900);
  scene.fog = new THREE.FogExp2(0x070b14, 0.0022);
  const U = { uTime: { value: 0 }, uFlash: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } };

  // ---------------------------------------------------------------- pelouse
  function grassTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = "#808080";
    g.fillRect(0, 0, 512, 512);
    const r = rng(77);
    for (let i = 0; i < 26000; i++) {
      const x = r() * 512;
      const y = r() * 512;
      const v = Math.floor(70 + r() * 120);
      g.strokeStyle = `rgb(${v},${v},${v})`;
      g.lineWidth = 0.7 + r() * 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 5, y + 3 + r() * 9);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }
  const pitchMat = new THREE.ShaderMaterial({
    uniforms: { uGrass: { value: grassTexture() }, uHit: { value: new THREE.Vector4(0, 0, 0, 0) }, uHitC: { value: new THREE.Color(1, 0.8, 0.3) }, uDim: { value: 1 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uGrass; uniform vec4 uHit; uniform vec3 uHitC; uniform float uDim;
      varying vec3 vW;
      float ln(float d,float w,float a){ return 1.-smoothstep(w-a,w+a,abs(d)); }
      float box(vec2 p,vec2 b,float w,float a){ vec2 q=abs(p)-b; float d=length(max(q,0.))+min(max(q.x,q.y),0.); return ln(d,w,a); }
      void main(){
        vec2 p=vW.xz;
        float a=max(fwidth(p.x),fwidth(p.y))*.9+.015;
        float st=mod(floor((p.y+105.)/7.5),2.);
        vec3 base=mix(vec3(.052,.235,.072),vec3(.032,.165,.05),st);
        float dA=texture2D(uGrass,p*.55).r; float dB=texture2D(uGrass,p*.09+.3).r;
        base*=.62+.62*dA; base*=.82+.36*dB;
        float l=0.;
        l=max(l,box(p,vec2(34.,52.5),.07,a));
        l=max(l,ln(p.y,.07,a)*step(abs(p.x),34.));
        l=max(l,ln(length(p)-9.15,.07,a));
        l=max(l,1.-smoothstep(.16-a,.16+a,length(p)));
        l=max(l,box(p-vec2(0.,44.25),vec2(20.16,8.25),.07,a)*step(p.y,52.5));
        l=max(l,box(p+vec2(0.,44.25),vec2(20.16,8.25),.07,a)*step(-52.5,p.y));
        base=mix(base,vec3(.82,.86,.82),l*.92);
        float pool=.72+.95*exp(-dot(p,p)/(2.*26.*26.))+.22*exp(-dot(p,p)/(2.*60.*60.));
        vec3 c=base*pool;
        float out_=smoothstep(36.,39.,abs(p.x))+smoothstep(54.5,58.,abs(p.y));
        c=mix(c,vec3(.018,.04,.03),clamp(out_,0.,1.));
        float d=length(p-uHit.xy);
        float ring=smoothstep(uHit.z-2.4,uHit.z,d)*(1.-smoothstep(uHit.z,uHit.z+.9,d));
        c+=uHitC*ring*uHit.w*1.4;
        c+=uHitC*exp(-d*d/(2.*6.*6.))*uHit.w*.07;
        gl_FragColor=vec4(c*uDim,1.);
      }`,
  });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(240, 300), pitchMat);
  pitch.rotation.x = -Math.PI / 2;
  scene.add(pitch);

  // ---------------------------------------------------------------- tribunes
  const SA = 44;
  const SB = 64;
  const SN = 4.5;
  const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const ringAt = (phi, s) => [SA * s * spow(Math.cos(phi), 2 / SN), SB * s * spow(Math.sin(phi), 2 / SN)];
  function ringGeo(section, segs = 180, uTile = 13) {
    const pos = [];
    const uv = [];
    const idx = [];
    for (let j = 0; j < section.length; j++) {
      const [s, y, v] = section[j];
      for (let i = 0; i <= segs; i++) {
        const phi = (i / segs) * Math.PI * 2;
        const [x, z] = ringAt(phi, s);
        pos.push(x, y, z);
        uv.push((i / segs) * uTile, v);
      }
    }
    for (let j = 0; j < section.length - 1; j++)
      for (let i = 0; i < segs; i++) {
        const a = j * (segs + 1) + i;
        const b = a + 1;
        const c = a + segs + 1;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  function crowdTexture() {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = "#07090e";
    g.fillRect(0, 0, 1024, 512);
    const r = rng(11);
    const shirts = ["#d7dce6", "#10131c", "#10131c", "#1b2233", "#2b3346", "#c9202e", "#1d4fb8", "#e8b81a", "#1c8c4a", "#ffffff", "#3a2a22", "#5a6478"];
    const skin = ["#d9a889", "#b88566", "#8a5b3f", "#f0c9a8", "#6a4530"];
    for (let y = 0; y < 512; y += 25)
      for (let x = (y / 25) % 2 ? 8 : 0; x < 1024; x += 17) {
        if (r() < 0.05) continue;
        const jx = x + (r() - 0.5) * 3;
        const jy = y + (r() - 0.5) * 4;
        g.fillStyle = shirts[Math.floor(r() * shirts.length)];
        g.fillRect(jx, jy + 9, 12, 14);
        g.fillStyle = skin[Math.floor(r() * skin.length)];
        g.beginPath();
        g.arc(jx + 6, jy + 5, 4.4, 0, Math.PI * 2);
        g.fill();
      }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }
  const crowdMat = new THREE.ShaderMaterial({
    uniforms: { uCrowd: { value: crowdTexture() }, uFlash: U.uFlash, uTint: U.uTint, uDim: { value: 1 } },
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying float vY; void main(){ vUv=uv; vY=position.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uCrowd; uniform float uFlash; uniform vec3 uTint; uniform float uDim;
      varying vec2 vUv; varying float vY;
      void main(){
        vec3 c=texture2D(uCrowd,vUv,2.4).rgb;
        float g=dot(c,vec3(.3,.59,.11));
        c=mix(vec3(g),c,.55);
        c=mix(vec3(.07),c,.6);
        float light=mix(.6,.22,smoothstep(2.,40.,vY));
        c*=light;
        c+=uTint*uFlash*.05;
        gl_FragColor=vec4(c*uDim,1.);
      }`,
  });
  scene.add(new THREE.Mesh(ringGeo([[1.0, 1.6, 0], [1.26, 15, 1.2]]), crowdMat), new THREE.Mesh(ringGeo([[1.27, 18.2, 0], [1.62, 40, 1.8]]), crowdMat));
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x0b1120, side: THREE.DoubleSide, fog: false });
  scene.add(
    new THREE.Mesh(ringGeo([[1.0, 0, 0], [1.0, 1.6, 0]]), darkMat),
    new THREE.Mesh(ringGeo([[1.62, 40, 0], [1.62, 47, 0], [1.3, 48.5, 0]]), darkMat),
    new THREE.Mesh(ringGeo([[0.0, -0.05, 0], [1.05, -0.05, 0]]), new THREE.MeshBasicMaterial({ color: 0x020305, side: THREE.DoubleSide })),
  );
  const ledMat = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(1, 1, 1) }, uI: { value: 0.5 }, uTime: U.uTime },
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      precision highp float;
      uniform vec3 uC; uniform float uI; uniform float uTime; varying vec2 vUv;
      void main(){
        float b=.55+.45*smoothstep(.2,.8,fract(vUv.x*3.-uTime*.6));
        float s=step(.12,fract(vUv.x*220.))*.9+.1;
        gl_FragColor=vec4(uC*uI*b*s,1.);
      }`,
  });
  scene.add(new THREE.Mesh(ringGeo([[1.262, 15, 0], [1.268, 18.2, 1]], 180, 6), ledMat), new THREE.Mesh(ringGeo([[0.9, 0, 0], [0.9, 1.25, 1]], 180, 6), ledMat));

  // ---------------------------------------------------------------- ciel
  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(420, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `precision highp float; varying vec3 vP;
          void main(){ float h=clamp(normalize(vP).y,0.,1.);
            vec3 c=mix(vec3(.075,.12,.22),vec3(.008,.014,.034),pow(max(h,0.),.6));
            gl_FragColor=vec4(c,1.); }`,
      }),
    ),
  );

  // ---------------------------------------------------------------- projecteurs
  const roofBanks = [];
  for (let k = 0; k < 10; k++) {
    const phi = ((k + 0.5) / 10) * Math.PI * 2;
    const [x, z] = ringAt(phi, 1.42);
    roofBanks.push(new THREE.Vector3(x, 47, z));
  }
  const lampPos = [];
  const lampSeed = [];
  roofBanks.forEach((b) => {
    const out = new THREE.Vector3(b.x, 0, b.z).normalize();
    const side = new THREE.Vector3(-out.z, 0, out.x);
    for (let i = -5; i <= 5; i++)
      for (let j = 0; j < 3; j++) {
        const p = b.clone().addScaledVector(side, i * 2.3);
        p.y += j * 2.1;
        lampPos.push(p.x, p.y, p.z);
        lampSeed.push(((i + 5) * 13 + j * 7) % 11);
      }
  });
  const lampGeo = new THREE.BufferGeometry();
  lampGeo.setAttribute("position", new THREE.Float32BufferAttribute(lampPos, 3));
  lampGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(lampSeed, 1));
  const lampMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 1 }, uS: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSeed; uniform float uI; uniform float uS; varying float vI;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(3400./-mv.z,6.,40.)*uS; vI=uI*(.8+.03*aSeed)/(uS*uS)*min(uS*1.6,3.); }`,
    fragmentShader: `precision highp float; varying float vI;
      void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.15,d); gl_FragColor=vec4(vec3(1.,.97,.9)*vI*5.5*a,a); }`,
  });
  const lamps = new THREE.Points(lampGeo, lampMat);
  lamps.frustumCulled = false;
  scene.add(lamps);
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute("position", new THREE.Float32BufferAttribute(roofBanks.flatMap((b) => [b.x, b.y + 2, b.z]), 3));
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uI; varying float vI;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(46000./-mv.z,120.,560.); vI=uI; }`,
    fragmentShader: `precision highp float; varying float vI;
      void main(){ vec2 p=(gl_PointCoord-.5)*2.; float r=length(p);
        float core=exp(-r*r*16.)*.75;
        float halo=exp(-r*5.5)*.16*(1.-smoothstep(.75,1.,r));
        float streak=exp(-abs(p.y)*38.)*pow(max(0.,1.-abs(p.x)),2.)*.42;
        vec3 c=vec3(1.,.96,.88)*(core+halo)+vec3(.55,.7,1.)*streak;
        gl_FragColor=vec4(c*vI,1.); }`,
  });
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.frustumCulled = false;
  halos.renderOrder = 7;
  scene.add(halos);
  {
    const r = rng(404);
    const n = 1500;
    const p = new Float32Array(n * 3);
    const s = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const phi = r() * Math.PI * 2;
      const up = r() > 0.45;
      const u = r();
      const sc = up ? lerp(1.27, 1.62, u) : lerp(1.0, 1.26, u);
      const y = up ? lerp(18.2, 40, u) : lerp(1.6, 15, u);
      const [x, z] = ringAt(phi, sc);
      p.set([x, y + 0.5, z], i * 3);
      s.set([r() * 50, 1 + r() * 3], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("aS", new THREE.BufferAttribute(s, 2));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uFlash: U.uFlash },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec2 aS; uniform float uTime; uniform float uFlash; varying float vA;
        void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(240./-mv.z,1.6,5.);
          float tw=pow(clamp(sin(uTime*aS.y+aS.x),0.,1.),18.); vA=tw*1.5+uFlash*2.2*step(.5,fract(aS.x*7.3)); }`,
      fragmentShader: `precision highp float; varying float vA;
        void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.2,d); gl_FragColor=vec4(vec3(1.,.98,.92)*vA*a,a); }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
  }
  const beamGeo = new THREE.ConeGeometry(11, 80, 28, 1, true);
  beamGeo.translate(0, -40, 0);
  const beams = [0, 2, 4, 5, 7, 9].map((bi) => {
    const m = new THREE.Mesh(
      beamGeo,
      new THREE.ShaderMaterial({
        uniforms: { uI: { value: 0.07 }, uC: { value: new THREE.Color(1, 0.97, 0.9) } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
        vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV;
          void main(){ vH=-position.y/80.; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `precision highp float; uniform float uI; uniform vec3 uC; varying float vH; varying vec3 vN; varying vec3 vV;
          void main(){ float rim=pow(clamp(abs(dot(vN,vV)),0.,1.),2.2); float f=pow(clamp(1.-vH,0.,1.),1.5); float a=rim*f*uI; gl_FragColor=vec4(uC*a,a); }`,
      }),
    );
    m.position.copy(roofBanks[bi]);
    m.frustumCulled = false;
    m.renderOrder = 5;
    scene.add(m);
    return m;
  });
  const DOWN = new THREE.Vector3(0, -1, 0);

  // ---------------------------------------------------------------- lumière et reflets
  scene.add(new THREE.HemisphereLight(0xb8d0ff, 0x1f5a2c, 1.1));
  const key = new THREE.DirectionalLight(0xfff1dc, 3.2);
  key.position.set(-30, 60, 25);
  const rim = new THREE.DirectionalLight(0xa8c8ff, 2.1);
  rim.position.set(35, 45, -40);
  scene.add(key, rim);
  {
    const es = new THREE.Scene();
    es.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(100, 48, 32),
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          vertexShader: `varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
          fragmentShader: `precision highp float; varying vec3 vP;
            void main(){
              float y=vP.y; float a=atan(vP.z,vP.x);
              vec3 c=mix(vec3(.62,.46,.24),vec3(1.15,.9,.6),smoothstep(-.5,.16,y));
              c=mix(c,vec3(.26,.27,.34),smoothstep(.2,.75,y));
              float bars=smoothstep(.02,.16,abs(sin(a*5.)));
              c*=mix(.32,1.,bars);
              float strip=exp(-pow((y-.42)/.05,2.))*smoothstep(.55,.95,abs(cos(a*5.)));
              c+=vec3(1.,.94,.82)*strip*16.;
              float low=exp(-pow((y+.12)/.035,2.));
              c+=vec3(1.,.9,.7)*low*1.6;
              gl_FragColor=vec4(c,1.);
            }`,
        }),
      ),
    );
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0.012, 1, 300).texture;
    scene.environmentIntensity = 1;
    pm.dispose();
  }
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffbe3c, metalness: 1, roughness: 0.28 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x151a22, metalness: 0.7, roughness: 0.42 });
  function softTexture(fn, size = 256) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    fn(c.getContext("2d"), size);
    return new THREE.CanvasTexture(c);
  }
  const blobTex = softTexture((g, s) => {
    const d = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    d.addColorStop(0, "rgba(255,255,255,1)");
    d.addColorStop(0.55, "rgba(255,255,255,.55)");
    d.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = d;
    g.fillRect(0, 0, s, s);
  });
  const streakTex = softTexture((g, s) => {
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const u = (x + 0.5) / s;
        const v = 1 - (y + 0.5) / s;
        const a = Math.pow(1 - v, 1.6) * Math.pow(Math.sin(Math.PI * u), 2.2);
        const i = (y * s + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    g.putImageData(img, 0, 0);
  });
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const shadowMat = new THREE.MeshBasicMaterial({ map: blobTex, color: 0x000000, transparent: true, opacity: 0.72, depthWrite: false, fog: false });
  const streakMat = new THREE.MeshBasicMaterial({ map: streakTex, color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, fog: false });

  // ombre douce, ombres longues des projecteurs, halo doré et faisceau du meneur pour un objet posé au sol
  function groundKit(x, z, size = 9) {
    const blob = new THREE.Mesh(planeGeo, shadowMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(x, 0.03, z);
    blob.scale.set(size, size, 1);
    blob.renderOrder = 1;
    scene.add(blob);
    const streaks = [0.8, 2.37, 3.94, 5.51].map((a) => {
      const m = new THREE.Mesh(planeGeo, streakMat);
      m.rotation.set(-Math.PI / 2, 0, a);
      m.position.set(x, 0.04, z);
      m.renderOrder = 1;
      scene.add(m);
      return m;
    });
    const glow = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: blobTex, color: 0xffc23a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, 0.06, z);
    glow.scale.set(size * 1.45, size * 1.45, 1);
    glow.renderOrder = 2;
    scene.add(glow);
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(size * 0.34, 90, 24, 1, true),
      new THREE.ShaderMaterial({
        uniforms: { uI: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
        vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV;
          void main(){ vH=(position.y+45.)/90.; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `precision highp float; uniform float uI; varying float vH; varying vec3 vN; varying vec3 vV;
          void main(){ float rim=pow(clamp(abs(dot(vN,vV)),0.,1.),2.5); float a=rim*uI*mix(.9,.04,pow(clamp(vH,0.,1.),.8)); gl_FragColor=vec4(vec3(1.,.74,.26)*a,a); }`,
      }),
    );
    beam.position.set(x, 45, z);
    beam.frustumCulled = false;
    beam.renderOrder = 6;
    scene.add(beam);
    return {
      setHeight(top) {
        streaks.forEach((m) => {
          const len = Math.max(0.5, top * 1.5);
          m.scale.set(size * 0.51, len, 1);
          const a = m.rotation.z;
          m.position.set(x - Math.sin(a) * (len / 2), 0.04, z - Math.cos(a) * (len / 2));
        });
      },
      setLead(li) {
        glow.material.opacity = li * 0.42;
        beam.material.uniforms.uI.value = li * 0.17;
        glow.visible = beam.visible = li > 0.01;
      },
    };
  }

  // ---------------------------------------------------------------- tifo géant dans la tribune d'en face
  const tifoMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: null }, uO: { value: 0 }, uTime: U.uTime },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uMap; uniform float uO; uniform float uTime; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec2 grid=vec2(170.,86.);
        vec2 id=floor(vUv*grid);
        vec2 f=fract(vUv*grid);
        float n=hash(id);
        float wave=sin(vUv.x*14.+uTime*3.2+vUv.y*5.)*.5+.5;
        vec3 c=texture2D(uMap,(id+.5)/grid*vec2(1.,.68)+vec2(0.,.16)).rgb;
        c*=(.72+.5*n)*(.82+.32*wave);
        float card=smoothstep(.0,.12,f.x)*smoothstep(1.,.88,f.x)*smoothstep(.0,.12,f.y)*smoothstep(1.,.88,f.y);
        c*=mix(.35,1.,card);
        float show=smoothstep(uO*1.15-.15,uO*1.15,n+.001);
        float a=(1.-show)*smoothstep(0.,.03,vUv.x)*smoothstep(1.,.97,vUv.x)*smoothstep(0.,.05,vUv.y)*smoothstep(1.,.95,vUv.y);
        gl_FragColor=vec4(c*.62,a);
      }`,
  });
  const tifo = new THREE.Mesh(new THREE.PlaneGeometry(112, 44), tifoMat);
  tifo.visible = false;
  tifo.renderOrder = 3;
  scene.add(tifo);

  // ---------------------------------------------------------------- confettis et étincelles (forme fermée du temps)
  const pieces = [];
  function burst(o) {
    // o: { t, x, y, z, big, colors: [hex], rainAngle?, rainR?, seed? }
    const r = rng(o.seed || Math.round(o.t * 1000) + 7);
    const colors = o.colors.map((c) => new THREE.Color(c));
    const nConf = o.big ? 760 : 60;
    for (let i = 0; i < nConf; i++) {
      const a = r() * Math.PI * 2;
      const sp = (o.big ? 9 : 5) + r() * (o.big ? 26 : 12);
      const up = (o.big ? 12 : 7) + r() * (o.big ? 26 : 12);
      const col = colors[Math.floor(r() * colors.length)];
      pieces.push({ p: [o.x + Math.cos(a) * 1.4, o.y, o.z + Math.sin(a) * 1.4], v: [Math.cos(a) * sp, up, Math.sin(a) * sp], t: [o.t, o.big ? 4.2 : 2.1], seed: [1 + r() * 3, r(), 1 + r() * 3, 1.0 + r() * 0.8], c: [col.r * 1.25, col.g * 1.25, col.b * 1.25], size: 0.2 + r() * 0.22, g: 7 });
    }
    const nSpark = o.big ? 150 : 34;
    for (let i = 0; i < nSpark; i++) {
      const a = r() * Math.PI * 2;
      const sp = 7 + r() * 16;
      pieces.push({ p: [o.x + Math.cos(a) * 1.6, o.y - 0.1, o.z + Math.sin(a) * 1.6], v: [Math.cos(a) * sp, 2 + r() * 12, Math.sin(a) * sp], t: [o.t, 0.55 + r() * 0.5], seed: [3 + r() * 4, r(), 3 + r() * 4, 0.6], c: [7.5, 5.0, 1.8], size: 0.055 + r() * 0.07, g: 20 });
    }
    if (o.big) {
      // pluie venue du ciel jusque devant la caméra : c'est elle qui donne la profondeur
      const ra = o.rainAngle ?? Math.atan2(o.z, o.x);
      const rr0 = o.rainR ?? Math.hypot(o.x, o.z);
      for (let i = 0; i < 480; i++) {
        const a = ra + (r() - 0.5) * 1.8;
        const rr = rr0 + r() * 26 - 6;
        const col = colors[Math.floor(r() * colors.length)];
        pieces.push({ p: [Math.cos(a) * rr, (o.rainY ?? 18) + r() * 26, Math.sin(a) * rr], v: [(r() - 0.5) * 3, -2 - r() * 2, (r() - 0.5) * 3], t: [o.t + r() * 0.35, 4.8], seed: [1 + r() * 3, r(), 1 + r() * 3, 1.0 + r() * 0.7], c: [col.r * 1.2, col.g * 1.2, col.b * 1.2], size: 0.17 + r() * 0.2, g: 5 });
      }
    }
  }
  function buildConfetti() {
    const n = pieces.length;
    if (!n) return;
    const P0 = new Float32Array(n * 3);
    const V = new Float32Array(n * 3);
    const T = new Float32Array(n * 2);
    const Sd = new Float32Array(n * 4);
    const K = new Float32Array(n * 3);
    const Z = new Float32Array(n * 2);
    pieces.forEach((q, i) => {
      P0.set(q.p, i * 3);
      V.set(q.v, i * 3);
      T.set(q.t, i * 2);
      Sd.set(q.seed, i * 4);
      K.set(q.c, i * 3);
      Z.set([q.size, q.g], i * 2);
    });
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.7, 0, 0.5, -0.7, 0, 0.5, 0.7, 0, -0.5, 0.7, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute("aP", new THREE.InstancedBufferAttribute(P0, 3));
    g.setAttribute("aV", new THREE.InstancedBufferAttribute(V, 3));
    g.setAttribute("aT", new THREE.InstancedBufferAttribute(T, 2));
    g.setAttribute("aS", new THREE.InstancedBufferAttribute(Sd, 4));
    g.setAttribute("aC", new THREE.InstancedBufferAttribute(K, 3));
    g.setAttribute("aZ", new THREE.InstancedBufferAttribute(Z, 2));
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime },
      side: THREE.DoubleSide,
      vertexShader: `
        attribute vec3 aP,aV,aC; attribute vec2 aT,aZ; attribute vec4 aS;
        uniform float uTime; varying vec3 vC;
        void main(){
          float tau=uTime-aT.x;
          if(tau<0.||tau>aT.y){ gl_Position=vec4(2.,2.,2.,1.); return; }
          float k=aS.w;
          float e=(1.-exp(-k*tau))/k;
          vec3 p=aP+aV*e;
          p.y-=aZ.y/k*(tau-e);
          p.x+=sin(tau*aS.x*2.+aS.y*6.28)*.42*min(tau,1.);
          p.z+=cos(tau*aS.z*2.+aS.y*9.)*.42*min(tau,1.);
          if(p.y<.04) p.y=.04;
          float a=tau*aS.x*3.+aS.y*6.28; float b=tau*aS.z*2.5+aS.x*6.28;
          float life=smoothstep(aT.y,aT.y-.35,tau);
          vec3 q=position*aZ.x*life;
          float ca=cos(a),sa=sin(a),cb=cos(b),sb=sin(b);
          q=vec3(q.x,q.y*ca-q.z*sa,q.y*sa+q.z*ca);
          q=vec3(q.x*cb+q.z*sb,q.y,-q.x*sb+q.z*cb);
          gl_Position=projectionMatrix*viewMatrix*vec4(p+q,1.);
          vC=aC*(.3+.7*abs(ca*cb));
        }`,
      fragmentShader: `precision highp float; varying vec3 vC; void main(){ gl_FragColor=vec4(vC,1.); }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    scene.add(mesh);
  }

  // ---------------------------------------------------------------- impacts (donnés par le format)
  // hit: { t, big, fall, x, y, z, color, tifoTex?, tifoAngle? }
  let hits = [];
  const lastHit = (t) => {
    let e = null;
    for (const h of hits) {
      if (t >= h.t) e = h;
      else break;
    }
    return e;
  };
  function hitEnv(t) {
    const e = lastHit(t);
    if (!e) return { k: 0, e: null, tau: 99 };
    const tau = t - e.t;
    return { k: Math.exp(-tau * (e.big ? 4 : 8)) * (e.big ? 1 : 0.55), e, tau };
  }
  function bigEnv(t) {
    let best = 0;
    let ev = null;
    for (const e of hits)
      if (e.big && t >= e.t) {
        const tau = t - e.t;
        const v = clamp(tau / 0.14) * (1 - smooth(clamp((tau - 2.1) / 0.5)));
        if (v > best) {
          best = v;
          ev = e;
        }
      }
    return { v: best, e: ev };
  }
  function prepAt(t) {
    for (const e of hits) if (e.big && e.fall && t >= e.t - e.fall && t < e.t) return e;
    return null;
  }

  // ---------------------------------------------------------------- caméra : plans et transitions
  let segs = [];
  function segIndexAt(t) {
    for (let i = segs.length - 1; i >= 0; i--) if (t >= segs[i].t0 - segs[i].dur) return i;
    return 0;
  }
  function poseFor(seg, t) {
    const span = Math.max(0.001, seg.t1 - seg.t0);
    return seg.pose(clamp((t - seg.t0) / span), t);
  }
  function cameraPose(t) {
    const i = segIndexAt(t);
    const seg = segs[i];
    if (t >= seg.t0 || i === 0 || seg.dur === 0) return poseFor(seg, t);
    // transition : on tourne autour du centre, jamais à travers
    const a = poseFor(segs[i - 1], seg.t0 - seg.dur);
    const b = poseFor(seg, seg.t0);
    const u = clamp((t - (seg.t0 - seg.dur)) / seg.dur);
    const k = inOut(u, 3);
    const ra = Math.hypot(a.x, a.z);
    const rb = Math.hypot(b.x, b.z);
    const fa = Math.atan2(a.z, a.x);
    const fb = Math.atan2(b.z, b.x);
    const d = angDiff(fa, fb);
    const f = fa + d * k;
    const rr = lerp(ra, rb, k);
    const bump = Math.sin(Math.PI * u);
    const crane = seg.trans === "crane" ? (seg.craneH ?? 26) * bump : 0;
    return {
      x: Math.cos(f) * rr,
      y: lerp(a.y, b.y, k) + crane,
      z: Math.sin(f) * rr,
      tx: lerp(a.tx, b.tx, k),
      ty: lerp(a.ty, b.ty, k) + crane * 0.35,
      tz: lerp(a.tz, b.tz, k),
      fov: lerp(a.fov, b.fov, k) + 13 * bump,
      roll: lerp(a.roll, b.roll, k) + (d > 0 ? 7 : -7) * bump,
    };
  }
  function whipK(t) {
    const s = segs[segIndexAt(t)];
    if (s.dur > 0 && t < s.t0) return Math.sin(Math.PI * clamp((t - (s.t0 - s.dur)) / s.dur));
    return 0;
  }

  // ---------------------------------------------------------------- état commun au temps t
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const white = new THREE.Color(1, 1, 1);
  let M = null;
  function setWorld(t) {
    U.uTime.value = t;
    const env = hitEnv(t);
    const big = bigEnv(t);
    const prep = prepAt(t);
    const last = env.e;
    if (last && env.tau < 1.2) {
      pitchMat.uniforms.uHit.value.set(last.x, last.z, 3 + env.tau * (last.big ? 34 : 24), Math.exp(-env.tau * 3.4) * (last.big ? 1 : 0.6));
      pitchMat.uniforms.uHitC.value.set(last.color).multiplyScalar(0.6).add(tmpColor.setRGB(0.6, 0.45, 0.15));
    } else pitchMat.uniforms.uHit.value.w = 0;
    const dim = prep ? lerp(1, 0.68, smooth(clamp((t - (prep.t - prep.fall)) / 0.28))) : 1;
    pitchMat.uniforms.uDim.value = dim + big.v * 0.08 + env.k * 0.12;
    crowdMat.uniforms.uDim.value = dim * (1 + big.v * 0.5);
    lampMat.uniforms.uI.value = dim * (1 + big.v * 0.5 + env.k * 0.4);
    haloMat.uniforms.uI.value = dim * (1 + big.v * 0.7 + env.k * 0.7);
    U.uFlash.value = big.v * 0.75 + env.k * 0.5;
    if (last) U.uTint.value.set(last.color);
    ledMat.uniforms.uC.value.set(last ? last.color : "#ffd27a");
    ledMat.uniforms.uI.value = (0.55 + env.k * 2.2 + big.v * 1.6) * dim;
    const hookK = t < (C.t0 ?? 3) ? 1 : 0;
    beams.forEach((m, k) => {
      const w = t * 0.22 + k * 1.05;
      tmpV.set(Math.cos(w) * 24, 0, Math.sin(w * 0.8 + k) * 30);
      if (big.v > 0 && big.e) tmpV.lerp(tmpV2.set(big.e.x, big.e.y, big.e.z), big.v);
      else if (prep) {
        const aim = M && M.prepAim ? M.prepAim(prep, t) : { x: prep.x, y: prep.y + 13 * (1 - bigFall(clamp((t - (prep.t - prep.fall)) / prep.fall))), z: prep.z };
        tmpV.lerp(tmpV2.set(aim.x, aim.y, aim.z), 0.85);
      }
      tmpV.sub(m.position).normalize();
      m.quaternion.setFromUnitVectors(DOWN, tmpV);
      m.material.uniforms.uI.value = (0.12 + 0.12 * big.v + 0.05 * hookK + 0.08 * env.k) * (prep ? 2.6 : 1);
      if (big.v > 0 && big.e) m.material.uniforms.uC.value.copy(white).lerp(tmpColor.set(big.e.color), 0.45 * big.v);
      else m.material.uniforms.uC.value.setRGB(1, 0.97, 0.9);
    });
    if (big.v > 0 && big.e && big.e.tifoTex) {
      const [x, z] = ringAt(big.e.tifoAngle, 1.4);
      tifo.position.set(x, 28, z);
      tifo.lookAt(0, 8, 0);
      tifo.visible = true;
      tifoMat.uniforms.uMap.value = big.e.tifoTex;
      tifoMat.uniforms.uO.value = big.v;
    } else tifo.visible = false;
    if (M) M.update(t, { env, big, prep, last, dim });
    const p = cameraPose(t);
    camera.position.set(p.x, p.y, p.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(p.tx, p.ty, p.tz);
    camera.fov = p.fov - env.k * 3.2;
    const idle = csSample(HANDHELD_MILD, t, 0.075);
    const wob = csSample(RIG_WOBBLE, t, env.k * (last && last.big ? 1.9 : 1.15));
    camera.rotateX((idle[0] + wob[0]) * DEG);
    camera.rotateY((idle[1] + wob[1]) * DEG);
    camera.rotateZ((p.roll + (wob[2] || 0) + idle[2]) * DEG);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  // ---------------------------------------------------------------- flou de mouvement par accumulation
  const blitScene = new THREE.Scene();
  const blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blitMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uW: { value: 1 } },
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader: `precision highp float; uniform sampler2D tSrc; uniform float uW; varying vec2 vUv; void main(){ vec3 c=texture2D(tSrc,vUv).rgb; if(any(isnan(c))||any(isinf(c))) c=vec3(0.); c=min(c,vec3(60.)); gl_FragColor=vec4(c*uW,1.); }`,
  });
  blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat));
  function screenMotion(t, dt) {
    const a = cameraPose(t - dt / 2);
    const b = cameraPose(t + dt / 2);
    const dd = Math.hypot(a.tx - a.x, a.ty - a.y, a.tz - a.z) || 1;
    const db = Math.hypot(b.tx - b.x, b.ty - b.y, b.tz - b.z) || 1;
    const fa = [(a.tx - a.x) / dd, (a.ty - a.y) / dd, (a.tz - a.z) / dd];
    const fb = [(b.tx - b.x) / db, (b.ty - b.y) / db, (b.tz - b.z) / db];
    const ang = Math.acos(clamp(fa[0] * fb[0] + fa[1] * fb[1] + fa[2] * fb[2], -1, 1));
    const focal = HEIGHT / (2 * Math.tan(a.fov * 0.5 * DEG));
    const trans = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / Math.max(4, dd);
    return (ang + trans) * focal;
  }
  function samplesFor(t) {
    if (Q.maxN <= 1) return 1;
    let n = Math.ceil((screenMotion(t, 1 / C.fps) * 0.5) / 7);
    const env = hitEnv(t);
    if (env.tau < 0.22) n = Math.max(n, 4);
    for (const h of hits)
      if (t >= h.t - 0.4 && t < h.t) {
        n = Math.max(n, 5);
        break;
      }
    if (M && M.minSamples) n = Math.max(n, M.minSamples(t));
    return clamp(n, 1, Q.maxN);
  }
  class AccumPass extends Pass {
    constructor() {
      super("AccumPass");
      this.needsSwap = true;
      this.rt = new THREE.WebGLRenderTarget(Math.round(WIDTH * Q.scale), Math.round(HEIGHT * Q.scale), { type: THREE.HalfFloatType, samples: Q.msaa, depthBuffer: true });
      this.t = 0;
    }
    render(r, inputBuffer, outputBuffer) {
      const t = this.t;
      const dt = 1 / C.fps;
      const n = samplesFor(t);
      lampMat.uniforms.uS.value = n > 1 ? clamp((screenMotion(t, dt) * 0.5 * Q.scale) / (n * 9), 1, 3.6) : 1;
      const prevAuto = r.autoClear;
      r.autoClear = false;
      r.setRenderTarget(outputBuffer);
      r.setClearColor(0x000000, 1);
      r.clear(true, false, false);
      for (let i = 0; i < n; i++) {
        const ti = n === 1 ? t : t + ((i + 0.5) / n - 0.5) * dt * 0.5;
        setWorld(ti);
        r.setRenderTarget(this.rt);
        r.clear(true, true, false);
        r.render(scene, camera);
        r.setRenderTarget(outputBuffer);
        blitMat.uniforms.tSrc.value = this.rt.texture;
        blitMat.uniforms.uW.value = 1 / n;
        r.render(blitScene, blitCam);
      }
      r.autoClear = prevAuto;
      setWorld(t);
    }
  }
  class GradeEffect extends Effect {
    constructor() {
      super(
        "GradeEffect",
        `
        uniform float uFlashAdd; uniform vec3 uFlashC; uniform float uCA; uniform float uGrain; uniform float uSeed; uniform float uExpo;
        uniform vec2 uShockC; uniform float uShockR; uniform float uShockA;
        float h1(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
        void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){
          vec2 q=uv;
          if(uShockA>.0001){
            vec2 dd=(uv-uShockC)*vec2(.5625,1.);
            float r=length(dd);
            float w=smoothstep(uShockR-.11,uShockR,r)*(1.-smoothstep(uShockR,uShockR+.05,r));
            q-=normalize(dd+1e-5)*w*uShockA*vec2(1.7778,1.);
          }
          vec2 d=q-.5;
          float k=dot(d,d)*4.;
          vec2 off=d*uCA*(.35+k);
          vec3 c=vec3(texture2D(inputBuffer,q+off).r,texture2D(inputBuffer,q).g,texture2D(inputBuffer,q-off).b);
          c*=uExpo;
          float l=dot(c,vec3(.2126,.7152,.0722));
          c=mix(vec3(l),c,1.2);
          c=mix(c*vec3(.93,1.,1.07),c*vec3(1.05,1.,.95),smoothstep(.02,.45,l));
          c=max(c,vec3(0.));
          c=pow(c,vec3(1.08));
          c+=uFlashC*uFlashAdd;
          float v=smoothstep(.98,.3,length((uv-.5)*vec2(.92,1.05)));
          c*=mix(.8,1.,v);
          float n=h1(uv*vec2(1080.,1920.)*.5+uSeed)-.5;
          c+=n*uGrain*(1.-min(l,1.)*.65);
          outputColor=vec4(c,1.);
        }`,
        {
          attributes: EffectAttribute.CONVOLUTION,
          blendFunction: BlendFunction.SRC,
          uniforms: new Map([
            ["uFlashAdd", new THREE.Uniform(0)],
            ["uFlashC", new THREE.Uniform(new THREE.Color(1, 1, 1))],
            ["uCA", new THREE.Uniform(0.002)],
            ["uGrain", new THREE.Uniform(0.018)],
            ["uSeed", new THREE.Uniform(0)],
            ["uExpo", new THREE.Uniform(1)],
            ["uShockC", new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
            ["uShockR", new THREE.Uniform(0)],
            ["uShockA", new THREE.Uniform(0)],
          ]),
        },
      );
    }
  }
  let composer = null;
  let accum = null;
  let bloom = null;
  let grade = null;
  const projV = new THREE.Vector3();
  function renderAt(t) {
    if (!composer) return;
    accum.t = t;
    setWorld(t);
    const env = hitEnv(t);
    const big = bigEnv(t);
    const u = grade.uniforms;
    u.get("uCA").value = 0.0007 + env.k * 0.009 + whipK(t) * 0.008;
    u.get("uSeed").value = Math.floor(t * C.fps) * 0.137;
    const last = env.e;
    const flashAmp = last ? (last.big ? 0.32 : 0.025) : 0;
    u.get("uFlashAdd").value = env.tau < 1 ? flashAmp * Math.exp(-env.tau * 13) : 0;
    u.get("uExpo").value = 1 + env.k * 0.42;
    bloom.intensity = 0.8 + env.k * 0.8 + big.v * 0.25;
    if (last && env.tau < 0.7) {
      projV.set(last.x, last.y, last.z).project(camera);
      u.get("uShockC").value.set(projV.x * 0.5 + 0.5, projV.y * 0.5 + 0.5);
      u.get("uShockR").value = env.tau * (last.big ? 1.0 : 0.72);
      u.get("uShockA").value = (last.big ? 0.042 : 0.018) * Math.exp(-env.tau * 4.6);
    } else u.get("uShockA").value = 0;
    composer.render(0);
  }
  async function loadFlag(code) {
    const img = new Image();
    img.src = `assets/flags/${code}.svg`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 768;
    c.getContext("2d").drawImage(img, 0, 0, 1024, 768);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  let lastSeek = 0;
  window.addEventListener("hf-seek", (e) => {
    lastSeek = e.detail.time;
    renderAt(lastSeek);
  });
  function start(mod) {
    M = mod;
    hits = (mod.hits || []).slice().sort((a, b) => a.t - b.t);
    segs = mod.segs;
    buildConfetti();
    composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, multisampling: 0 });
    accum = new AccumPass();
    composer.addPass(accum);
    bloom = new BloomEffect({ intensity: 0.85, luminanceThreshold: 0.92, luminanceSmoothing: 0.22, mipmapBlur: true, radius: 0.72, levels: Q.bloomLevels, resolutionScale: Q.bloomScale });
    composer.addPass(new EffectPass(camera, bloom, new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })));
    grade = new GradeEffect();
    composer.addPass(new EffectPass(camera, grade));
    renderer.compile(scene, camera);
    renderAt(lastSeek);
    window.__worldDone(true);
  }
  return { THREE, C, Q, scene, camera, renderer, U, ringAt, goldMat, darkMetal, blobTex, planeGeo, groundKit, burst, loadFlag, start, hitEnv, bigEnv, prepAt };
}
