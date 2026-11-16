// Three.js rendering for Monsoon Market: dusk sky, lantern light, canvas
// textures, bot bodies, the viewmodel, tracers, smoke and rain. One job:
// turn the state into a picture. It never writes match state.
import * as THREE from 'three';
import { STALLS, CRATES, LANTERNS, WATER, SITES, BOUNDS } from './map.js';
import { TEAMS } from './state.js';

const EYE = 1.6;
const CROUCH_EYE = 1.1;

function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function plankTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7a5c42'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = `rgba(0,0,0,${0.08 + (y % 64 === 0 ? 0.08 : 0)})`;
      g.fillRect(0, y, w, 3);
      g.fillStyle = 'rgba(255,220,170,0.05)';
      g.fillRect(0, y + 3, w, 2);
      for (let x = 0; x < w; x += 64) {
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x + ((y / 32) % 2) * 32, y, 2, 32);
      }
    }
  }, 8, 8);
}

function stoneTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6b6259'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i += 1) {
      g.fillStyle = `rgba(${40 + Math.random() * 60 | 0},${36 + Math.random() * 50 | 0},${30 + Math.random() * 40 | 0},0.25)`;
      g.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 22, 6 + Math.random() * 14);
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < h; y += 42) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }, 10, 8);
}

function awningTexture(a, b) {
  return canvasTex(128, 64, (g, w, h) => {
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = (x / 16) % 2 === 0 ? a : b;
      g.fillRect(x, 0, 16, h);
    }
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fillRect(0, h - 6, w, 6);
  });
}

function glowTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
}

function signTexture(letter, sub) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#1e1a24'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e8a13a'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffd98a'; g.font = 'bold 72px sans-serif'; g.textAlign = 'center';
    g.fillText(letter, w / 2, 78);
    g.fillStyle = '#e9e6df'; g.font = 'bold 15px sans-serif';
    g.fillText(sub, w / 2, 108);
  });
}

export class Renderer {
  constructor(container, state) {
    this.state = state;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x41302c);
    this.scene.fog = new THREE.Fog(0x41302c, 22, 68);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 120);
    this.camera.rotation.order = 'YXZ';

    // Dusk light: a warm low sun and a warm sky fill, brightened so the
    // scene reads at thumbnail size.
    this.scene.add(new THREE.HemisphereLight(0xb59a78, 0x4a3226, 1.05));
    const sun = new THREE.DirectionalLight(0xffb36b, 1.6);
    sun.position.set(-18, 26, -14);
    this.scene.add(sun);
    // A few real lantern lights; the rest of the lanterns only glow.
    this.lanternLights = [];
    for (const p of [{ x: 0, z: 0 }, { x: 14, z: -9 }, { x: -14, z: -9 }, { x: 0, z: 14 }]) {
      const l = new THREE.PointLight(0xffa64d, 22, 16, 1.6);
      l.position.set(p.x, 3.1, p.z);
      this.scene.add(l);
      this.lanternLights.push(l);
    }

    this.buildWorld();
    this.buildViewmodel();
    this.buildEffects();
    this.botMeshes = new Map();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  buildWorld() {
    const s = this.scene;
    const stone = stoneTexture();
    const plank = plankTexture();
    // Ground: stone plaza, plank decks on the lanes.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(BOUNDS.x1 - BOUNDS.x0 + 2, BOUNDS.z1 - BOUNDS.z0 + 2),
      new THREE.MeshLambertMaterial({ map: stone }),
    );
    ground.rotation.x = -Math.PI / 2;
    s.add(ground);
    const deck = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 8),
      new THREE.MeshLambertMaterial({ map: plank }),
    );
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, 0.01, -9);
    s.add(deck);
    // Water: the canal and the river edge, slowly scrolling.
    this.waterTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#17424f'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(120,200,220,0.25)';
      for (let i = 0; i < 14; i += 1) {
        g.beginPath(); g.moveTo(0, Math.random() * h); g.lineTo(w, Math.random() * h); g.stroke();
      }
    }, 3, 3);
    this.waterMat = new THREE.MeshLambertMaterial({ map: this.waterTex, transparent: true, opacity: 0.9 });
    for (const wr of WATER) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(wr.x1 - wr.x0, wr.z1 - wr.z0), this.waterMat);
      w.rotation.x = -Math.PI / 2;
      w.position.set((wr.x0 + wr.x1) / 2, -0.35, (wr.z0 + wr.z1) / 2);
      s.add(w);
    }
    // Perimeter walls.
    const wallMat = new THREE.MeshLambertMaterial({ map: stone, color: 0xb9a894 });
    const wall = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3.5, d), wallMat);
      m.position.set(x, 1.75, z); s.add(m);
    };
    wall(0, -19.5, 48, 1); wall(0, 19.5, 48, 1); wall(-23.5, 0, 1, 40); wall(23.5, 0, 1, 40);
    // Stalls: counter, goods, striped awning on poles.
    const awnings = {
      red: awningTexture('#b8452f', '#e8d9b0'),
      teal: awningTexture('#2f7d7a', '#e8d9b0'),
      amber: awningTexture('#d99a2b', '#e8d9b0'),
    };
    const counterMat = new THREE.MeshLambertMaterial({ map: plank, color: 0xcbb39a });
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x4a382a });
    const goodsCols = [0xc4552d, 0xd99a2b, 0x7a9a3d, 0xb8452f, 0xe8d9b0];
    for (const st of STALLS) {
      const g = new THREE.Group();
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.4), counterMat);
      counter.position.y = 0.55; g.add(counter);
      for (let i = 0; i < 5; i += 1) {
        const good = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.22 + Math.random() * 0.18, 0.34),
          new THREE.MeshLambertMaterial({ color: goodsCols[(i + STALLS.indexOf(st)) % goodsCols.length] }),
        );
        good.position.set(-1 + i * 0.5, 1.22, (Math.random() - 0.5) * 0.5);
        g.add(good);
      }
      const awn = new THREE.Mesh(
        new THREE.PlaneGeometry(3.0, 1.8),
        new THREE.MeshLambertMaterial({ map: awnings[st.awning], side: THREE.DoubleSide }),
      );
      awn.rotation.x = -Math.PI / 2 + 0.35;
      awn.position.y = 2.15; g.add(awn);
      for (const px of [-1.35, 1.35]) for (const pz of [-0.6, 0.6]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), poleMat);
        pole.position.set(px, 1.1, pz); g.add(pole);
      }
      g.position.set(st.x, 0, st.z);
      s.add(g);
    }
    // Crates.
    const crateMat = new THREE.MeshLambertMaterial({ map: plank, color: 0xa88a68 });
    for (const c of CRATES) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.s, c.s, c.s), crateMat);
      m.position.set(c.x, c.s / 2, c.z);
      m.rotation.y = (c.x * 7 + c.z * 3) % 0.6;
      s.add(m);
    }
    // Fountain in Lantern Square.
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.8, 1.0, 12),
      new THREE.MeshLambertMaterial({ map: stone, color: 0x9a8f82 }),
    );
    fountain.position.set(0, 0.5, 0); s.add(fountain);
    const fwater = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 16),
      new THREE.MeshLambertMaterial({ color: 0x2a6a7a, transparent: true, opacity: 0.9 }),
    );
    fwater.rotation.x = -Math.PI / 2; fwater.position.set(0, 1.02, 0); s.add(fwater);
    // Lantern posts: pole, glowing paper lantern, a few real lights.
    const glowTex = glowTexture();
    for (const ln of LANTERNS) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6), poleMat);
      pole.position.y = 1.7; g.add(pole);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffb347 }),
      );
      lamp.position.y = 3.1; g.add(lamp);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa64d, transparent: true, opacity: 0.7, depthWrite: false }));
      halo.scale.set(2.2, 2.2, 1); halo.position.y = 3.1; g.add(halo);
      g.position.set(ln.x, 0, ln.z);
      s.add(g);
    }
    // Site signs: floating A / B boards over each site.
    for (const key of ['A', 'B']) {
      const site = SITES[key];
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.7, 1.7),
        new THREE.MeshBasicMaterial({ map: signTexture(key, site.label), transparent: true, side: THREE.DoubleSide }),
      );
      sign.position.set(site.x, 3.4, site.z);
      s.add(sign);
    }
    // Rain: a wrap-around field of drops around the camera.
    const rainGeo = new THREE.BufferGeometry();
    const N = 500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 55;
      pos[i * 3 + 1] = Math.random() * 18;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 45;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xaac4d4, size: 0.06, transparent: true, opacity: 0.55 }));
    s.add(this.rain);
  }

  buildViewmodel() {
    // The gun the player holds: barrel, body, grip, two hands. It bobs with
    // movement and kicks with every shot.
    this.vm = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x23262b });
    const accent = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), dark);
    this.vm.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 8), dark);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.42); this.vm.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), accent);
    grip.position.set(0, -0.13, 0.14); grip.rotation.x = 0.3; this.vm.add(grip);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.12), accent);
    sight.position.set(0, 0.09, -0.1); this.vm.add(sight);
    const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.12), skin);
    handR.position.set(0.06, -0.07, 0.05); this.vm.add(handR);
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.12), skin);
    handL.position.set(-0.05, -0.05, -0.28); this.vm.add(handL);
    this.vm.position.set(0.3, -0.28, -0.55);
    this.vm.scale.setScalar(0.62);
    this.camera.add(this.vm);
    // Muzzle flash: a glowing sprite plus a short light at the barrel tip.
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false }));
    this.flash.scale.set(0.55, 0.55, 1);
    this.flash.position.set(0, 0.02, -0.62);
    this.vm.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffc06a, 0, 7, 1.8);
    this.flashLight.position.set(0, 0.02, -0.62);
    this.vm.add(this.flashLight);
    this.scene.add(this.camera);
  }

  buildEffects() {
    // Tracer pool: glowing lines from muzzle to impact, fading fast.
    this.tracers = [];
    for (let i = 0; i < 16; i += 1) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerI = 0;
    // Smoke pool: soft sprites that grow and fade.
    this.smokeSprites = [];
    const smokeTex = glowTexture();
    for (let i = 0; i < 30; i += 1) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xbfc4c8, transparent: true, opacity: 0, depthWrite: false }));
      sp.scale.set(1, 1, 1);
      this.scene.add(sp);
      this.smokeSprites.push({ sp, life: 0 });
    }
    this.smokeI = 0;
    // Explosion flash.
    this.boomSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff8a3a, transparent: true, opacity: 0, depthWrite: false }));
    this.boomSprite.scale.set(6, 6, 1);
    this.scene.add(this.boomSprite);
    this.boomLight = new THREE.PointLight(0xff7a2a, 0, 22, 1.5);
    this.scene.add(this.boomLight);
    // The planted charge: a small blinking box.
    this.charge = new THREE.Group();
    const cbox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.34), new THREE.MeshLambertMaterial({ color: 0x2a2d33 }));
    cbox.position.y = 0.11; this.charge.add(cbox);
    this.chargeLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    this.chargeLight.position.set(0.18, 0.26, 0); this.charge.add(this.chargeLight);
    this.charge.visible = false;
    this.scene.add(this.charge);
  }

  spawnTracer(from, to) {
    const t = this.tracers[this.tracerI]; this.tracerI = (this.tracerI + 1) % this.tracers.length;
    const p = t.line.geometry.attributes.position.array;
    p[0] = from.x; p[1] = from.y; p[2] = from.z;
    p[3] = to.x; p[4] = to.y; p[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.opacity = 0.95;
    t.life = 0.32;
  }

  spawnSmoke(x, z) {
    for (let i = 0; i < 5; i += 1) {
      const s = this.smokeSprites[this.smokeI]; this.smokeI = (this.smokeI + 1) % this.smokeSprites.length;
      s.sp.position.set(x + (Math.random() - 0.5) * 2.5, 0.6 + Math.random() * 1.2, z + (Math.random() - 0.5) * 2.5);
      s.sp.material.opacity = 0.5;
      s.sp.scale.set(1.2, 1.2, 1);
      s.life = 1;
    }
  }

  botMesh(f) {
    let m = this.botMeshes.get(f.id);
    if (m) return m;
    const team = TEAMS[f.team];
    const g = new THREE.Group();
    const cloth = new THREE.MeshLambertMaterial({ color: team.dark });
    const trim = new THREE.MeshLambertMaterial({ color: team.color });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x23262b });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.3), cloth);
    torso.position.y = 1.05; g.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.34), trim);
    vest.position.y = 1.12; g.add(vest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skin);
    head.position.y = 1.56; g.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), trim);
    cap.position.y = 1.74; g.add(cap);
    for (const sx of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), dark);
      leg.position.set(sx, 0.35, 0); g.add(leg);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.16), cloth);
      arm.position.set(sx * 1.9, 1.1, 0.12); arm.rotation.x = -1.1; g.add(arm);
    }
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.7), dark);
    gun.position.set(0.1, 1.18, -0.35); g.add(gun);
    // Muzzle flash: a glow at the gun tip, lit while the bot is firing
    // (state.enemyFlash, set on every bot shot). The staged cover freezes
    // it mid-burst; in live play it flickers for a frame per shot.
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false }));
    flash.scale.set(0.7, 0.7, 1);
    flash.position.set(0.1, 1.18, -0.75);
    g.add(flash);
    this.scene.add(g);
    m = { group: g, head, flash };
    this.botMeshes.set(f.id, m);
    return m;
  }

  sync(state, dt, time) {
    const p = state.fighters[0];
    const eyeY = p.crouched ? CROUCH_EYE : EYE;
    this.camera.position.set(p.x, eyeY, p.z);
    this.camera.rotation.y = p.yaw;
    this.camera.rotation.x = p.pitch;
    // Viewmodel bob and recoil.
    const moving = Math.hypot(p.vx, p.vz);
    const bob = Math.sin(time * 9) * Math.min(1, moving / 5) * 0.012;
    this.vm.position.y = -0.28 + bob;
    this.vm.position.z = -0.55 + (state.lastShot && state.lastShot.from === p && time - state.lastShot.at < 0.09 ? 0.05 : 0);
    // Muzzle flash decay.
    const flashAge = state.lastShot && state.lastShot.from === p ? time - state.lastShot.at : 99;
    const on = flashAge < 0.06;
    this.flash.material.opacity = on ? 0.95 : 0;
    this.flashLight.intensity = on ? 14 : 0;
    // Water scroll, lantern flicker, rain fall.
    if (this.waterTex) this.waterTex.offset.y = (time * 0.02) % 1;
    this.lanternLights.forEach((l, i) => { l.intensity = 21 + Math.sin(time * 7 + i * 2.4) * 1.5; });
    const rp = this.rain.geometry.attributes.position.array;
    for (let i = 0; i < rp.length; i += 3) {
      rp[i + 1] -= dt * 11;
      if (rp[i + 1] < 0) { rp[i + 1] = 16 + Math.random() * 2; rp[i] = p.x + (Math.random() - 0.5) * 55; rp[i + 2] = p.z + (Math.random() - 0.5) * 45; }
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    // Tracers fade — unless the scene is frozen for a screenshot capture,
    // in which case a tracer stays up so the cover shows gunfire.
    const frozen = typeof window !== 'undefined' && window.__shotReady === true;
    for (const t of this.tracers) {
      if (t.life > 0 && !frozen) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.32) * 0.95;
      }
    }
    // Smoke puffs grow and thin out.
    for (const s of this.smokeSprites) {
      if (s.life > 0) {
        s.life -= dt * 0.12;
        const sc = s.sp.scale.x + dt * 0.5;
        s.sp.scale.set(sc, sc, 1);
        s.sp.material.opacity = Math.max(0, Math.min(0.5, s.life * 0.5));
      }
    }
    // Explosion.
    if (state.boom) {
      const age = time - state.boom.at;
      this.boomSprite.position.set(state.boom.x, 1.2, state.boom.z);
      this.boomSprite.material.opacity = Math.max(0, 0.95 - age * 1.4);
      const sc = 4 + age * 10;
      this.boomSprite.scale.set(sc, sc, 1);
      this.boomLight.position.set(state.boom.x, 1.5, state.boom.z);
      this.boomLight.intensity = Math.max(0, 40 - age * 60);
    } else {
      this.boomSprite.material.opacity = 0;
      this.boomLight.intensity = 0;
    }
    // Planted charge.
    if (state.bomb.state === 'planted') {
      this.charge.visible = true;
      this.charge.position.set(state.bomb.x, 0, state.bomb.z);
      this.chargeLight.material.color.setHex(Math.sin(time * 9) > 0 ? 0xff2a2a : 0x551111);
    } else this.charge.visible = false;
    // Bots.
    for (const f of state.fighters) {
      if (f.isPlayer) continue;
      const m = this.botMesh(f);
      if (!f.alive) {
        m.group.position.set(f.x, 0.3, f.z);
        m.group.rotation.z = Math.PI / 2;
        m.group.rotation.y = f.yaw;
        continue;
      }
      m.group.position.set(f.x, 0, f.z);
      m.group.rotation.set(0, f.yaw, 0);
      // Enemy muzzle flash: on while this bot fired within the last 60 ms.
      // In the frozen staged frame the clock stops, so the flash stays lit.
      const ef = state.enemyFlash;
      if (m.flash) m.flash.material.opacity = (ef && ef.bot === f && time - ef.at < 0.06) ? 0.95 : 0;
      // Walk swing on the legs is skipped: the group bobs instead.
      m.group.position.y = f.moving ? Math.abs(Math.sin(time * 8 + f.x)) * 0.05 : 0;
    }
    // A fresh tracer for the most recent shot.
    if (state.lastShot && !state.lastShot.drawn) {
      state.lastShot.drawn = true;
      const from = state.lastShot.from;
      const eye = from.crouched ? CROUCH_EYE : EYE;
      this.spawnTracer({ x: from.x, y: eye, z: from.z }, { x: state.lastShot.x, y: state.lastShot.y, z: state.lastShot.z });
    }
    // New smoke clouds.
    for (const sm of state.smokes) {
      if (!sm.spawned) { sm.spawned = true; this.spawnSmoke(sm.x, sm.z); }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
