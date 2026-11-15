/** Scene units above the drawn route for the camera. Not a walking height. */
export const FLY_CLEARANCE = 100;

/** Look-ahead along horizontal path metres when the remaining length allows it. */
export const LOOK_AHEAD_M = 140;

/** Horizontal metres behind the path point. Keeps a 42° view pitched below the horizon. */
export const FLY_TRAIL_M = 50;

/** Camera height in scene units above the path. Scales with VE; not a walking height. */
export function flyClearance(ve: number): number {
  return FLY_CLEARANCE * Math.max(1, ve / 2);
}

/** Overview camera offset so the DEM fills more of the viewport than a distant orbit. */
export function overviewCamera(span: number): { position: [number, number, number]; target: [number, number, number] } {
  return {
    position: [span * 0.05, span * 0.32, span * 0.42],
    target: [0, span * 0.02, 0],
  };
}

export interface FlyPose {
  camera: [number, number, number];
  lookAt: [number, number, number];
  path: [number, number, number];
}

function lerp3(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  t: number,
): [number, number, number] {
  return [ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t];
}

/** Interpolate the drawn route at horizontal distance s_m along profile[].s_m. */
export function pointAtDistance(
  positions: Float32Array,
  profile: ReadonlyArray<{ s_m: number }>,
  sM: number,
): [number, number, number] | null {
  if (profile.length === 0 || positions.length < 3 || positions.length !== profile.length * 3) return null;
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (!first || !last) return null;
  if (sM <= first.s_m) return [positions[0]!, positions[1]!, positions[2]!];
  if (sM >= last.s_m) {
    const i = (profile.length - 1) * 3;
    return [positions[i]!, positions[i + 1]!, positions[i + 2]!];
  }
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if (!a || !b || sM > b.s_m) continue;
    const span = b.s_m - a.s_m;
    const t = span === 0 ? 0 : (sM - a.s_m) / span;
    const ia = (i - 1) * 3;
    const ib = i * 3;
    return lerp3(
      positions[ia]!,
      positions[ia + 1]!,
      positions[ia + 2]!,
      positions[ib]!,
      positions[ib + 1]!,
      positions[ib + 2]!,
      t,
    );
  }
  const i = (profile.length - 1) * 3;
  return [positions[i]!, positions[i + 1]!, positions[i + 2]!];
}

/**
 * Camera sits clearance above the path, trails behind it, and looks ahead
 * along the same polyline. World +Y stays up; north is still -Z.
 */
export function sampleFlyalong(
  positions: Float32Array,
  profile: ReadonlyArray<{ s_m: number }>,
  lengthHorizontalM: number,
  playhead: number,
  clearance = FLY_CLEARANCE,
  lookAheadM = LOOK_AHEAD_M,
  trailM = FLY_TRAIL_M,
): FlyPose | null {
  if (!(lengthHorizontalM > 0) || profile.length === 0) return null;
  const fraction = Math.min(1, Math.max(0, playhead));
  const sM = fraction * lengthHorizontalM;
  const path = pointAtDistance(positions, profile, sM);
  if (!path) return null;
  const aheadS = Math.min(lengthHorizontalM, sM + lookAheadM);
  let lookAt = pointAtDistance(positions, profile, aheadS);
  if (!lookAt) return null;
  if (lookAt[0] === path[0] && lookAt[1] === path[1] && lookAt[2] === path[2]) {
    // End of path: keep the last tangent if there is a previous sample.
    const back = pointAtDistance(positions, profile, Math.max(0, sM - Math.min(lookAheadM, lengthHorizontalM)));
    if (back && (back[0] !== path[0] || back[2] !== path[2])) {
      lookAt = [path[0] + (path[0] - back[0]), path[1] + (path[1] - back[1]), path[2] + (path[2] - back[2])];
    } else {
      lookAt = [path[0], path[1], path[2] - 1];
    }
  }
  const back = pointAtDistance(positions, profile, Math.max(0, sM - trailM)) ?? path;
  let behindX = back[0];
  let behindZ = back[2];
  if (Math.hypot(path[0] - behindX, path[2] - behindZ) < 1) {
    const dx = path[0] - lookAt[0];
    const dz = path[2] - lookAt[2];
    const len = Math.hypot(dx, dz) || 1;
    behindX = path[0] + (dx / len) * trailM;
    behindZ = path[2] + (dz / len) * trailM;
  }
  return {
    path,
    camera: [behindX, path[1] + clearance, behindZ],
    lookAt,
  };
}
