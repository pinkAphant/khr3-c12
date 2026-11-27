/**
 * Exact vectors, the 12 yaws, and exact 3×3 rotations.
 *
 * Conventions (SI, right-handed): up is +Y, a vehicle or piece at yaw 0 faces
 * +Z with its left side toward +X, and a positive yaw turns +Z toward +X (a
 * left turn, counter-clockwise seen from above). Every rotation built here is a
 * proper rotation: R·Rᵀ = I and det R = +1, exactly.
 */
import {
    type Exact,
    type ExactJSON,
    ZERO,
    ONE,
    NEG_ONE,
    HALF,
    HALF_ROOT3,
    add,
    sub,
    mul,
    neg,
    eq,
    isZero,
    toFloat,
    toJSON,
    fromJSON,
} from "./scalar.js";

export interface ExactVec3 {
    readonly x: Exact;
    readonly y: Exact;
    readonly z: Exact;
}

export const V_ZERO: ExactVec3 = Object.freeze({ x: ZERO, y: ZERO, z: ZERO });
export const vec = (x: Exact, y: Exact, z: Exact): ExactVec3 => ({ x, y, z });
export const vAdd = (p: ExactVec3, q: ExactVec3): ExactVec3 => ({ x: add(p.x, q.x), y: add(p.y, q.y), z: add(p.z, q.z) });
export const vSub = (p: ExactVec3, q: ExactVec3): ExactVec3 => ({ x: sub(p.x, q.x), y: sub(p.y, q.y), z: sub(p.z, q.z) });
export const vNeg = (p: ExactVec3): ExactVec3 => ({ x: neg(p.x), y: neg(p.y), z: neg(p.z) });
export const vScale = (p: ExactVec3, s: Exact): ExactVec3 => ({ x: mul(p.x, s), y: mul(p.y, s), z: mul(p.z, s) });
export const vDot = (p: ExactVec3, q: ExactVec3): Exact => add(add(mul(p.x, q.x), mul(p.y, q.y)), mul(p.z, q.z));

export function vCross(p: ExactVec3, q: ExactVec3): ExactVec3 {
    return {
        x: sub(mul(p.y, q.z), mul(p.z, q.y)),
        y: sub(mul(p.z, q.x), mul(p.x, q.z)),
        z: sub(mul(p.x, q.y), mul(p.y, q.x)),
    };
}

export const vEq = (p: ExactVec3, q: ExactVec3): boolean => eq(p.x, q.x) && eq(p.y, q.y) && eq(p.z, q.z);
export const vIsZero = (p: ExactVec3): boolean => isZero(p.x) && isZero(p.y) && isZero(p.z);

/** Squared length, exact. */
export const vLengthSq = (p: ExactVec3): Exact => vDot(p, p);

/** Float conversion for the final Three.js or Rapier call. */
export const vToFloat = (p: ExactVec3): [number, number, number] => [toFloat(p.x), toFloat(p.y), toFloat(p.z)];

export type ExactVec3JSON = readonly [ExactJSON, ExactJSON, ExactJSON];
export const vToJSON = (p: ExactVec3): ExactVec3JSON => [toJSON(p.x), toJSON(p.y), toJSON(p.z)];
export const vFromJSON = (j: ExactVec3JSON): ExactVec3 => ({ x: fromJSON(j[0]), y: fromJSON(j[1]), z: fromJSON(j[2]) });

// ---------------------------------------------------------------------------
// The 12 yaws
// ---------------------------------------------------------------------------

/** Number of yaw steps in a full turn. One step is 30°. */
export const YAW_STEPS = 12;
export const YAW_STEP_RADIANS = Math.PI / 6;

/** A yaw index: an integer 0..11, in 30° steps about +Y. */
export type Yaw = number;

const NEG_HALF = neg(HALF);
const NEG_HALF_ROOT3 = neg(HALF_ROOT3);

/** Exact cosines of 0°, 30°, … 330°. */
export const COS12: readonly Exact[] = Object.freeze([
    ONE, HALF_ROOT3, HALF, ZERO, NEG_HALF, NEG_HALF_ROOT3,
    NEG_ONE, NEG_HALF_ROOT3, NEG_HALF, ZERO, HALF, HALF_ROOT3,
]);

/** Exact sines of 0°, 30°, … 330°. */
export const SIN12: readonly Exact[] = Object.freeze([
    ZERO, HALF, HALF_ROOT3, ONE, HALF_ROOT3, HALF,
    ZERO, NEG_HALF, NEG_HALF_ROOT3, NEG_ONE, NEG_HALF_ROOT3, NEG_HALF,
]);

/** Wrap any integer onto 0..11. */
export function wrapYaw(i: number): Yaw {
    if (!Number.isInteger(i))
        throw new RangeError(`yaw index must be an integer, got ${i}`);
    return ((i % YAW_STEPS) + YAW_STEPS) % YAW_STEPS;
}

export const yawCos = (i: number): Exact => COS12[wrapYaw(i)];
export const yawSin = (i: number): Exact => SIN12[wrapYaw(i)];

/** Radians for a yaw index, for the final float call. */
export const yawRadians = (i: number): number => wrapYaw(i) * YAW_STEP_RADIANS;

/** Unit forward vector for a yaw: (sin θ, 0, cos θ). Yaw 0 faces +Z. */
export const yawForward = (i: number): ExactVec3 => ({ x: yawSin(i), y: ZERO, z: yawCos(i) });

/**
 * Unit left vector for a yaw: up × forward = (cos θ, 0, −sin θ).
 * Facing +Z with +Y up, left is +X (the same convention as ecctrl's wheels).
 */
export const yawLeft = (i: number): ExactVec3 => ({ x: yawCos(i), y: ZERO, z: neg(yawSin(i)) });

/** Unit right vector for a yaw: −left = (−cos θ, 0, sin θ). Yaw 0 has right = −X. */
export const yawRight = (i: number): ExactVec3 => ({ x: neg(yawCos(i)), y: ZERO, z: yawSin(i) });

/** Row-major 3×3 matrix of exact scalars. */
export interface ExactMat3 {
    readonly m: readonly [Exact, Exact, Exact, Exact, Exact, Exact, Exact, Exact, Exact];
}

export const M_IDENTITY: ExactMat3 = Object.freeze({
    m: Object.freeze([ONE, ZERO, ZERO, ZERO, ONE, ZERO, ZERO, ZERO, ONE]) as ExactMat3["m"],
});

/** Rotation about +Y by a yaw index. Maps +Z to (sin θ, 0, cos θ). */
export function rotY(i: number): ExactMat3 {
    const c = yawCos(i), s = yawSin(i);
    return { m: [c, ZERO, s, ZERO, ONE, ZERO, neg(s), ZERO, c] };
}

/** Rotation about +X by an index in 30° steps. Maps +Y toward +Z. */
export function rotX(i: number): ExactMat3 {
    const c = yawCos(i), s = yawSin(i);
    return { m: [ONE, ZERO, ZERO, ZERO, c, neg(s), ZERO, s, c] };
}

/** Rotation about +Z by an index in 30° steps. Maps +X toward +Y. */
export function rotZ(i: number): ExactMat3 {
    const c = yawCos(i), s = yawSin(i);
    return { m: [c, neg(s), ZERO, s, c, ZERO, ZERO, ZERO, ONE] };
}

export function mMul(p: ExactMat3, q: ExactMat3): ExactMat3 {
    const a = p.m, b = q.m, out = new Array<Exact>(9);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            out[r * 3 + c] = add(add(mul(a[r * 3], b[c]), mul(a[r * 3 + 1], b[3 + c])), mul(a[r * 3 + 2], b[6 + c]));
        }
    }
    return { m: out as unknown as ExactMat3["m"] };
}

export function mTranspose(p: ExactMat3): ExactMat3 {
    const a = p.m;
    return { m: [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]] };
}

export function mApply(p: ExactMat3, v: ExactVec3): ExactVec3 {
    const a = p.m;
    return {
        x: add(add(mul(a[0], v.x), mul(a[1], v.y)), mul(a[2], v.z)),
        y: add(add(mul(a[3], v.x), mul(a[4], v.y)), mul(a[5], v.z)),
        z: add(add(mul(a[6], v.x), mul(a[7], v.y)), mul(a[8], v.z)),
    };
}

export function mEq(p: ExactMat3, q: ExactMat3): boolean {
    for (let i = 0; i < 9; i++)
        if (!eq(p.m[i], q.m[i]))
            return false;
    return true;
}

export function mDet(p: ExactMat3): Exact {
    const a = p.m;
    return add(sub(mul(a[0], sub(mul(a[4], a[8]), mul(a[5], a[7]))), mul(a[1], sub(mul(a[3], a[8]), mul(a[5], a[6])))), mul(a[2], sub(mul(a[3], a[7]), mul(a[4], a[6]))));
}

/** True when R·Rᵀ = I and det R = +1 exactly: a proper rotation in SO(3). */
export const isProperRotation = (p: ExactMat3): boolean => mEq(mMul(p, mTranspose(p)), M_IDENTITY) && eq(mDet(p), ONE);

/** Row-major floats for the final Three.js or Rapier call. */
export function mToFloat(p: ExactMat3): [number, number, number, number, number, number, number, number, number] {
    const a = p.m;
    return [
        toFloat(a[0]), toFloat(a[1]), toFloat(a[2]),
        toFloat(a[3]), toFloat(a[4]), toFloat(a[5]),
        toFloat(a[6]), toFloat(a[7]), toFloat(a[8]),
    ];
}

/**
 * Unit quaternion [x, y, z, w] for a proper rotation, for the final float
 * call. Uses the numerically stable branch selection on the float matrix.
 */
export function mToQuaternion(p: ExactMat3): [number, number, number, number] {
    const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = mToFloat(p);
    const trace = m00 + m11 + m22;
    let x: number, y: number, z: number, w: number;
    if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1);
        w = 0.25 / s;
        x = (m21 - m12) * s;
        y = (m02 - m20) * s;
        z = (m10 - m01) * s;
    }
    else if (m00 > m11 && m00 > m22) {
        const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
        w = (m21 - m12) / s;
        x = 0.25 * s;
        y = (m01 + m10) / s;
        z = (m02 + m20) / s;
    }
    else if (m11 > m22) {
        const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
        w = (m02 - m20) / s;
        x = (m01 + m10) / s;
        y = 0.25 * s;
        z = (m12 + m21) / s;
    }
    else {
        const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
        w = (m10 - m01) / s;
        x = (m02 + m20) / s;
        y = (m12 + m21) / s;
        z = 0.25 * s;
    }
    const n = Math.hypot(x, y, z, w);
    return [x / n, y / n, z / n, w / n];
}

export type ExactMat3JSON = readonly ExactJSON[];
export const mToJSON = (p: ExactMat3): ExactMat3JSON => p.m.map(toJSON);
export function mFromJSON(j: ExactMat3JSON): ExactMat3 {
    if (j.length !== 9)
        throw new TypeError("mFromJSON: expected 9 entries");
    return { m: j.map(fromJSON) as unknown as ExactMat3["m"] };
}
