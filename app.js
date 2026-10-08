import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/RoundedBoxGeometry.js";

/* ---------- Catalogue ---------- */
const MODELS = {
  armchair: { label: "Armchair", note: "1 seat", width: 0.96, seats: 1, price: 690 },
  loveseat: { label: "Loveseat", note: "2 seats", width: 1.64, seats: 2, price: 1190 },
  sofa: { label: "Sofa", note: "3 seats", width: 2.24, seats: 3, price: 1590 },
};
const FABRICS = {
  linen: { label: "Washed linen", note: "Breathable, relaxed", perSeat: 0 },
  boucle: { label: "Bouclé", note: "Soft looped texture", perSeat: 90 },
  velvet: { label: "Cotton velvet", note: "Rich, light-catching", perSeat: 120 },
  leather: { label: "Aniline leather", note: "Ages beautifully", perSeat: 310 },
};
const COLORS = {
  oat: { label: "Oat", hex: "#d6ccbb" },
  fog: { label: "Fog", hex: "#b4b9b5" },
  moss: { label: "Moss", hex: "#687a4d" },
  rust: { label: "Rust", hex: "#9a4b30" },
  mustard: { label: "Mustard", hex: "#c69c3a" },
  blush: { label: "Blush", hex: "#d4a49b" },
  navy: { label: "Ink blue", hex: "#2d3d58" },
  charcoal: { label: "Charcoal", hex: "#3b3b3a" },
};
const ARMS = {
  track: { label: "Track", note: "Crisp and square", width: 0.15, radius: 0.025, price: 0 },
  rolled: { label: "Rounded", note: "Soft, generous curves", width: 0.2, radius: 0.085, price: 60 },
};
const LEGS = {
  oak: { label: "Oak", note: "Tapered", color: "#c49a6c", metal: false, price: 0 },
  walnut: { label: "Walnut", note: "Tapered", color: "#5b3b27", metal: false, price: 90 },
  steel: { label: "Black steel", note: "Slim", color: "#1c1c1c", metal: true, price: 60 },
};
const PILLOW_PRICE = 79;

const DEFAULTS = { model: "loveseat", fabric: "boucle", color: "oat", arms: "rolled", legs: "walnut", legHeight: 14, pillows: true };

/* ---------- State (restored from share link) ---------- */
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const pick = (key, table) => (table[p.get(key)] ? p.get(key) : DEFAULTS[key]);
  const h = Number(p.get("h"));
  return {
    model: pick("model", MODELS),
    fabric: pick("fabric", FABRICS),
    color: pick("color", COLORS),
    arms: pick("arms", ARMS),
    legs: pick("legs", LEGS),
    legHeight: h >= 8 && h <= 24 ? h : DEFAULTS.legHeight,
    pillows: p.has("pillows") ? p.get("pillows") === "1" : DEFAULTS.pillows,
  };
}
const state = readHash();

function writeHash() {
  const p = new URLSearchParams({ ...state, h: state.legHeight, pillows: state.pillows ? "1" : "0" });
  p.delete("legHeight");
  history.replaceState(null, "", `#${p}`);
}

/* ---------- Renderer & scene ---------- */
const canvas = document.getElementById("scene");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
} catch (err) {
  document.getElementById("webgl-error").hidden = false;
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const stageColor = () => getComputedStyle(document.documentElement).getPropertyValue("--stage").trim();
scene.background = new THREE.Color(stageColor());
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => scene.background.set(stageColor()));

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 2.2;
controls.maxDistance = 7;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.target.set(0, 0.42, 0);
controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
controls.autoRotateSpeed = 0.6;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a80, 1.3));
const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
key.position.set(2.5, 4, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -2.5; key.shadow.camera.right = 2.5;
key.shadow.camera.top = 2.5; key.shadow.camera.bottom = -2.5;
key.shadow.radius = 6;
key.shadow.bias = -0.0005;
scene.add(key);
const fill = new THREE.DirectionalLight(0xe6efff, 0.6);
fill.position.set(-3, 2, -1);
scene.add(fill);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.22 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

/* ---------- Procedural fabric textures (bump maps) ---------- */
function makeTexture(draw, repeat) {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, size, size);
  draw(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  return tex;
}
const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const TEXTURES = {
  linen: makeTexture((g, n) => {
    for (let i = 0; i < n; i += 2) {
      g.fillStyle = `rgba(0,0,0,${0.08 + rand() * 0.12})`; g.fillRect(0, i, n, 1);
      g.fillStyle = `rgba(255,255,255,${0.05 + rand() * 0.1})`; g.fillRect(i, 0, 1, n);
    }
  }, 6),
  boucle: makeTexture((g, n) => {
    for (let i = 0; i < 2600; i++) {
      g.beginPath(); g.arc(rand() * n, rand() * n, 1.5 + rand() * 3, 0, Math.PI * 2);
      g.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)"; g.fill();
    }
  }, 5),
  velvet: makeTexture((g, n) => {
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.05})`; g.fillRect(rand() * n, rand() * n, 2, 2); }
  }, 3),
  leather: makeTexture((g, n) => {
    for (let i = 0; i < 900; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.08 + rand() * 0.15})`; g.lineWidth = 0.7;
      g.beginPath(); const x = rand() * n, y = rand() * n; g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 14, y + (rand() - 0.5) * 14); g.stroke();
    }
  }, 4),
};

function fabricMaterial(fabricKey, hex) {
  const common = { color: new THREE.Color(hex), bumpMap: TEXTURES[fabricKey] };
  switch (fabricKey) {
    case "linen": return new THREE.MeshStandardMaterial({ ...common, roughness: 0.95, bumpScale: 1.2 });
    case "boucle": return new THREE.MeshStandardMaterial({ ...common, roughness: 1, bumpScale: 3 });
    case "velvet": return new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.8, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), 0.45), bumpScale: 0.4 });
    case "leather": return new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.5, bumpScale: 0.6 });
  }
}

/* ---------- Build the sofa from parts ---------- */
let sofa = null;
let fabricMat = null;
let pillowMat = null;

function box(w, h, d, r, mat) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2, h / 2, d / 2)), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function pillowContrast(hex) {
  const c = new THREE.Color(hex);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return lum > 0.45 ? COLORS.charcoal.hex : COLORS.oat.hex;
}

function buildSofa() {
  if (sofa) {
    sofa.traverse((o) => o.geometry?.dispose());
    scene.remove(sofa);
  }
  fabricMat?.dispose();
  pillowMat?.dispose();

  const m = MODELS[state.model];
  const arm = ARMS[state.arms];
  const leg = LEGS[state.legs];
  const L = state.legHeight / 100; // leg height in metres
  const W = m.width, D = 0.92;
  const innerW = W - arm.width * 2;

  fabricMat = fabricMaterial(state.fabric, COLORS[state.color].hex);
  pillowMat = fabricMaterial(state.fabric === "leather" ? "linen" : state.fabric, pillowContrast(COLORS[state.color].hex));
  const legMat = new THREE.MeshStandardMaterial({ color: leg.color, roughness: leg.metal ? 0.35 : 0.6, metalness: leg.metal ? 0.8 : 0 });

  const g = new THREE.Group();
  const baseH = 0.18;
  const seatTop = L + baseH;

  // Base platform
  const base = box(W - 0.02, baseH, D, 0.03, fabricMat);
  base.position.set(0, L + baseH / 2, 0);
  g.add(base);

  // Back frame
  const backH = 0.48;
  const back = box(W - 0.02, backH, 0.17, arm.radius * 0.8 + 0.02, fabricMat);
  back.position.set(0, seatTop + backH / 2 - 0.01, -D / 2 + 0.085);
  g.add(back);

  // Arms
  const armH = 0.6;
  for (const side of [-1, 1]) {
    const a = box(arm.width, armH, D, arm.radius, fabricMat);
    a.position.set(side * (W / 2 - arm.width / 2), L + armH / 2, 0);
    g.add(a);
  }

  // Seat and back cushions
  const gap = 0.012;
  const cw = innerW / m.seats;
  const seatD = D - 0.2;
  for (let i = 0; i < m.seats; i++) {
    const x = -innerW / 2 + cw * (i + 0.5);
    const seat = box(cw - gap, 0.15, seatD, 0.05, fabricMat);
    seat.position.set(x, seatTop + 0.075, D / 2 - seatD / 2 - 0.005);
    g.add(seat);

    const bc = box(cw - gap, 0.44, 0.17, 0.07, fabricMat);
    bc.position.set(x, seatTop + 0.15 + 0.2, -D / 2 + 0.25);
    bc.rotation.x = -0.14;
    g.add(bc);
  }

  // Throw pillows, tucked into the corners
  if (state.pillows) {
    for (const side of [-1, 1]) {
      const p = box(0.4, 0.36, 0.12, 0.06, pillowMat);
      p.scale.set(1, 1, 0.9);
      p.position.set(side * (innerW / 2 - 0.24), seatTop + 0.15 + 0.2, -D / 2 + 0.4);
      p.rotation.set(-0.22, side * 0.35, side * -0.12);
      g.add(p);
    }
  }

  // Legs: four corners, plus a centre pair on wider pieces
  const legXs = [-W / 2 + 0.09, W / 2 - 0.09];
  if (m.seats === 3) legXs.push(0);
  const legGeo = leg.metal
    ? new THREE.CylinderGeometry(0.012, 0.012, L, 12)
    : new THREE.CylinderGeometry(0.024, 0.014, L, 16);
  for (const x of legXs) {
    for (const z of [-D / 2 + 0.09, D / 2 - 0.09]) {
      const l = new THREE.Mesh(legGeo, legMat);
      l.position.set(x, L / 2, z);
      l.castShadow = true;
      g.add(l);
    }
  }

  sofa = g;
  scene.add(sofa);

  const totalH = seatTop + 0.15 + 0.2 + 0.25;
  document.getElementById("dims").textContent =
    `W ${Math.round(W * 100)} × D ${Math.round(D * 100)} × H ${Math.round(Math.max(totalH, seatTop + backH) * 100)} cm · seat height ${Math.round((seatTop + 0.15) * 100)} cm`;
}

// Smooth colour change without rebuilding geometry
let colorTween = null;
function tweenColor(hex) {
  const from = fabricMat.color.clone();
  const to = new THREE.Color(hex);
  const start = performance.now();
  colorTween = (now) => {
    const t = Math.min(1, (now - start) / 350);
    fabricMat.color.copy(from).lerp(to, t);
    if (fabricMat.sheenColor) fabricMat.sheenColor.copy(fabricMat.color).lerp(new THREE.Color("#ffffff"), 0.45);
    if (t === 1) {
      colorTween = null;
      pillowMat.color.set(pillowContrast(hex));
    }
  };
}

/* ---------- Camera views ---------- */
const VIEWS = {
  front: new THREE.Vector3(0, 0.9, 4.2),
  angle: new THREE.Vector3(2.7, 1.5, 3.3),
  side: new THREE.Vector3(4.2, 0.9, 0.2),
};
let camTween = null;
function goToView(name, instant = false) {
  const scale = MODELS[state.model].width / 1.64 * 0.35 + 0.75;
  const target = VIEWS[name].clone().multiplyScalar(scale);
  if (instant) { camera.position.copy(target); return; }
  const from = camera.position.clone();
  const start = performance.now();
  controls.autoRotate = false;
  camTween = (now) => {
    const t = Math.min(1, (now - start) / 800);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    camera.position.lerpVectors(from, target, e);
    if (t === 1) camTween = null;
  };
}

/* ---------- UI ---------- */
const $ = (id) => document.getElementById(id);
const money = (n) => `$${n.toLocaleString("en-US")}`;

function optionGroup(containerId, table, stateKey, extra) {
  const el = $(containerId);
  el.setAttribute("role", "radiogroup");
  el.innerHTML = "";
  for (const [key, item] of Object.entries(table)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "option";
    b.setAttribute("role", "radio");
    b.dataset.key = key;
    b.innerHTML = `<strong></strong><span></span>`;
    b.querySelector("strong").textContent = item.label;
    b.querySelector("span").textContent = extra ? extra(item) : item.note;
    b.addEventListener("click", () => {
      state[stateKey] = key;
      update(stateKey);
    });
    el.appendChild(b);
  }
}

function swatches() {
  const el = $("opt-color");
  el.setAttribute("role", "radiogroup");
  for (const [key, c] of Object.entries(COLORS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.style.setProperty("--c", c.hex);
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", c.label);
    b.title = c.label;
    b.dataset.key = key;
    b.addEventListener("click", () => { state.color = key; update("color"); });
    el.appendChild(b);
  }
}

function priceLines() {
  const m = MODELS[state.model];
  const lines = [
    [`${m.label}, ${ARMS[state.arms].label.toLowerCase()} arms`, m.price + ARMS[state.arms].price],
    [`${FABRICS[state.fabric].label} in ${COLORS[state.color].label.toLowerCase()}`, FABRICS[state.fabric].perSeat * m.seats],
    [`${LEGS[state.legs].label} legs, ${state.legHeight} cm`, LEGS[state.legs].price + (state.legHeight >= 20 ? 30 : 0)],
  ];
  if (state.pillows) lines.push(["Two throw pillows", PILLOW_PRICE]);
  return lines;
}

function syncUI() {
  for (const [id, key] of [["opt-model", "model"], ["opt-fabric", "fabric"], ["opt-arms", "arms"], ["opt-legs", "legs"], ["opt-color", "color"]]) {
    $(id).querySelectorAll("[role=radio]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.key === state[key])));
  }
  $("color-name").textContent = COLORS[state.color].label;
  $("leg-height").value = state.legHeight;
  $("leg-height-out").textContent = `${state.legHeight} cm`;
  $("opt-pillows").checked = state.pillows;
  $("product-name").textContent = `The Hollis ${MODELS[state.model].label.toLowerCase()}`;

  const lines = priceLines();
  $("breakdown").innerHTML = lines.map(([label, cost]) => `<dt>${label}</dt><dd>${cost ? money(cost) : "Included"}</dd>`).join("");
  $("price").textContent = money(lines.reduce((sum, [, c]) => sum + c, 0));
}

function update(changed) {
  if (changed === "color") tweenColor(COLORS[state.color].hex);
  else buildSofa();
  syncUI();
  writeHash();
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}

optionGroup("opt-model", MODELS, "model", (m) => `${m.note} · ${Math.round(m.width * 100)} cm`);
optionGroup("opt-fabric", FABRICS, "fabric");
optionGroup("opt-arms", ARMS, "arms");
optionGroup("opt-legs", LEGS, "legs");
swatches();

$("leg-height").addEventListener("input", (e) => { state.legHeight = +e.target.value; update("legHeight"); });
$("opt-pillows").addEventListener("change", (e) => { state.pillows = e.target.checked; update("pillows"); });
document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => goToView(b.dataset.view)));

$("share").addEventListener("click", async () => {
  writeHash();
  try {
    await navigator.clipboard.writeText(location.href);
    toast("Share link copied");
  } catch {
    prompt("Copy this link to share your design:", location.href);
  }
});

$("save-image").addEventListener("click", () => {
  renderer.render(scene, camera);
  const a = document.createElement("a");
  a.href = renderer.domElement.toDataURL("image/png");
  a.download = `hollis-${state.model}-${state.color}.png`;
  a.click();
  toast("Image saved");
});

const hint = $("hint");
controls.addEventListener("start", () => {
  controls.autoRotate = false;
  hint.classList.add("gone");
});

window.addEventListener("hashchange", () => {
  Object.assign(state, readHash());
  buildSofa();
  syncUI();
});

/* ---------- Render loop ---------- */
function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 48 : 35;
    camera.updateProjectionMatrix();
  }
}

buildSofa();
syncUI();
goToView("angle", true);

renderer.setAnimationLoop((now) => {
  resize();
  colorTween?.(now);
  camTween?.(now);
  controls.update();
  renderer.render(scene, camera);
});
