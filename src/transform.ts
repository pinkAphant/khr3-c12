/**
 * Exact rigid transforms and the building lattice.
 *
 * A rigid transform is a proper rotation followed by a translation. Compose
 * and invert are exact; floats appear only in `tToFloat`, which is what the
 * Three.js and Rapier calls consume.
 */
import { type Exact, ZERO, exact, scale, fromInt, toFloat } from "./scalar.js";
import {
    type ExactMat3,
    type ExactVec3,
    type ExactMat3JSON,
    type ExactVec3JSON,
    type Yaw,
    M_IDENTITY,
    V_ZERO,
    mApply,
    mEq,
    mMul,
    mTranspose,
    mToQuaternion,
    mToJSON,
    mFromJSON,
    rotY,
    vAdd,
    vEq,
    vNeg,
    vToFloat,
    vToJSON,
    vFromJSON,
    wrapYaw,
    yawForward,
    yawLeft,
    yawRadians,
    vScale,
} from "./rotation.js";

/** STEP is 0.25 m: the finest building increment. */
export const STEP: Exact = exact(1, 0, 2);
/** Float value of STEP in metres. */
export const STEP_METRES = 0.25;
/** MODULE is 12 steps, which is 3 m: one foundation edge. */
export const MODULE_STEPS = 12;
export const MODULE: Exact = scale(STEP, MODULE_STEPS);
export const MODULE_METRES = 3;

/** n building steps (n × 0.25 m) as an exact length in metres. */
export function steps(n: number): Exact {
    return scale(STEP, n);
}

/** n metres (integer) as an exact length. */
export function metres(n: number): Exact {
    return fromInt(n);
}

export interface ExactTransform {
    readonly rot: ExactMat3;
    readonly pos: ExactVec3;
}

export const T_IDENTITY: ExactTransform = Object.freeze({ rot: M_IDENTITY, pos: V_ZERO });

export function transform(rot: ExactMat3, pos: ExactVec3): ExactTransform {
    return { rot, pos };
}

/** Pure translation. */
export function translation(pos: ExactVec3): ExactTransform {
    return { rot: M_IDENTITY, pos };
}

/** Pure yaw about +Y in 30° steps. */
export function yawTransform(i: number): ExactTransform {
    return { rot: rotY(i), pos: V_ZERO };
}

/** Yaw then translate: a piece standing at `pos` facing yaw `i`. */
export function placement(pos: ExactVec3, i: number): ExactTransform {
    return { rot: rotY(i), pos };
}

/**
 * Compose: the result applies `inner` first, then `outer`.
 * compose(parent, local) is the world transform of a child.
 */
export function compose(outer: ExactTransform, inner: ExactTransform): ExactTransform {
    return {
        rot: mMul(outer.rot, inner.rot),
        pos: vAdd(mApply(outer.rot, inner.pos), outer.pos),
    };
}

/** Exact inverse: Rᵀ and −Rᵀ·p. */
export function invert(t: ExactTransform): ExactTransform {
    const rt = mTranspose(t.rot);
    return { rot: rt, pos: vNeg(mApply(rt, t.pos)) };
}

export function applyPoint(t: ExactTransform, p: ExactVec3): ExactVec3 {
    return vAdd(mApply(t.rot, p), t.pos);
}

export function applyDirection(t: ExactTransform, d: ExactVec3): ExactVec3 {
    return mApply(t.rot, d);
}

export function tEq(p: ExactTransform, q: ExactTransform): boolean {
    return mEq(p.rot, q.rot) && vEq(p.pos, q.pos);
}

/** The difference between two transforms: invert(a) ∘ b. Identity when equal. */
export function relative(a: ExactTransform, b: ExactTransform): ExactTransform {
    return compose(invert(a), b);
}

/** Float position and unit quaternion [x, y, z, w] for Three.js or Rapier. */
export function tToFloat(t: ExactTransform): { position: [number, number, number]; quaternion: [number, number, number, number] } {
    return { position: vToFloat(t.pos), quaternion: mToQuaternion(t.rot) };
}

export interface ExactTransformJSON {
    readonly r: ExactMat3JSON;
    readonly p: ExactVec3JSON;
}

export function tToJSON(t: ExactTransform): ExactTransformJSON {
    return { r: mToJSON(t.rot), p: vToJSON(t.pos) };
}

export function tFromJSON(j: ExactTransformJSON): ExactTransform {
    return { rot: mFromJSON(j.r), pos: vFromJSON(j.p) };
}

// ---------------------------------------------------------------------------
// Lattice helpers
// ---------------------------------------------------------------------------

/** A point on the square lattice: (i, level, j) in building steps. */
export function latticePoint(i: number, level: number, j: number): ExactVec3 {
    return { x: steps(i), y: steps(level), z: steps(j) };
}

/** Displacement of `length` along the forward direction of a yaw. */
export function alongYaw(i: number, length: Exact): ExactVec3 {
    return vScale(yawForward(i), length);
}

/** Displacement of `length` toward the left of a yaw (+X at yaw 0). Negative lengths go right. */
export function acrossYaw(i: number, length: Exact): ExactVec3 {
    return vScale(yawLeft(i), length);
}

/** One move of a walker: turn by `turn` yaw steps, then advance `length`. */
export function turtleMove(turn: number, length: Exact): ExactTransform {
    return compose(yawTransform(turn), translation({ x: ZERO, y: ZERO, z: length }));
}

/**
 * The one place a building length in lattice steps becomes floating point: `n` steps, whole or a dyadic fraction of
 * a step down to a sixty-fourth (the middle of a wall, half the thickness of a slab), as metres. Every building
 * system (base pieces, city walls, recipe buildings, pack placements) converts here, or through `tToFloat` for a
 * full exact transform.
 */
export function stepsToFloat(n: number): number {
    const parts = n * 64;
    if (!Number.isInteger(parts))
        throw new RangeError(`stepsToFloat: ${n} is not a whole number of sixty-fourths of a step`);
    // n steps of 1/4 m is n·64 / 2⁸ m.
    return toFloat(exact(parts, 0, 8));
}

/** A lattice point in steps (x, level, z) as the metres Three.js and Rapier take. */
export function latticeToFloat(x: number, level: number, z: number): [number, number, number] {
    return [stepsToFloat(x), stepsToFloat(level), stepsToFloat(z)];
}

/** A length in metres as lattice steps: the way in, for a point a player aims at. */
export function floatToSteps(metresVal: number): number {
    return metresVal / STEP_METRES;
}

/** Quantize a boundary float coordinate (such as a raycast hit, in metres) into an exact dyadic scalar at 2^-20 m resolution. */
export function floatToExact(metresVal: number): Exact {
    if (!Number.isFinite(metresVal))
        throw new RangeError(`floatToExact: expected finite metres, got ${metresVal}`);
    return exact(BigInt(Math.round(metresVal * 1048576)), 0n, 20);
}

/** The nearest of the twelve yaws (0..11), in twelfths of a turn, to a ground direction (x, z). */
export function nearestYaw(x: number, z: number): Yaw {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        throw new RangeError(`nearestYaw: expected finite direction, got (${x}, ${z})`);
    }
    return wrapYaw(Math.round(Math.atan2(x, z) / (Math.PI / 6)));
}

/** A yaw in twelfths of a turn as the radians Three.js and Rapier take. */
export function yawToFloat(yaw: number): number {
    return yawRadians(yaw);
}

/** A turn about the vertical, in radians, as the quaternion Three.js and Rapier take: x, y, z, w. */
export function yawToQuaternion(radians: number): [number, number, number, number] {
    return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
}

/** Exact C12 yaw index (0..11) converted via exact SO(3) `rotY` to unit quaternion `[x, y, z, w]`. */
export function yawStepToQuaternion(yaw: Yaw): [number, number, number, number] {
    return mToQuaternion(rotY(yaw));
}

/** A slope that rises `rise` over a run of `run` (both in metres): how long it is, and its angle in radians. */
export function slopeToFloat(rise: number, run: number): { length: number; angle: number } {
    return { length: Math.hypot(rise, run), angle: Math.atan2(rise, run) };
}

/** A point (y, z) tilted about the X axis by `radians`. */
export function tiltToFloat(y: number, z: number, radians: number): [number, number] {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return [y * c - z * s, y * s + z * c];
}
