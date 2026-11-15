// First-person EVA view: the camera stands on the computed route at eye height on the same DEM mesh as the 3D Terrain
// scene, drawn at true scale (x1) or with heights x3 (visual exaggeration only), textured with the grid's real ortho.
// Ground, guidance, markers and camera all use the one drawn geometry; no reading or route value depends on it. Guidance chevrons and route markers are placed
// on that surface. Nothing else is drawn: no rocks, sky model, lighting or weather, because the data has none.
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { RouteResult, TerrainMeta } from "@ares/contracts";
import { projToScene, type TerrainGrid } from "@ares/core";
import { chooseDefaultStyle, groundDetail, MARS, SkyDome } from "./atmosphere.tsx";
import type { RouteMarker } from "./routeMarkers.ts";
import { useApp } from "./store.ts";
import { buildTerrainMesh } from "./terrainMesh.ts";
import { displayPose, GUIDANCE_GAP_M, guidanceMarks } from "./walk.ts";

const CAUTION_DEG = 15; // same display cue as the HUD
const LIFT_M = 0.15; // guidance sits just above the surface so it is not z-fighting with it

class Boundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Terrain({ meta, grid, url, ve, cinematic, onReady }: { meta: TerrainMeta; grid: TerrainGrid; url: string; ve: number; cinematic: boolean; onReady: (ok: boolean) => void }) {
  const gl = useThree((s) => s.gl);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const geometry = useMemo(() => {
    const mesh = buildTerrainMesh(meta, grid.dem, ve), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    return g;
  }, [meta, grid, ve]);
  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(url, (t) => {
      if (!alive) return t.dispose();
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = gl.capabilities.getMaxAnisotropy();
      t.needsUpdate = true;
      setTexture(t);
      onReady(true);
    }, undefined, () => alive && onReady(false));
    return () => { alive = false; };
  }, [url, gl, onReady]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return (
    <mesh geometry={geometry}>
      {/* cinematic: local contrast from the ortho itself plus fine grain near the walker; scientific: the image as stored */}
      <meshBasicMaterial key={`${texture?.uuid ?? "flat"}-${cinematic}`} ref={(m: THREE.MeshBasicMaterial | null) => { if (m && texture && cinematic) groundDetail(m, texture); }}
        map={texture ?? undefined} color={texture ? "#ffffff" : "#6f5a4a"} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Chevrons lying on the terrain along the computed route, pointing the way to walk; amber on steep steps. */
function Guidance({ meta, grid, route, ve }: { meta: TerrainMeta; grid: TerrainGrid; route: RouteResult; ve: number }) {
  const geometry = useMemo(() => {
    const pos: number[] = [], col: number[] = [], a = 0.38, b = 0.36; // half length and half width in metres: about a boot print apart
    for (const g of guidanceMarks(grid, route, GUIDANCE_GAP_M)) {
      const c = projToScene(meta, g, g.h, ve), rad = (g.bearing_deg * Math.PI) / 180;
      const tx = Math.sin(rad), tz = -Math.cos(rad), rise = Math.tan((g.slope_deg * Math.PI) / 180) * a * ve; // scene: north is -z; the drawn slope is exaggerated with the ground
      const P = (along: number, side: number) => [c.x + tx * along * a - tz * side * b, c.y + LIFT_M + rise * along, c.z + tz * along * a + tx * side * b];
      const tip = P(1, 0), left = P(-1, -1), right = P(-1, 1), notch = P(0.15, 0);
      pos.push(...tip, ...left, ...notch, ...tip, ...notch, ...right);
      const rgb = Math.abs(g.slope_deg) >= CAUTION_DEG ? [1, 0.71, 0.33] : [0.44, 0.84, 1];
      for (let k = 0; k < 6; k++) col.push(...rgb);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }, [meta, grid, route, ve]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshBasicMaterial vertexColors transparent opacity={0.62} side={THREE.DoubleSide} toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  );
}

function label(text: string, colour: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(9, 14, 20, 0.82)";
    ctx.fillRect(4, 8, 376, 64);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 8, 376, 64);
    ctx.fillStyle = "#e8eef4";
    ctx.font = "600 30px Bahnschrift, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 192, 41, 360);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, sizeAttenuation: false, toneMapped: false }));
  sprite.scale.set(0.2, 0.2 * (80 / 384), 1);
  return sprite;
}

/** Route-information markers as posts standing on the terrain at their route vertex. Hills hide them, as they would. */
function Markers({ meta, route, marks, nextId, activeId, ve }: { meta: TerrainMeta; route: RouteResult; marks: RouteMarker[]; nextId: string | null; activeId: string | null; ve: number }) {
  const group = useMemo(() => {
    const root = new THREE.Group();
    marks.forEach((m, k) => {
      const base = projToScene(meta, route.vertices_proj[m.index], route.profile[m.index].h_m, ve);
      const colour = m.id === activeId ? "#ffe066" : m.id === nextId ? "#ffffff" : m.kind === "steepest" || m.kind === "ground" || m.kind === "cross" ? "#ffb454" : m.kind === "science" ? "#4fe0c0" : "#6fd6ff";
      const post = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(base.x, base.y, base.z), new THREE.Vector3(base.x, base.y + 2.6, base.z)]), new THREE.LineBasicMaterial({ color: colour }));
      const tag = label(`${k + 1} · ${m.title}`, colour);
      tag.position.set(base.x, base.y + 3.1, base.z);
      root.add(post, tag);
    });
    return root;
  }, [meta, route, marks, nextId, activeId, ve]);
  useEffect(() => () => group.traverse((o) => {
    const mesh = o as THREE.Line | THREE.Sprite;
    (mesh.geometry as THREE.BufferGeometry | undefined)?.dispose();
    const mat = mesh.material as (THREE.Material & { map?: THREE.Texture }) | undefined;
    mat?.map?.dispose();
    mat?.dispose();
  }), [group]);
  return <primitive object={group} />;
}

/** The walker's camera. It reads the one shared playhead every frame, so it moves with the HUD readouts and mini-map. */
function Walker({ meta, grid, route, ve }: { meta: TerrainMeta; grid: TerrainGrid; route: RouteResult; ve: number }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const target = useRef<THREE.Vector3 | null>(null);
  const last = useRef(-1);
  useFrame((_, dt) => {
    const playhead = useApp.getState().playhead;
    const pose = displayPose(grid, route, playhead * route.length_horizontal_m, ve, meta.h_min);
    const e0 = projToScene(meta, pose.eye, meta.h_min, 1), l0 = projToScene(meta, pose.look, meta.h_min, 1);
    const eye = { x: e0.x, y: pose.eye.y, z: e0.z }, look = { x: l0.x, y: pose.look.y, z: l0.z };
    const to = new THREE.Vector3(look.x, look.y, look.z);
    // ease the gaze so a grid step does not snap the view; jump straight there after a scrub or a route change
    if (!target.current || Math.abs(playhead - last.current) > 0.02) target.current = to;
    else target.current.lerp(to, 1 - Math.exp(-dt * 5));
    last.current = playhead;
    camera.position.set(eye.x, eye.y, eye.z);
    camera.lookAt(target.current);
    const d = gl.domElement.dataset;
    d.s = (playhead * route.length_horizontal_m).toFixed(2);
    d.clearance = pose.clearance_m.toFixed(3);
    d.ve = String(ve);
    d.eye = `${eye.x.toFixed(2)},${eye.y.toFixed(2)},${eye.z.toFixed(2)}`;
    d.frames = String(Number(d.frames ?? 0) + 1);
    d.heading = ((Math.atan2(look.x - eye.x, eye.z - look.z) * 180) / Math.PI).toFixed(2); // where walkPose points, before easing
  });
  return null;
}

export default function EvaView3D({ meta, grid, orthoUrl, route, marks, nextId, activeId, ve, onFail }: {
  meta: TerrainMeta; grid: TerrainGrid; orthoUrl: string; route: RouteResult; marks: RouteMarker[]; nextId: string | null; activeId: string | null; ve: number; onFail: () => void;
}) {
  const [texture, setTexture] = useState<"loading" | "ready" | "unavailable">("loading");
  const cinematic = useApp((s) => s.cinematic === true);
  const camera = useMemo(() => ({ fov: 62, near: 0.1, far: Math.max(meta.nx * meta.dx_ground_m, meta.ny * meta.dy_ground_m) * 3 }), [meta]);
  const onReady = useMemo(() => (ok: boolean) => setTexture(ok ? "ready" : "unavailable"), []);
  return (
    <div className="hud-world" data-testid="eva-world" data-texture={texture} data-style={cinematic ? "cinematic" : "scientific"}>
      <Boundary onFail={onFail}>
        <Canvas camera={camera} gl={{ antialias: true, preserveDrawingBuffer: true }} onCreated={({ gl }) => {
          gl.domElement.dataset.testid = "eva-canvas";
          chooseDefaultStyle(gl.getContext());
          gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onFail(); });
        }}>
          <color attach="background" args={[cinematic ? MARS.haze : "#3a2e26"]} />
          {cinematic ? <SkyDome radius={camera.far * 0.9} /> : null}
          {/* haze thickens with distance; it is scaled to the grid so the far edge stays readable */}
          {cinematic ? <fogExp2 attach="fog" args={[MARS.haze, 2.7 / camera.far]} /> : null}
          <Terrain meta={meta} grid={grid} url={orthoUrl} ve={ve} cinematic={cinematic} onReady={onReady} />
          <Guidance meta={meta} grid={grid} route={route} ve={ve} />
          <Markers meta={meta} route={route} marks={marks} nextId={nextId} activeId={activeId} ve={ve} />
          <Walker meta={meta} grid={grid} route={route} ve={ve} />
        </Canvas>
      </Boundary>
    </div>
  );
}
