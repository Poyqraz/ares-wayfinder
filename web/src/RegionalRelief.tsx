// Regional relief 3D (DISPLAY ONLY, CR-006): coarse 40 m relief under the controlled CTX 6 m image, with the same
// mission locations as the 2D Mission Control map drawn as selectable 3D markers. No route, slope or hazard is shown,
// and no line joins the regions; local detailed 3D stays limited to ROI-A and M0-A.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { fetchBytes } from "./load.ts";
import { MISSIONS } from "./missions.ts";
import { loadRegionalRelief, reliefScene, reliefUv, type LoadedRelief } from "./regionalRelief.ts";
import { RELIEF_COLOURS, RELIEF_FAR_M, reliefMarkers, type ReliefBox, type ReliefMarker } from "./reliefMarkers.ts";
import { useApp } from "./store.ts";
import { isExplore } from "./missions.ts";
import { buildTerrainMesh } from "./terrainMesh.ts";

type Focus = { x: number; y: number; z: number; dist: number; token: number };
const scratch = new THREE.Vector3();
const GROUP_LABEL: Record<ReliefMarker["group"], string> = { site: "Hypothetical ARES-1 sites", M0: MISSIONS.M0.shortTitle, A: MISSIONS.A.shortTitle, B: MISSIONS.B.shortTitle, C: MISSIONS.C.shortTitle, feature: "Terrain features" };

function Rig({ span, focus }: { span: number; focus: Focus | null }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const orbitRef = useRef<OrbitControls | null>(null);
  useEffect(() => {
    camera.position.set(0, span * 0.42, span * 0.62);
    camera.near = 5;
    camera.far = span * 10;
    camera.lookAt(0, 0, 0);
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.enableDamping = true;
    orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    orbit.minDistance = span * 0.006; // close enough to tell the depot's drop positions apart
    orbit.maxDistance = span * 3;
    orbit.addEventListener("change", () => invalidate()); // the scene is drawn on demand: only when the camera or the content changes
    orbitRef.current = orbit;
    let raf = 0;
    const tick = () => { orbit.update(); raf = requestAnimationFrame(tick); };
    tick();
    return () => { cancelAnimationFrame(raf); orbit.dispose(); orbitRef.current = null; };
  }, [camera, gl, span, invalidate]);
  useEffect(() => {
    const orbit = orbitRef.current;
    if (!orbit || !focus) return;
    if (focus.dist === 0) { // reset to the whole region
      orbit.target.set(0, 0, 0);
      camera.position.set(0, span * 0.42, span * 0.62);
    } else if (focus.dist < 0) { // same view, new height (the exaggeration changed): move target and camera together
      const offset = camera.position.clone().sub(orbit.target);
      orbit.target.set(focus.x, focus.y, focus.z);
      camera.position.copy(orbit.target).add(offset);
    } else { // keep the viewing direction, look at the marker from its focus distance
      const dir = camera.position.clone().sub(orbit.target).normalize();
      if (dir.y < 0.4) { dir.y = 0.4; dir.normalize(); }
      orbit.target.set(focus.x, focus.y, focus.z);
      camera.position.copy(orbit.target).addScaledVector(dir, focus.dist);
    }
    orbit.update();
    gl.domElement.dataset.focus = `${orbit.target.x.toFixed(1)},${orbit.target.z.toFixed(1)}`;
    invalidate();
  }, [focus?.token]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Relief({ relief, url, ve }: { relief: LoadedRelief; url: string; ve: number }) {
  const gl = useThree((s) => s.gl);
  const geometry = useMemo(() => {
    const { meta, dem } = relief;
    const mesh = buildTerrainMesh(meta, dem, ve);
    for (let row = 0; row < meta.ny; row++) {
      for (let col = 0; col < meta.nx; col++) {
        const k = mesh.vertexOfCell[row * meta.nx + col];
        if (k < 0) continue;
        const uv = reliefUv(meta, row, col); // map-coordinate UVs: texture extent differs from the grid by a few metres
        mesh.uvs[2 * k] = uv.u;
        mesh.uvs[2 * k + 1] = uv.v;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    g.computeVertexNormals();
    return g;
  }, [relief, ve]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(url, (t) => {
      if (!alive) return;
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = gl.capabilities.getMaxAnisotropy();
      setTexture(t);
    });
    return () => { alive = false; };
  }, [url, gl]);
  useEffect(() => {
    const el = gl.domElement;
    el.dataset.testid = "relief-canvas";
    el.dataset.texture = texture ? "ready" : "loading";
  }, [gl, texture]);
  return (
    <mesh geometry={geometry}>
      {/* keyed: three compiles the shader once; a map added later would otherwise never be sampled */}
      <meshLambertMaterial key={texture ? "textured" : "plain"} map={texture ?? undefined} color={texture ? "#ffffff" : "#5a4a40"} />
    </mesh>
  );
}

/** A text plate that keeps its size on screen. */
function labelSprite(text: string, colour: string): THREE.Sprite {
  const canvas = document.createElement("canvas"), probe = canvas.getContext("2d");
  const font = "600 26px Bahnschrift, Segoe UI, sans-serif";
  if (probe) probe.font = font;
  canvas.width = Math.ceil((probe?.measureText(text).width ?? text.length * 14) + 30);
  canvas.height = 44;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(9, 14, 20, 0.84)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 6, canvas.height);
    ctx.fillStyle = "#e8eef4";
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 16, 23);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, sizeAttenuation: false, depthTest: false, toneMapped: false }));
  sprite.scale.set((0.034 * canvas.width) / canvas.height, 0.034, 1);
  sprite.center.set(0, 0.5); // the plate starts at the pole and reads to the right
  sprite.renderOrder = 10;
  return sprite;
}

/** One marker, one unit tall: a pole on a ground ring with a head whose shape says what kind of thing it is. */
function markerObject(m: ReliefMarker, on: boolean): { group: THREE.Group; height: number; headAt: THREE.Vector3 } {
  const g = new THREE.Group(), colour = RELIEF_COLOURS[m.group], height = m.shape === "dot" ? 0.6 : 1;
  const solid = new THREE.MeshLambertMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.45 });
  const pale = new THREE.MeshBasicMaterial({ color: on ? "#ffffff" : "#cfd8e3" });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, height, 8), pale);
  pole.position.y = height / 2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.29, 32), new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(pole, ring);
  const head = (geometry: THREE.BufferGeometry, x = 0, y = height) => { const mesh = new THREE.Mesh(geometry, solid); mesh.position.set(x, y, 0); g.add(mesh); };
  if (m.shape === "pin") head(new THREE.SphereGeometry(0.2, 20, 14));
  else if (m.shape === "dot") head(new THREE.SphereGeometry(0.13, 16, 12));
  else if (m.shape === "diamond") head(new THREE.OctahedronGeometry(0.22));
  else {
    head(new THREE.BoxGeometry(0.5, 0.3, 0.03), 0.27, height - 0.15); // flag: proposed infrastructure, not an observation
    if (m.shape === "base") head(new THREE.SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0); // habitat dome
  }
  // the visible head is small on screen: an invisible sphere around it takes the click
  const headAt = m.shape === "flag" || m.shape === "base" ? new THREE.Vector3(0.27, height - 0.15, 0) : new THREE.Vector3(0, height, 0);
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.position.copy(headAt);
  g.add(hit);
  if (on) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 8, 32), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.05;
    g.add(halo);
  }
  return { group: g, height, headAt };
}

function dispose(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh | THREE.Sprite | THREE.Line;
    if (!(o instanceof THREE.Sprite)) (mesh.geometry as THREE.BufferGeometry | undefined)?.dispose(); // sprites share one geometry
    for (const mat of ([] as THREE.Material[]).concat((mesh.material as THREE.Material | THREE.Material[] | undefined) ?? [])) {
      (mat as THREE.Material & { map?: THREE.Texture }).map?.dispose();
      mat.dispose();
    }
  });
}

/** Markers, labels and grid outlines. Marker size and label density follow the camera distance every frame. */
function MissionLayer({ relief, ve, markers, boxes, selected, onSelect }: { relief: LoadedRelief; ve: number; markers: ReliefMarker[]; boxes: ReliefBox[]; selected: string | null; onSelect: (id: string) => void }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const span = Math.max(relief.meta.nx * relief.meta.dx_ground_m, relief.meta.ny * relief.meta.dy_ground_m);
  const active = markers.find((m) => m.id === selected)?.drawAs ?? selected; // a shared marker lights up for either identity
  const built = useMemo(() => {
    const items = markers.filter((m) => !m.drawAs).flatMap((m) => {
      const p = reliefScene(relief, m.lat, m.lon, ve);
      if (!p) return [];
      const { group, height, headAt } = markerObject(m, m.id === active);
      group.position.set(p.x, p.y, p.z);
      const label = labelSprite(m.label, RELIEF_COLOURS[m.group]), far = m.farLabel ? labelSprite(m.farLabel, RELIEF_COLOURS[m.group]) : null;
      let zone: THREE.Mesh | null = null;
      if (m.ring_m) { // the landing zone's scored disc at its true size, lying on the coarse surface
        zone = new THREE.Mesh(new THREE.RingGeometry(m.ring_m * 0.94, m.ring_m, 96), new THREE.MeshBasicMaterial({ color: RELIEF_COLOURS[m.group], side: THREE.DoubleSide, transparent: true, opacity: 0.75, depthTest: false }));
        zone.rotation.x = -Math.PI / 2;
        zone.position.set(p.x, p.y + 4, p.z);
        zone.renderOrder = 2;
      }
      return [{ m, pos: new THREE.Vector3(p.x, p.y, p.z), group, height, headAt, label, far, zone }];
    });
    const outlines = boxes.flatMap((b) => {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k < 4; k++) for (let i = 0; i <= 24; i++) {
        const a = b.corners[k], c = b.corners[(k + 1) % 4], p = reliefScene(relief, a.lat + ((c.lat - a.lat) * i) / 24, a.lon + ((c.lon - a.lon) * i) / 24, ve);
        if (p) pts.push(new THREE.Vector3(p.x, p.y + 6, p.z));
      }
      if (pts.length < 8) return [];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: b.id === selected ? "#ffffff" : "#4fe0c0", dashSize: 90, gapSize: 60, transparent: true, opacity: 0.95, depthTest: false }));
      line.computeLineDistances();
      line.renderOrder = 3;
      const label = labelSprite(b.label, "#4fe0c0");
      label.position.copy(pts[0]).add(new THREE.Vector3(0, 30, 0));
      return [{ b, line, label, at: pts[0] }];
    });
    // label priority when they would overlap: base and landing zone, the three investigations, other sites, features, then single targets
    const rank = (m: ReliefMarker) => (m.id === "site:base" || m.id === "site:landing_zone" ? 0 : m.id.startsWith("mission:") ? 1 : m.group === "site" ? 2 : m.group === "feature" ? 3 : m.shape === "dot" && !m.id.startsWith("drop:") ? 4 : 5);
    return { items, outlines, order: [...items].sort((a, b) => rank(a.m) - rank(b.m)) };
  }, [relief, ve, markers, boxes, active, selected]);
  useEffect(() => () => { for (const it of built.items) { dispose(it.group); dispose(it.label); if (it.far) dispose(it.far); if (it.zone) dispose(it.zone); } for (const o of built.outlines) { dispose(o.line); dispose(o.label); } }, [built]);
  useFrame(() => {
    let labels = 0;
    for (const it of built.items) {
      const d = camera.position.distanceTo(it.pos), s = Math.min(span * 0.016, Math.max(5, d * 0.03));
      it.group.scale.setScalar(s);
      it.group.visible = d < it.m.showWithin_m;
      const far = !!it.far && d >= RELIEF_FAR_M;
      it.label.visible = it.group.visible && d < it.m.labelWithin_m && !far;
      it.label.position.set(it.pos.x, it.pos.y + s * (it.height + 0.35), it.pos.z);
      if (it.far) { it.far.visible = far; it.far.position.copy(it.label.position); }
    }
    for (const o of built.outlines) o.label.visible = o.b.id === "roi_a" || camera.position.distanceTo(o.at) < RELIEF_FAR_M;
    // declutter on screen: the selected marker's label first, then in marker order; a label that would cover one already placed is hidden
    const cam = camera as THREE.PerspectiveCamera, tan = Math.tan((cam.fov * Math.PI) / 360), taken: number[][] = [];
    const place = (sprite: THREE.Sprite | null) => {
      if (!sprite?.visible) return false;
      const v = scratch.copy(sprite.position).project(cam), w = sprite.scale.x / tan / cam.aspect, h = sprite.scale.y / tan, pad = 0.012;
      const r = [v.x - pad, v.y - h / 2 - pad, v.x + w + pad, v.y + h / 2 + pad];
      if (v.z > 1 || taken.some((t) => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])) return (sprite.visible = false);
      taken.push(r);
      return true;
    };
    const first = built.items.find((it) => it.m.id === active);
    const selectedShown = first ? place(first.label) || place(first.far) : false;
    for (const it of built.order) if (it !== first) { place(it.label); place(it.far); }
    for (const o of built.outlines) place(o.label);
    labels = taken.length;
    const data = gl.domElement.dataset;
    data.markers = String(built.items.length);
    data.shown = String(built.items.filter((it) => it.group.visible).length);
    data.labels = String(labels);
    data.selected = selected ?? "";
    data.selectedLabel = selectedShown ? "shown" : "";
    data.selectedAt = first ? `${first.pos.x.toFixed(1)},${first.pos.z.toFixed(1)}` : "";
    const w = gl.domElement.clientWidth, h = gl.domElement.clientHeight;
    data.pick = built.items.filter((it) => it.group.visible).map((it) => { const v = scratch.copy(it.headAt).multiplyScalar(it.group.scale.y).add(it.pos).project(cam); return `${it.m.id}=${(((v.x + 1) / 2) * w).toFixed(0)},${(((1 - v.y) / 2) * h).toFixed(0)}`; }).join(";");
  });
  return (
    <>
      {built.items.map((it) => (
        <group key={it.m.id}>
          <primitive object={it.group} onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect(it.m.id); }} />
          <primitive object={it.label} />
          {it.far ? <primitive object={it.far} /> : null}
          {it.zone ? <primitive object={it.zone} /> : null}
        </group>
      ))}
      {built.outlines.map((o) => <group key={o.b.id}><primitive object={o.line} /><primitive object={o.label} /></group>)}
    </>
  );
}

export function RegionalRelief() {
  const regional = useApp((s) => s.regional);
  const base = useApp((s) => s.base);
  const science = useApp((s) => s.science);
  const features = useApp((s) => s.features);
  const mission = useApp((s) => s.mission);
  const setRelief3d = useApp((s) => s.setRelief3d);
  const setScene = useApp((s) => s.setScene);
  const [relief, setRelief] = useState<LoadedRelief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ve, setVe] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  useEffect(() => {
    if (!regional) return;
    let alive = true;
    void loadRegionalRelief(fetchBytes, regional.meta.version).then((r) => {
      if (!alive) return;
      if (r.ok) setRelief(r.value);
      else setError(`${r.failure.kind}: ${r.failure.detail}`);
    });
    return () => { alive = false; };
  }, [regional]);
  const wide = useApp((s) => s.m0ab?.meta.bounds_geo ?? null);
  const { markers, boxes } = useMemo(() => (regional ? reliefMarkers({ regional, base, science, features, wide }) : { markers: [], boxes: [] }), [regional, base, science, features, wide]);
  const span = relief ? Math.max(relief.meta.nx * relief.meta.dx_ground_m, relief.meta.ny * relief.meta.dy_ground_m) : 1;
  const token = () => (focus?.token ?? 0) + 1;
  /** Where a marker or grid outline stands on the drawn relief at a given exaggeration. */
  const at = (id: string, k: number) => {
    const m = markers.find((x) => x.id === id), b = boxes.find((x) => x.id === id);
    const g = m ? { lat: m.lat, lon: m.lon } : b ? { lat: (b.corners[0].lat + b.corners[2].lat) / 2, lon: (b.corners[0].lon + b.corners[2].lon) / 2 } : null;
    return relief && g ? reliefScene(relief, g.lat, g.lon, k) : null;
  };
  const select = (id: string | null) => {
    setSelected(id);
    if (!relief || id === null) return;
    const p = at(id, ve);
    if (p) setFocus({ x: p.x, y: p.y, z: p.z, dist: markers.find((x) => x.id === id)?.focus_m ?? 3500, token: token() });
  };
  const changeVe = (k: number) => {
    setVe(k);
    const p = relief && selected ? at(selected, k) : null;
    if (p) setFocus({ x: p.x, y: p.y, z: p.z, dist: -1, token: token() }); // the selected marker stays selected and stays in the middle of the view
  };
  const open = (m: ReliefMarker) => {
    const s = useApp.getState();
    setRelief3d(false);
    setScene("MISSION_CONTROL");
    if (m.open.kind === "site") s.inspectSite(m.open.key);
    else if (m.open.kind === "mission") s.selectMission(m.open.id);
    else if (m.open.kind === "target") s.inspectTarget(m.open.id);
    else s.inspectFeature(m.open.id);
  };
  const chip = (m: ReliefMarker) => <button key={m.id} type="button" className="target-chip" data-testid={`relief-marker-${m.id}`} aria-pressed={selected === m.id} onClick={() => select(selected === m.id ? null : m.id)}>{m.label}</button>;
  const chosen = markers.find((m) => m.id === selected) ?? null, chosenBox = boxes.find((b) => b.id === selected) ?? null;
  return (
    <div className="terrain relief" data-testid="regional-relief">
      <div className="relief-stage">
        {relief && regional ? (
          <Canvas camera={{ fov: 42, position: [0, span * 0.42, span * 0.62], near: 5, far: span * 10 }} gl={{ antialias: true, preserveDrawingBuffer: true }} frameloop="demand">
            <ambientLight intensity={0.75} />
            <directionalLight position={[-span, span, span * 0.4]} intensity={0.7} />
            <Rig span={span} focus={focus} />
            <Relief relief={relief} url={regional.imageUrl} ve={ve} />
            <MissionLayer relief={relief} ve={ve} markers={markers} boxes={boxes} selected={selected} onSelect={select} />
          </Canvas>
        ) : <p className="sheet" data-testid="relief-status">{error ? `Regional relief unavailable (${error}).` : "Checking the regional relief bundle."}</p>}
      </div>
      <aside className="terrain-hud" aria-label="Regional relief status">
        <div className="mission-nav">
          <h2>Regional relief 3D — display only</h2>
          <p data-testid="relief-label" className="warn">
            Coarse relief for orientation only: USGS TRN CTX DTM (20 m) averaged to 40 m, effective resolution ~100 m, under the
            controlled CTX 6 m image. No routing, slope, hazard or traversability information. Markers show where things are;
            no route is validated between these regions.
          </p>
          <div className="row">
            <button type="button" data-testid="relief-back" onClick={() => setRelief3d(false)}>{isExplore(mission) ? `Back (${mission} detailed 3D not available)` : "Local detailed 3D"}</button>
            <button type="button" onClick={() => { setRelief3d(false); setScene("MISSION_CONTROL"); }}>Mission Control</button>
            <button type="button" data-testid="relief-reset" onClick={() => { setSelected(null); setFocus({ x: 0, y: 0, z: 0, dist: 0, token: token() }); }}>Whole region</button>
          </div>
          <p data-testid="relief-ve-readout">VERTICAL EXAGGERATION ×{ve}</p>
          <div className="row">
            {[1, 3].map((k) => <button key={k} type="button" aria-pressed={ve === k} data-testid={`relief-ve-${k}`} onClick={() => changeVe(k)}>×{k}</button>)}
          </div>
        </div>
        {chosen ? (
          <div className="inspector relief-card" data-testid="relief-card" data-marker={chosen.id} style={{ borderColor: RELIEF_COLOURS[chosen.group] }}>
            <div className="inspector-head"><h3>{chosen.title}</h3><button type="button" data-testid="relief-card-close" onClick={() => setSelected(null)}>Close</button></div>
            <p className="fine"><span className="tag" style={{ background: RELIEF_COLOURS[chosen.group] }}>{GROUP_LABEL[chosen.group]}</span> {chosen.kind}</p>
            <p><strong>Why it matters.</strong> {chosen.why}</p>
            <p className="fine" data-testid="relief-evidence">{chosen.evidence}</p>
            <p className="fine warn" data-testid="relief-card-limits">{chosen.limits}</p>
            <p className="fine">On this relief the marker stands on 40 m cells at the same latitude and longitude as on the 2D map; exaggeration ×{ve} changes only its height.</p>
            <div className="row"><button type="button" className="primary" data-testid="relief-open-mc" onClick={() => open(chosen)}>Open in Mission Control</button></div>
          </div>
        ) : chosenBox ? (
          <div className="inspector relief-card" data-testid="relief-card" data-marker={chosenBox.id}>
            <div className="inspector-head"><h3>{chosenBox.label}</h3><button type="button" data-testid="relief-card-close" onClick={() => setSelected(null)}>Close</button></div>
            <p>{chosenBox.note}</p>
            <p className="fine warn">Outside the dashed boxes there is no validated terrain grid, so no route exists there, including between ROI-A and the delta grids, and to Bright Angel.</p>
          </div>
        ) : <p className="fine" data-testid="relief-hint">Select a marker in the scene or below. Labels appear as you move closer, so the terrain stays visible.</p>}
        <div className="relief-groups" data-testid="relief-markers">
          {(["site", "M0", "A", "B", "C", "feature"] as const).map((g) => (
            <details key={g} className="relief-group" open>
              <summary><span className="lg" style={{ background: RELIEF_COLOURS[g] }} />{GROUP_LABEL[g]} <span className="fine">({markers.filter((m) => m.group === g).length})</span></summary>
              <div className="chips">{markers.filter((m) => m.group === g && !m.id.startsWith("drop:")).map(chip)}</div>
              {g === "M0" ? <><p className="fine relief-sub">Depot samples: rover position at each drop, never the tube</p><div className="chips">{markers.filter((m) => m.id.startsWith("drop:")).map(chip)}</div></> : null}
            </details>
          ))}
          <details className="relief-group" open>
            <summary><span className="lg lg-grid" />Terrain grids (routes are computed only inside)</summary>
            <div className="chips">
              {boxes.map((b) => <button key={b.id} type="button" className="target-chip" data-testid={`relief-marker-${b.id}`} aria-pressed={selected === b.id} onClick={() => select(selected === b.id ? null : b.id)}>{b.label}</button>)}
            </div>
          </details>
          <p className="fine">Shapes: sphere = NASA rover position or waypoint (never a tube, rock or core point); flag and dome = hypothetical ARES-1 site; diamond = terrain feature anchor; ring on the ground = the scored landing disc at true size.</p>
        </div>
        {relief ? (
          <div className="terrain-meta fine" data-testid="relief-limits">
            <p>Dataset {relief.meta.dataset_version}; grid {relief.meta.nx} × {relief.meta.ny} at {relief.meta.dx_proj} m (eqc lat_ts 0, same frame as the regional image).</p>
            <p>Registration to the imagery: {relief.meta.gates.R3_registration} (a 10–20 m north offset is plausible). Vertical reference: {relief.meta.gates.R4_vertical_reference}.</p>
            <p>Detailed terrain and routes exist only in ROI-A (CTX 20 m) M0–A and the wider M0–A–B grid (HiRISE 2 m). C (Bright Angel) has no validated detailed terrain.</p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
