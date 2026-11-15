import { RegionalRelief } from "./RegionalRelief.tsx";
import { isExplore, MISSIONS } from "./missions.ts";
import { groundScaleX } from "@ares/core";
import { Component, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { RouteMarkerCard } from "./RouteMarkerCard.tsx";
import { chooseDefaultStyle, MARS, SkyDome, ViewStyleToggle } from "./atmosphere.tsx";
import { GateNotice } from "./TraversePanel.tsx";
import { EnvToggle, EnvironmentKey } from "./EnvironmentPanel.tsx";
import { ROUTE_HEX, ROUTE_IDS, type RouteId } from "./plan.ts";
import { useRouteMarkers } from "./useRouteMarkers.ts";
import { routeTerrain, type StepTerrain } from "./traverse.ts";
import * as THREE from "three";
import { displayTextureUrl } from "./displayDrape.ts";
import { poiCoordinateSummary } from "./poiStatus.ts";
import { flyClearance, overviewCamera, sampleFlyalong } from "./flyalong.ts";
import {
  drapeRouteOnHirise,
  hiriseLevelForMaxTexture,
  hiriseUnavailable,
  HIRISE_ROUTE_NOTICE,
  loadHiriseDisplay,
  type HiriseLevel,
  type HirisePackage,
} from "./hirise.ts";
import { buildTerrainMesh, routeScenePositions, type RouteDisplayPath } from "./terrainMesh.ts";
import { bGridMissing, useApp } from "./store.ts";

const VE_STEPS = [1, 2.5, 10] as const; // ×2.5 replaced ×5 on the owner's request (15 Nov 2026)
const DEFAULT_PATH_SPEED_MPS = 80;
const ROUTE_COLOR = ROUTE_HEX;

type FocusPoint = { x: number; y: number; z: number };

class TerrainErrorBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    this.props.onError(error.message);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function frameSpan(nx: number, ny: number, dx: number, dy: number): number {
  return Math.max(nx * dx, ny * dy);
}

function configureTexture(loaded: THREE.Texture, gl: THREE.WebGLRenderer): void {
  loaded.flipY = false;
  loaded.colorSpace = THREE.SRGBColorSpace;
  loaded.wrapS = THREE.ClampToEdgeWrapping;
  loaded.wrapT = THREE.ClampToEdgeWrapping;
  loaded.generateMipmaps = true;
  loaded.minFilter = THREE.LinearMipmapLinearFilter;
  loaded.magFilter = THREE.LinearFilter;
  loaded.anisotropy = gl.capabilities.getMaxAnisotropy();
  loaded.needsUpdate = true;
}

function hiriseLines(labels: HirisePackage["labels"]): string[] {
  const median = labels.median > 0 ? `+${labels.median.toFixed(2)}` : labels.median.toFixed(2);
  const north = `${Math.abs(labels.offsetNorth).toFixed(2)} m ${labels.offsetNorth < 0 ? "S" : "N"}`;
  return [
    `HiRISE DTM and orthomosaic, USGS Astrogeology (${labels.dois.map((doi) => `doi:${doi}`).join(", ")}). Display only.`,
    `Vertical datum UNVERIFIED. CTX − HiRISE median ${median} m (SD ${labels.std.toFixed(2)} m); HiRISE heights not adjusted.`,
    `Horizontal offset vs CTX ortho: ${labels.offsetEast.toFixed(2)} m E, ${north} (±${labels.uncertaintyM} m); no correction applied.`,
    `DTM shows ${labels.lineCount} east–west line artifacts (${labels.stepMedian.toFixed(2)}–${labels.stepMax.toFixed(2)} m); processing artifacts, not terrain.`,
    "HiRISE images acquired 2006–2017, before the 2021 landing.",
    "Route computed on CTX 20 m; drawn on HiRISE (display only). Not validated for human walking.",
  ];
}

function roundPair(x: number, y: number, z: number): string {
  return `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
}

function OrbitRig({
  span,
  extent,
  fitToken,
  engaged,
  playingRef,
  focusRef,
}: {
  span: number;
  extent: { w: number; h: number };
  fitToken: number;
  engaged: boolean;
  playingRef: MutableRefObject<boolean>;
  focusRef: MutableRefObject<FocusPoint | null>;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const orbitRef = useRef<OrbitControls | null>(null);
  const lastFocusKey = useRef("");
  const framedRef = useRef(false);
  const framedFit = useRef(0);
  const overview = useMemo(() => overviewCamera(span), [span]);
  const size = useThree((state) => state.size);
  // The overview pose was tuned for a wide (~1.6:1) canvas; back off on narrower canvases so the whole grid stays framed.
  const fit = Math.max(1, 1.6 / Math.max(0.3, size.width / Math.max(1, size.height)));

  useEffect(() => {
    const refit = framedRef.current && !playingRef.current && size.width > 0 && Math.abs(framedFit.current - fit) > 0.05;
    if (!framedRef.current || refit) {
      framedFit.current = fit;
      camera.position.set(overview.position[0] * fit, overview.position[1] * fit, overview.position[2] * fit);
      camera.near = 0.5;
      camera.far = span * 12;
      camera.lookAt(...overview.target);
      camera.updateProjectionMatrix();
      framedRef.current = true;
    }
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.target.set(...overview.target);
    orbit.enableDamping = true;
    orbit.maxPolarAngle = Math.PI / 2 - 0.08;
    orbit.minDistance = span * 0.12;
    orbit.maxDistance = span * 3;
    orbit.enabled = !playingRef.current;
    orbit.update();
    orbitRef.current = orbit;
    return () => {
      orbit.dispose();
      orbitRef.current = null;
    };
  }, [camera, gl, span, overview, playingRef, fit, size.width]);

  useEffect(() => {
    if (fitToken === 0 || playingRef.current) return;
    const cam = camera as THREE.PerspectiveCamera;
    const vfov = (cam.fov * Math.PI) / 180;
    const aspect = size.width / Math.max(1, size.height);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const radius = Math.hypot(extent.w, extent.h) / 2;
    const dist = (0.6 * radius) / Math.sin(Math.min(vfov, hfov) / 2); // 0.6: a flat grid seen obliquely is much smaller than its bounding sphere
    const dir = new THREE.Vector3(...overview.position).sub(new THREE.Vector3(...overview.target)).normalize();
    cam.position.copy(new THREE.Vector3(...overview.target).addScaledVector(dir, dist));
    cam.far = Math.max(cam.far, dist * 4);
    cam.lookAt(...overview.target);
    cam.updateProjectionMatrix();
    if (orbitRef.current) {
      orbitRef.current.target.set(...overview.target);
      orbitRef.current.maxDistance = Math.max(orbitRef.current.maxDistance, dist * 1.5);
      orbitRef.current.update();
    }
  }, [fitToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lower priority runs first: FlyCam (-1) before OrbitRig (0). Neither takes over rendering.
  useFrame(() => {
    const orbit = orbitRef.current;
    const focus = focusRef.current;
    // Read the live play flag so Resume disables orbit before React re-renders.
    const enabled = !playingRef.current;
    if (orbit) {
      orbit.enabled = enabled;
      if (enabled && engaged && focus) {
        const key = roundPair(focus.x, focus.y, focus.z);
        orbit.target.set(focus.x, focus.y, focus.z);
        if (key !== lastFocusKey.current) {
          // Pose just applied by fly/scrub/pause: clamp once so update() cannot push the camera out.
          const dist = camera.position.distanceTo(orbit.target);
          orbit.minDistance = Math.min(span * 0.12, Math.max(0.01, dist));
          orbit.enableDamping = false;
          orbit.update();
          orbit.enableDamping = true;
          lastFocusKey.current = key;
        } else {
          // Leave minDistance alone except a small floor so the user can zoom back in after wheel-out.
          if (orbit.minDistance > 5) orbit.minDistance = 5;
          orbit.update();
        }
      } else if (!engaged) {
        orbit.minDistance = span * 0.12;
        orbit.maxDistance = span * 3;
        orbit.enableDamping = true;
        lastFocusKey.current = "";
        if (enabled) orbit.update();
      } else if (enabled) {
        orbit.update();
      }
    }
    const tx = orbit ? orbit.target.x : focus?.x ?? 0;
    const ty = orbit ? orbit.target.y : focus?.y ?? 0;
    const tz = orbit ? orbit.target.z : focus?.z ?? 0;
    gl.domElement.dataset.cam = roundPair(camera.position.x, camera.position.y, camera.position.z);
    gl.domElement.dataset.target = roundPair(tx, ty, tz);
  }, 0);

  return null;
}

function FlyCam({
  path,
  lengthHorizontalM,
  playingRef,
  engaged,
  speedMps,
  ve,
  focusRef,
  onEnded,
}: {
  path: RouteDisplayPath;
  lengthHorizontalM: number;
  playingRef: MutableRefObject<boolean>;
  engaged: boolean;
  speedMps: number;
  ve: number;
  focusRef: MutableRefObject<FocusPoint | null>;
  onEnded: () => void;
}) {
  const camera = useThree((state) => state.camera);
  const lastApplied = useRef<number | null>(null);
  const wasPlaying = useRef(false);
  const ramp = useRef(0);
  const profile = useMemo(
    () => Array.from(path.s_m, (s_m) => ({ s_m })),
    [path.s_m],
  );
  const clearance = flyClearance(ve);

  useFrame((_, dt) => {
    if (!engaged) return;
    const store = useApp.getState();
    let playhead = store.playhead;
    const playing = playingRef.current;
    if (playing && lengthHorizontalM > 0) {
      const step = Math.min(dt, 0.1); // a slow frame must not make the camera jump far along the path
      ramp.current = wasPlaying.current ? Math.min(1, ramp.current + step / 0.5) : 0; // ease in over half a second after Play or Resume
      playhead = Math.min(1, playhead + (speedMps * ramp.current * step) / lengthHorizontalM);
      if (playhead !== store.playhead) store.setPlayhead(playhead);
      if (playhead >= 1) {
        store.setPlayhead(1);
        playhead = 1;
        onEnded();
      }
      wasPlaying.current = true;
    } else if (lastApplied.current === playhead && !wasPlaying.current) {
      return;
    } else {
      wasPlaying.current = false;
    }
    const pose = sampleFlyalong(path.positions, profile, lengthHorizontalM, playhead, clearance);
    if (!pose) return;
    camera.position.set(pose.camera[0], pose.camera[1], pose.camera[2]);
    camera.lookAt(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
    camera.updateProjectionMatrix();
    lastApplied.current = playhead;
    focusRef.current = { x: pose.lookAt[0], y: pose.lookAt[1], z: pose.lookAt[2] };
  }, -1);

  return null;
}

function Surface({ url, onStatus }: { url: string; onStatus: (status: "loading" | "ready" | "unavailable") => void }) {
  const gl = useThree((state) => state.gl);
  const cinematic = useApp((state) => state.cinematic === true);
  const meta = useApp((state) => state.meta);
  const grid = useApp((state) => state.grid);
  const ve = useApp((state) => state.ve);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [textureFailed, setTextureFailed] = useState(false);
  const mesh = useMemo(() => (meta && grid ? buildTerrainMesh(meta, grid.dem, ve) : null), [meta, grid, ve]);
  const geometry = useMemo(() => {
    if (!mesh || mesh.indices.length === 0) return null;
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    next.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
    next.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    next.computeVertexNormals();
    return next;
  }, [mesh]);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      setTextureFailed(true);
      onStatus("unavailable");
      return;
    }
    onStatus("loading");
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (loaded) => {
        if (!alive) {
          loaded.dispose();
          return;
        }
        configureTexture(loaded, gl);
        setTexture(loaded);
        setTextureFailed(false);
        onStatus("ready");
      },
      undefined,
      () => {
        if (alive) {
          setTextureFailed(true);
          onStatus("unavailable");
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [url, onStatus, gl]);

  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => texture?.dispose(), [texture]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        key={texture?.uuid ?? "flat"}
        map={texture ?? undefined}
        color={texture ? (cinematic ? MARS.tint : "#ffffff") : "#8a6a52"}
        toneMapped={false}
      />
      {textureFailed && <group />}
    </mesh>
  );
}

function makeLabelSprite(text: string, fill: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(16, 12, 10, 0.78)";
    ctx.fillRect(8, 12, canvas.width - 16, canvas.height - 24);
    ctx.strokeStyle = fill;
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 12, canvas.width - 16, canvas.height - 24);
    ctx.fillStyle = fill;
    ctx.font = "bold 28px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(32, 8, 1);
  sprite.renderOrder = 5;
  return sprite;
}

function RouteEndpoints({ positions, color }: { positions: Float32Array; color: string }) {
  const group = useMemo(() => {
    if (positions.length < 6) return null;
    const root = new THREE.Group();
    const start = makeLabelSprite("START", color);
    start.position.set(positions[0]!, positions[1]! + 2.5, positions[2]!);
    const end = makeLabelSprite("DESTINATION", color);
    const i = positions.length - 3;
    end.position.set(positions[i]!, positions[i + 1]! + 2.5, positions[i + 2]!);
    root.add(start, end);
    return { root, start, end };
  }, [positions, color]);

  useEffect(() => () => {
    if (!group) return;
    for (const sprite of [group.start, group.end]) {
      const material = sprite.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
    }
  }, [group]);

  if (!group) return null;
  return <primitive object={group.root} />;
}

/** One route as a screen-width line with a dark casing, so it reads on bright and dark terrain at any camera distance.
 *  Shortest distance is cyan and dashed, terrain-aware is orange and solid (the same code as the 2D map); the selected one is wider. */
function routeLinePair(positions: Float32Array, mode: RouteId, active: boolean, outline?: Float32Array) {
  const geometry = new LineGeometry();
  geometry.setPositions(positions);
  if (outline) geometry.setColors(outline);
  // polygon offset pulls the line towards the camera in depth only: it stops flickering against the surface it lies on,
  // while a ridge in front of the route still hides it
  const depth = { polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 };
  const under = outline
    ? new LineMaterial({ color: "#ffffff", vertexColors: true, linewidth: 11, transparent: true, opacity: 0.95, ...depth }) // inspection overlay: measured slope classes
    : new LineMaterial({ color: "#0b1016", linewidth: active ? 6.5 : 0.01, transparent: true, opacity: active ? 0.55 : 0, ...depth }); // quiet casing under the selected route only
  const over = new LineMaterial({ color: ROUTE_COLOR[mode], linewidth: active ? 4 : 2, ...depth });
  const underLine = new Line2(geometry, under);
  const overLine = new Line2(geometry, over);
  underLine.position.y = active ? -0.35 : -0.2;
  overLine.position.y = active ? 0.35 : 0.1;
  return { geometry, under, over, underLine, overLine };
}

/** Route-information markers of the selected route as clickable labels on the terrain (start and destination already have labels). */
function RouteMarkers3D({ positions, s_m }: { positions: Float32Array; s_m: Float64Array }) {
  const activeId = useApp((state) => state.routeMarkerId);
  const select = useApp((state) => state.selectRouteMarker);
  const marks = useRouteMarkers();
  const sprites = useMemo(() => {
    return marks.flatMap((m, k) => {
      if (m.kind === "start" || m.kind === "goal") return [];
      let i = 0;
      while (i < s_m.length - 1 && s_m[i]! < m.s_m) i += 1;
      const sprite = makeLabelSprite(`${k + 1} ${m.title}`, m.id === activeId ? "#ffffff" : m.kind === "steepest" || m.kind === "ground" || m.kind === "cross" ? "#ffb454" : m.kind === "science" ? "#4fe0c0" : "#6fd6ff");
      sprite.position.set(positions[i * 3]!, positions[i * 3 + 1]! + 2.5, positions[i * 3 + 2]!);
      return [{ id: m.id, sprite }];
    });
  }, [marks, positions, s_m, activeId]);
  useEffect(() => () => {
    for (const { sprite } of sprites) {
      const material = sprite.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
    }
  }, [sprites]);
  return (
    <>
      {sprites.map(({ id, sprite }) => (
        <primitive key={id} object={sprite} onClick={(event: { stopPropagation: () => void }) => { event.stopPropagation(); select(id === activeId ? null : id); }} />
      ))}
    </>
  );
}

/** The same markers as buttons, with the shared card: the keyboard and screen-reader route to what the labels show. */
function RouteMarkerPanel() {
  const activeId = useApp((state) => state.routeMarkerId);
  const select = useApp((state) => state.selectRouteMarker);
  const marks = useRouteMarkers();
  if (marks.length === 0) return null;
  return (
    <div className="marker3d" data-testid="marker3d-panel">
      <h3>Route markers</h3>
      <div className="row">
        {marks.map((m, k) => (
          <button key={m.id} type="button" data-testid={`marker3d-${m.id}`} aria-pressed={m.id === activeId} onClick={() => select(m.id === activeId ? null : m.id)}>{k + 1} {m.title}</button>
        ))}
      </div>
      <RouteMarkerCard rms={marks} inline />
    </div>
  );
}

/** Outline colour per drawn point from the terrain slope under the route: dark below 15 deg, yellow 15-20, red above 20. */
function slopeOutline(s_m: Float64Array, steps: StepTerrain[]): Float32Array {
  const out = new Float32Array(s_m.length * 3);
  let j = 0;
  for (let i = 0; i < s_m.length; i++) {
    while (j < steps.length - 1 && steps[j]!.s_m < s_m[i]! - 1e-6) j += 1;
    const slope = steps[j]?.cell_slope_deg ?? 0;
    out.set(slope > 20 ? [1, 0.2, 0.2] : slope > 15 ? [1, 0.82, 0.2] : [0.043, 0.063, 0.086], i * 3);
  }
  return out;
}

function RouteLines({ slopeOverlay }: { slopeOverlay: boolean }) {
  const gl = useThree((state) => state.gl);
  const meta = useApp((state) => state.meta);
  const grid = useApp((state) => state.grid);
  const routes = useApp((state) => state.routes);
  const selected = useApp((state) => state.selectedRouteId);
  const ve = useApp((state) => state.ve);
  const lines = useMemo(() => {
    if (!meta || !grid) return [];
    return ROUTE_IDS.flatMap((mode) => {
      const route = routes[mode];
      if (!route || route.status !== "OK") return [];
      const drawn = routeScenePositions(meta, grid.dem, route.cells, route.vertices_proj, ve, route.profile);
      if (!drawn) return [];
      const active = mode === selected;
      const { geometry, under, over, underLine, overLine } = routeLinePair(drawn.positions, mode, active, active && slopeOverlay ? slopeOutline(drawn.s_m, routeTerrain(grid, route)) : undefined);
      underLine.renderOrder = 2;
      overLine.renderOrder = active ? 3 : 4; // the thin unselected line is drawn last, so it stays visible inside the wider selected one where they overlap
      return [{ mode, geometry, under, over, underLine, overLine, positions: drawn.positions, s_m: drawn.s_m, active }];
    });
  }, [meta, grid, routes, selected, ve, slopeOverlay]);
  useEffect(() => { gl.domElement.dataset.slopeOverlay = slopeOverlay ? "on" : "off"; gl.domElement.dataset.routeLines = String(lines.length); }, [gl, slopeOverlay, lines]);

  useEffect(() => () => {
    for (const line of lines) {
      line.geometry.dispose();
      line.under.dispose();
      line.over.dispose();
    }
  }, [lines]);

  const selectedLine = lines.find((line) => line.active);
  return (
    <>
      {lines.map((line) => (
        <group key={line.mode}>
          <primitive object={line.underLine} />
          <primitive object={line.overLine} />
        </group>
      ))}
      {selectedLine && <RouteEndpoints positions={selectedLine.positions} color={ROUTE_COLOR[selectedLine.mode]} />}
      {selectedLine && <RouteMarkers3D positions={selectedLine.positions} s_m={selectedLine.s_m} />}
    </>
  );
}

function HiriseMesh({ geometry, url, onFail }: { geometry: THREE.BufferGeometry; url: string; onFail: () => void }) {
  const gl = useThree((state) => state.gl);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (loaded) => {
        if (!alive) {
          loaded.dispose();
          return;
        }
        configureTexture(loaded, gl);
        setTexture(loaded);
      },
      undefined,
      () => {
        if (alive) onFailRef.current();
      },
    );
    return () => {
      alive = false;
    };
  }, [url, gl]);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial map={texture} color="#ffffff" toneMapped={false} />
    </mesh>
  );
}

function DrapedRoutes({ paths, selected }: { paths: Partial<Record<RouteId, RouteDisplayPath>>; selected: RouteId }) {
  const lines = useMemo(() => {
    return ROUTE_IDS.flatMap((mode) => {
      const drawn = paths[mode];
      if (!drawn) return [];
      const active = mode === selected;
      const { geometry, under, over, underLine, overLine } = routeLinePair(drawn.positions, mode, active);
      return [{ mode, geometry, under, over, underLine, overLine, positions: drawn.positions, s_m: drawn.s_m, active }];
    });
  }, [paths, selected]);

  useEffect(() => () => {
    for (const line of lines) {
      line.geometry.dispose();
      line.under.dispose();
      line.over.dispose();
    }
  }, [lines]);

  const selectedLine = lines.find((line) => line.active);
  return (
    <>
      {lines.map((line) => (
        <group key={line.mode}>
          <primitive object={line.underLine} />
          <primitive object={line.overLine} />
        </group>
      ))}
      {selectedLine && <RouteEndpoints positions={selectedLine.positions} color={ROUTE_COLOR[selectedLine.mode]} />}
      {selectedLine && <RouteMarkers3D positions={selectedLine.positions} s_m={selectedLine.s_m} />}
    </>
  );
}

function TerrainViewInner() {
  const meta = useApp((state) => state.meta);
  const grid = useApp((state) => state.grid);
  const ve = useApp((state) => state.ve);
  const setVe = useApp((state) => state.setVe);
  const setScene = useApp((state) => state.setScene);
  const layers = useApp((state) => state.layers);
  const orthoUrl = useApp((state) => state.orthoUrl);
  const hillshadeUrl = useApp((state) => state.hillshadeUrl);
  const routes = useApp((state) => state.routes);
  const selectedRouteId = useApp((state) => state.selectedRouteId);
  const selectRoute = useApp((state) => state.selectRoute);
  const setPlayhead = useApp((state) => state.setPlayhead);
  const playhead = useApp((state) => state.playhead);
  const pois = useApp((state) => state.pois);
  const region = useApp((state) => state.region);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const cinematic = useApp((state) => state.cinematic === true);
  const [slopeOverlay, setSlopeOverlay] = useState(false); // S9 inspection overlay: off by default so the route reads as one clean line
  const [textureStatus, setTextureStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [playing, setPlaying] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [speedMps, setSpeedMps] = useState(DEFAULT_PATH_SPEED_MPS);
  const focusRef = useRef<FocusPoint | null>(null);
  const playingRef = useRef(false);
  const canvasCameraRef = useRef<{ fov: number; position: [number, number, number]; near: number; far: number } | null>(null);
  const maxTexRef = useRef(0);
  const [displayMode, setDisplayMode] = useState<"ctx" | "hirise">("ctx");
  // The legacy HiRISE display layer belongs to ROI-A only; M0-A is already a HiRISE analysis grid.
  useEffect(() => {
    if (region === "m0a") setDisplayMode("ctx");
  }, [region]);
  const [hiriseLevel, setHiriseLevel] = useState<HiriseLevel>("low");
  const [hirisePkg, setHirisePkg] = useState<HirisePackage | null>(null);
  const [hiriseUrl, setHiriseUrl] = useState("");
  const [hiriseNotice, setHiriseNotice] = useState("");
  const [hiriseBusy, setHiriseBusy] = useState(false);
  const textureUrl = displayTextureUrl(null, layers.ortho ? orthoUrl : layers.hillshade ? hillshadeUrl : "");
  const hirisePaths = useMemo(() => {
    if (displayMode !== "hirise" || !hirisePkg || !meta) return null;
    const paths: Partial<Record<RouteId, RouteDisplayPath>> = {};
    for (const mode of ROUTE_IDS) {
      const route = routes[mode];
      if (!route || route.status !== "OK") continue;
      const drawn = drapeRouteOnHirise(meta.h_min, hirisePkg.grid, hirisePkg.heights, route.vertices_proj, route.profile, ve);
      if (!drawn) return null;
      paths[mode] = drawn;
    }
    return paths;
  }, [displayMode, hirisePkg, meta, routes, ve]);
  const hiriseGeometry = useMemo(() => {
    if (!hirisePkg || !meta || displayMode !== "hirise") return null;
    const mesh = buildTerrainMesh({ ...hirisePkg.grid, h_min: meta.h_min }, hirisePkg.heights, ve);
    if (mesh.indices.length === 0) return null;
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    next.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
    next.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    next.computeVertexNormals();
    return next;
  }, [hirisePkg, meta, ve, displayMode]);

  useEffect(() => () => {
    hiriseGeometry?.dispose();
  }, [hiriseGeometry]);

  useEffect(() => () => {
    if (hiriseUrl.startsWith("blob:")) URL.revokeObjectURL(hiriseUrl);
  }, [hiriseUrl]);

  useEffect(() => {
    if (displayMode === "hirise" && hirisePkg && !hirisePaths) {
      setDisplayMode("ctx");
      setHiriseNotice(HIRISE_ROUTE_NOTICE);
    }
  }, [displayMode, hirisePkg, hirisePaths]);

  const setPlayingNow = (next: boolean) => {
    playingRef.current = next;
    setPlaying(next);
  };

  const back = () => {
    setPlayingNow(false);
    setEngaged(false);
    focusRef.current = null;
    setScene("PLANNING");
  };

  const switchRoute = (id: RouteId) => {
    setPlayingNow(false);
    const fraction = useApp.getState().playhead;
    selectRoute(id);
    setPlayhead(fraction);
  };

  const showCtx = () => {
    setPlayingNow(false);
    setDisplayMode("ctx");
    setHiriseNotice("");
  };

  const showHirise = async (requested: HiriseLevel) => {
    if (!meta) return;
    setPlayingNow(false);
    setHiriseBusy(true);
    setHiriseNotice("");
    // 0 means the canvas has not reported a size yet. That is not a small GPU.
    const measured = maxTexRef.current;
    const level = measured > 0 ? hiriseLevelForMaxTexture(requested, measured) : requested;
    if (!level) {
      setDisplayMode("ctx");
      setHiriseNotice(hiriseUnavailable(`MAX_TEXTURE_SIZE ${maxTexRef.current}`));
      setHiriseBusy(false);
      return;
    }
    const loaded = await loadHiriseDisplay(async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return new Uint8Array(await response.arrayBuffer());
      } catch {
        return null;
      }
    }, meta, level);
    if (!loaded.ok) {
      setDisplayMode("ctx");
      setHiriseNotice(hiriseUnavailable(loaded.failure.detail));
      setHiriseBusy(false);
      return;
    }
    const copy = new Uint8Array(loaded.value.textureBytes.byteLength);
    copy.set(loaded.value.textureBytes);
    const blob = new Blob([copy], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    setHiriseUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setHirisePkg(loaded.value);
    setHiriseLevel(level);
    setDisplayMode("hirise");
    setHiriseBusy(false);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key !== " ") return;
      event.preventDefault();
      setEngaged(true);
      setPlayingNow(!playingRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selected = routes[selectedRouteId];
  const ctxFlyPath = useMemo(() => {
    if (!meta || !grid || !selected || selected.status !== "OK") return null;
    return routeScenePositions(meta, grid.dem, selected.cells, selected.vertices_proj, ve, selected.profile);
  }, [meta, grid, selected, ve]);
  const flyPath = displayMode === "hirise" && hirisePaths?.[selectedRouteId]
    ? hirisePaths[selectedRouteId]
    : ctxFlyPath;

  if (!meta || !grid) {
    return (
      <section className="sheet" data-testid="terrain-error">
        <h2>3D terrain preview</h2>
        <p>Terrain data is not available. No surface was invented.</p>
        <button type="button" data-testid="return-2d" onClick={back}>Return to 2D</button>
      </section>
    );
  }

  if (webglError) {
    return (
      <section className="sheet" data-testid="terrain-error">
        <h2>3D terrain preview</h2>
        <p>WebGL did not start. {webglError}</p>
        <button type="button" data-testid="return-2d" onClick={back}>Return to 2D</button>
      </section>
    );
  }

  const span = frameSpan(meta.nx, meta.ny, meta.dx_proj * groundScaleX(meta), meta.dy_proj);
  const canFly = Boolean(flyPath && selected && selected.status === "OK" && selected.length_horizontal_m > 0);
  const playPct = Math.round(playhead * 100);
  // Keep one stable camera init object; a new position array each playhead tick resets the R3F camera to overview.
  if (!canvasCameraRef.current || canvasCameraRef.current.far !== span * 12) {
    const overview = overviewCamera(span);
    canvasCameraRef.current = { fov: 42, position: overview.position, near: 0.5, far: span * 12 };
  }

  return (
    <div className="terrain">
      <TerrainErrorBoundary onError={setWebglError}>
        <Canvas
          camera={canvasCameraRef.current}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          onCreated={({ gl }) => {
            gl.domElement.dataset.testid = "terrain-canvas";
            chooseDefaultStyle(gl.getContext());
            gl.domElement.dataset.cam = "";
            gl.domElement.dataset.target = "";
            maxTexRef.current = gl.capabilities.maxTextureSize;
            gl.domElement.addEventListener("webglcontextlost", (event) => {
              event.preventDefault();
              setDisplayMode("ctx");
              setHiriseNotice(hiriseUnavailable("WebGL context lost"));
            });
          }}
        >
          <color attach="background" args={[cinematic ? MARS.below : "#120e0c"]} />
          {cinematic ? <SkyDome radius={span * 9} below={MARS.below} /> : null}
          {cinematic ? <fog attach="fog" args={[MARS.haze, span * 1.6, span * 9]} /> : null}
          {displayMode === "hirise" && hiriseGeometry && hiriseUrl ? (
            <HiriseMesh geometry={hiriseGeometry} url={hiriseUrl} onFail={() => {
              setDisplayMode("ctx");
              setHiriseNotice(hiriseUnavailable("texture"));
            }} />
          ) : (
            <Surface url={textureUrl} onStatus={setTextureStatus} />
          )}
          {displayMode === "hirise" && hirisePaths ? <DrapedRoutes paths={hirisePaths} selected={selectedRouteId} /> : <RouteLines slopeOverlay={slopeOverlay} />}
          {engaged && canFly && flyPath && selected && selected.status === "OK" && (
            <FlyCam
              key={`${selectedRouteId}-${ve}-${displayMode}-${hiriseLevel}`}
              path={flyPath}
              lengthHorizontalM={selected.length_horizontal_m}
              playingRef={playingRef}
              engaged={engaged}
              speedMps={speedMps}
              ve={ve}
              focusRef={focusRef}
              onEnded={() => setPlayingNow(false)}
            />
          )}
          <OrbitRig span={span} extent={{ w: meta.nx * meta.dx_ground_m, h: meta.ny * meta.dy_ground_m }} fitToken={fitToken} engaged={engaged} playingRef={playingRef} focusRef={focusRef} />
        </Canvas>
      </TerrainErrorBoundary>

      <aside className="terrain-hud" aria-label="3D terrain status">
        <nav className="mission-nav" aria-label="Mission navigation" data-testid="mission-nav">
          <div className="mission-nav-head">
            <h2>Mission navigation</h2>
            <button type="button" data-testid="return-2d" onClick={back}>Return to 2D</button>
            <button type="button" data-testid="fit-terrain" onClick={() => setFitToken((t) => t + 1)}>Fit terrain</button>
            <button type="button" data-testid="open-relief" onClick={() => useApp.getState().setRelief3d(true)}>Regional relief (display only)</button>
          </div>
          <p>{region === "m0a" ? `3D terrain preview from the ${meta?.roi_id === "m0ab" ? "wider M0–A–B" : "M0–A"} HiRISE 2 m analysis grid (prototype).` : "3D terrain preview from the ROI-A DEM."} Play follows the selected route by horizontal distance along the path.</p>
          <GateNotice />
          <div className="row">
            <button type="button" className="primary" data-testid="start-eva" disabled={!canFly} onClick={() => { setPlayingNow(false); useApp.setState({ playhead: 0, evaAutoplay: true }); setScene("EVA_HUD"); }}>Start EVA walk</button>
            <span className="fine">First-person walk along the selected route. The flyover below is a separate, optional overview.</span>
          </div>
          <div className="row fly-controls">
            <button
              type="button"
              data-testid="fly-play"
              disabled={!canFly || playing}
              onClick={() => {
                setEngaged(true);
                setPlayingNow(true);
              }}
            >
              {engaged && !playing && playhead > 0 && playhead < 1 ? "Resume" : "Play"}
            </button>
            <button type="button" data-testid="fly-pause" disabled={!playing} onClick={() => setPlayingNow(false)}>
              Pause
            </button>
            <button
              type="button"
              data-testid="fly-restart"
              disabled={!canFly}
              onClick={() => {
                setPlayhead(0);
                setEngaged(true);
                setPlayingNow(true);
              }}
            >
              Restart
            </button>
            <button
              type="button"
              data-testid="fly-route-distance"
              aria-pressed={selectedRouteId === "distance"}
              onClick={() => switchRoute("distance")}
            >
              Distance
            </button>
            <button
              type="button"
              data-testid="fly-route-terrain"
              aria-pressed={selectedRouteId === "terrain"}
              onClick={() => switchRoute("terrain")}
            >
              Terrain-aware
            </button>
            <button type="button" data-testid="fly-route-conservative" aria-pressed={selectedRouteId === "conservative"} disabled={routes.conservative?.status !== "OK"} onClick={() => switchRoute("conservative")}>
              Conservative
            </button>
          </div>
          <label className="fly-speed">
            Path speed
            <input
              data-testid="fly-speed"
              type="range"
              min={20}
              max={200}
              step={10}
              value={speedMps}
              onChange={(event) => setSpeedMps(Number(event.target.value))}
            />
            <span data-testid="fly-speed-label">{speedMps} m/s of path (not walking time)</span>
          </label>
          <label className="fly-scrub">
            Playhead
            <input
              data-testid="fly-scrub"
              type="range"
              min={0}
              max={100}
              step={1}
              value={playPct}
              onChange={(event) => {
                setEngaged(true);
                setPlayingNow(false);
                setPlayhead(Number(event.target.value) / 100);
              }}
            />
            <span data-testid="fly-playhead">{playPct}%</span>
          </label>
        </nav>
        <RouteMarkerPanel />

        <div className="terrain-meta">
          {region === "m0a" ? (
            <>
              <p data-testid="display-toggle-label">Terrain: HiRISE-derived 2 m (ANALYSIS grid, {meta?.roi_id === "m0ab" ? "M0–A–B" : "M0–A"} prototype). The ROI-A HiRISE display layer does not apply here.</p>
              <p data-testid="analysis-dem">Analysis DEM: HiRISE 2 m ({meta.dataset_version})</p>
              <p data-testid="visualization-dem">Visualization DEM: the same HiRISE 2 m analysis grid, HiRISE ortho 1 m texture</p>
            </>
          ) : (<>
          <p data-testid="display-toggle-label">
            Terrain: CTX 20 m (analysis) | HiRISE {displayMode === "hirise" && hiriseLevel === "high" ? "2 m" : "4 m"} (display only)
          </p>
          <div className="row">
            <button type="button" data-testid="display-ctx" aria-pressed={displayMode === "ctx"} onClick={showCtx}>CTX 20 m</button>
            <button type="button" data-testid="display-hirise-4m" aria-pressed={displayMode === "hirise" && hiriseLevel === "low"} disabled={hiriseBusy} onClick={() => void showHirise("low")}>HiRISE 4 m</button>
            <button type="button" data-testid="display-hirise-2m" aria-pressed={displayMode === "hirise" && hiriseLevel === "high"} disabled={hiriseBusy} onClick={() => void showHirise("high")}>HiRISE 2 m</button>
          </div>
          <p data-testid="analysis-dem">Analysis DEM: CTX 20 m ({meta.dataset_version})</p>
          <p data-testid="visualization-dem">
            {displayMode === "hirise"
              ? `Visualization DEM: HiRISE ${hiriseLevel === "high" ? "2 m" : "4 m"} (display only)`
              : "Visualization DEM: CTX 20 m ortho"}
          </p>
          </>)}
          <p data-testid="hirise-notice">{hiriseNotice}</p>
          {displayMode === "hirise" && hirisePkg && (
            <details data-testid="hirise-provenance">
              <summary>HiRISE source notes</summary>
              {hiriseLines(hirisePkg.labels).map((line) => <p key={line}>{line}</p>)}
              <p>{hirisePkg.labels.credit}</p>
              <ul>
                {hirisePkg.labels.citations.map((item) => <li key={item}>{item}</li>)}
                {hirisePkg.labels.processing.map((item) => <li key={item}>{item}</li>)}
                {hirisePkg.labels.limitations.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </details>
          )}
          <p data-testid="ve-readout">VERTICAL EXAGGERATION ×{ve}</p>
          {ve !== 1 ? <p className="warn" data-testid="ve-warning">Heights are stretched ×{ve}: slopes look steeper than they are. A real 20° slope is drawn as {((Math.atan(ve * Math.tan((20 * Math.PI) / 180)) * 180) / Math.PI).toFixed(0)}°. Use ×1 to judge steepness.</p> : null}
          <ViewStyleToggle />
          <div className="row"><EnvToggle /></div>
          <EnvironmentKey />
          <label className="fine slope-toggle"><input type="checkbox" data-testid="slope-overlay-toggle" checked={slopeOverlay} onChange={(e) => setSlopeOverlay(e.target.checked)} /> Inspect terrain slope under the selected route</label>
          <p className="fine" data-testid="route-slope-legend">{slopeOverlay ? "Overlay on: the" : "Overlay off. When on, the"} selected route's outline is yellow where the ground under it is 15–20° steep and red above 20° (terrain slope, Horn 3×3; measured, not a safety rating). The numbers are always in Planning under “Terrain under the route”.</p>
          <div className="row">
            {VE_STEPS.map((step) => (
              <button key={step} type="button" aria-pressed={ve === step} onClick={() => setVe(step)}>×{step}</button>
            ))}
          </div>
          <ul className="legend terrain-legend" data-testid="route-legend">
            <li><span className="swatch" /> Distance</li>
            <li><span className="swatch swatch-t" /> Terrain-aware</li>
            <li><span className="swatch swatch-c" /> Conservative terrain{routes.conservative && routes.conservative.status !== "OK" ? ": no supported corridor" : ""}</li>
            <li>Labels: START → DESTINATION (selected route)</li>
          </ul>
          <p className="fine" data-testid="uncertainty">
            {poiCoordinateSummary(pois)}. Vertical datum is the DEM model height. Horizontal distances stay in metres. No measured EVA time or surface hazard is shown. Minetti costs stay as model limits only.
          </p>
          {region === "m0a"
            ? <p className="fine" data-testid="m0a-line">Candidate route corridor, not a surveyed path. Vertical datum UNVERIFIED; G1/S-4 and S6 remain open.</p>
            : <p className="fine" data-testid="s4-line">CTX DEM/image registration UNRESOLVED (S-4)</p>}
          {(layers.slope || layers.validity) && (
            <p className="fine">Slope and validity overlays stay on the 2D map.</p>
          )}
          <span className="sr" data-testid="terrain-texture">{textureStatus}</span>
          {!textureUrl && <p className="fine">CTX ortho unavailable; mesh still uses DEM heights.</p>}
        </div>
      </aside>
    </div>
  );
}

/** B has no validated terrain: show why instead of another region's terrain (S6). */
export function TerrainView() {
  const mission = useApp((state) => state.mission);
  const noGrid = useApp(bGridMissing), reason = useApp((state) => state.m0abReason);
  const setScene = useApp((state) => state.setScene);
  const relief3d = useApp((state) => state.relief3d);
  const setRelief3d = useApp((state) => state.setRelief3d);
  if (relief3d) return <RegionalRelief />;
  if (isExplore(mission) || noGrid) {
    return (
      <section className="sheet" data-testid="terrain-3d-disabled" data-mission={mission}>
        <h2>{MISSIONS[mission!].shortTitle}: 3D terrain not available</h2>
        <p>{MISSIONS[mission!].noRoute?.terrain ?? reason}</p>
        <p className="fine">No M0–A or ROI-A terrain or route is shown for {mission}.</p>
        <div className="row">
          <button type="button" onClick={() => setScene("PLANNING")}>Back to {mission} inspection</button>
          <button type="button" data-testid="open-relief" onClick={() => setRelief3d(true)}>Regional relief 3D (display only, coarse)</button>
          <button type="button" onClick={() => setScene("MISSION_CONTROL")}>Mission Control</button>
        </div>
      </section>
    );
  }
  return <TerrainViewInner />;
}
