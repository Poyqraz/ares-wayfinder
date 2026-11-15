// Mars Cinematic View: a visual treatment for the first-person EVA view and the 3D Terrain scene. Sky colour, haze,
// a warm tint and fine ground grain are rendering choices. They add no terrain, no obstacle and no measurement, and
// Scientific View turns all of them off. 2D maps and analytical colour layers never use any of this.
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { isHardwareWebgl } from "./gpu.ts";
import { useApp } from "./store.ts";

export const MARS = { horizon: "#a8937e", zenith: "#55473f", haze: "#998572", tint: "#fff1df", below: "#17120f" } as const;

/** A dusty sky: lighter and warmer at the horizon, darker overhead. It follows the camera and is drawn behind everything.
 *  Under the horizon it shows `below`: the haze colour for a walker, or a dark tone for a view from above. */
export function SkyDome({ radius, below = MARS.haze }: { radius: number; below?: string }) {
  const mesh = useRef<THREE.Mesh>(null);
  const camera = useThree((s) => s.camera);
  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { horizon: { value: new THREE.Color(MARS.horizon) }, zenith: { value: new THREE.Color(MARS.zenith) }, below: { value: new THREE.Color(below) } },
    vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 horizon; uniform vec3 zenith; uniform vec3 below; varying vec3 vDir; void main() { float y = normalize(vDir).y; vec3 c = y >= 0.0 ? mix(horizon, zenith, pow(y, 0.42)) : mix(horizon, below, clamp(-y * 3.0, 0.0, 1.0)); gl_FragColor = vec4(c, 1.0);\n#include <colorspace_fragment>\n}",
  }), [below]);
  useFrame(() => { mesh.current?.position.copy(camera.position); });
  return <mesh ref={mesh} material={material} renderOrder={-10} frustumCulled={false}><sphereGeometry args={[radius, 32, 16]} /></mesh>;
}

const NOISE = `
// lattice hash; the cell index is wrapped first because scene coordinates times the grain frequency exceed float precision
float gdHash(vec2 p) { p = mod(p, 1024.0); return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float gdNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gdHash(i), gdHash(i + vec2(1.0, 0.0)), f.x), mix(gdHash(i + vec2(0.0, 1.0)), gdHash(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
const DETAIL = `
#ifdef USE_MAP
{
  float gdDist = distance(vWorldPos, cameraPosition);
  float gdNear = 1.0 - smoothstep(4.0, 70.0, gdDist);
  if (gdNear > 0.0) {
    // local contrast taken from the ortho itself (unsharp mask): where the image is magnified, bring out what it already holds
    vec3 gdAround = (texture2D(map, vMapUv + vec2(uTexel.x, 0.0)).rgb + texture2D(map, vMapUv - vec2(uTexel.x, 0.0)).rgb
      + texture2D(map, vMapUv + vec2(0.0, uTexel.y)).rgb + texture2D(map, vMapUv - vec2(0.0, uTexel.y)).rgb) * 0.25;
    diffuseColor.rgb += (diffuseColor.rgb - gdAround) * 0.9 * gdNear;
    // fine grain below the image's resolution: brightness only, a few percent, no shapes, gone within a few tens of metres.
    // It is world-anchored noise, not a tiled texture and not data. Each grain size fades out at the distance where it
    // would shrink below about two pixels, so it never shimmers.
    // A size is only computed where it is still visible, which keeps the shader cheap.
    float gdN = (gdNoise(vWorldPos.xz * 4.0) - 0.5) * 0.26 * (1.0 - smoothstep(25.0, 65.0, gdDist))                    // about 25 cm
              + (gdNoise(vWorldPos.xz * 1.3) - 0.5) * 0.20 * (1.0 - smoothstep(35.0, 70.0, gdDist));                   // about 0.8 m, faint
    if (gdDist < 40.0) gdN += (gdNoise(vWorldPos.xz * 12.0) - 0.5) * 0.36 * (1.0 - smoothstep(15.0, 40.0, gdDist));    // about 8 cm
    if (gdDist < 16.0) gdN += (gdNoise(vWorldPos.xz * 40.0) - 0.5) * 0.34 * (1.0 - smoothstep(6.0, 16.0, gdDist));     // about 2.5 cm
    if (gdDist < 6.0) gdN += (gdNoise(vWorldPos.xz * 110.0) - 0.5) * 0.26 * (1.0 - smoothstep(2.0, 6.0, gdDist));      // about 1 cm
    diffuseColor.rgb *= 1.0 + gdN * 0.6; // typically within 8 % of the image brightness
  }
  diffuseColor.rgb *= uTint;
}
#endif
`;

/** Adds the near-ground treatment to a textured basic material. The geometry, the texture and its mapping are untouched. */
export function groundDetail(material: THREE.MeshBasicMaterial, texture: THREE.Texture): void {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const texel = new THREE.Vector2(1 / Math.max(1, image?.width ?? 1), 1 / Math.max(1, image?.height ?? 1));
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTexel = { value: texel };
    shader.uniforms.uTint = { value: new THREE.Color(MARS.tint) };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vWorldPos;\nuniform vec2 uTexel;\nuniform vec3 uTint;\n${NOISE}`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${DETAIL}`);
  };
  material.customProgramCacheKey = () => "ares-ground-detail";
}

/** Called once by a 3D scene with its own WebGL context: picks the starting style unless the user already chose one. */
export function chooseDefaultStyle(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
  if (useApp.getState().cinematic === null) useApp.getState().setCinematic(isHardwareWebgl(gl));
}

/** The two rendering styles, offered wherever the treatment is applied. */
export function ViewStyleToggle() {
  const cinematic = useApp((s) => s.cinematic === true);
  const setCinematic = useApp((s) => s.setCinematic);
  return (
    <div className="view-style" role="group" aria-label="Rendering style">
      <button type="button" data-testid="view-cinematic" aria-pressed={cinematic} onClick={() => setCinematic(true)}>Mars Cinematic View</button>
      <button type="button" data-testid="view-scientific" aria-pressed={!cinematic} onClick={() => setCinematic(false)}>Scientific View</button>
      <span className="fine" data-testid="view-style-note">{cinematic
        ? "Sky colour, haze, warm tint and fine ground grain are a visual treatment. Terrain, imagery and every measurement are unchanged."
        : "Plain rendering: the terrain image as stored, no sky, haze, tint or grain."}</span>
    </div>
  );
}
