/**
 * Exact scalar arithmetic for building math.
 *
 * An exact scalar is (a + b·√3) / 2^k for integers a, b and k (k ≥ 0).
 * The set is closed under addition, subtraction and multiplication, and it
 * contains every sine and cosine of a multiple of 30°, so walks across
 * tilings of squares and equilateral triangles close with a difference of
 * exactly zero.
 *
 * Values are immutable and kept in a canonical form (k is minimal, zero is
 * 0/2^0), so structural equality is mathematical equality.
 */
export interface Exact {
    readonly a: bigint;
    readonly b: bigint;
    readonly k: number;
}

const SQRT3 = Math.sqrt(3);

function canon(a: bigint, b: bigint, k: number): Exact {
    if (a === 0n && b === 0n)
        return ZERO;
    while (k > 0 && (a & 1n) === 0n && (b & 1n) === 0n) {
        a >>= 1n;
        b >>= 1n;
        k -= 1;
    }
    return { a, b, k };
}

export const ZERO: Exact = Object.freeze({ a: 0n, b: 0n, k: 0 });
export const ONE: Exact = Object.freeze({ a: 1n, b: 0n, k: 0 });
export const NEG_ONE: Exact = Object.freeze({ a: -1n, b: 0n, k: 0 });
export const HALF: Exact = Object.freeze({ a: 1n, b: 0n, k: 1 });
export const ROOT3: Exact = Object.freeze({ a: 0n, b: 1n, k: 0 });
export const HALF_ROOT3: Exact = Object.freeze({ a: 0n, b: 1n, k: 1 });

/** Build (a + b√3) / 2^k from integers. */
export function exact(a: bigint | number, b: bigint | number = 0, k = 0): Exact {
    if (!Number.isSafeInteger(k) || k < 0)
        throw new RangeError(`exact: k must be a non-negative safe integer, got ${k}`);
    const A = typeof a === "bigint" ? a : toBig(a);
    const B = typeof b === "bigint" ? b : toBig(b);
    return canon(A, B, k);
}

function toBig(n: number): bigint {
    if (!Number.isSafeInteger(n))
        throw new RangeError(`exact: ${n} is not a safe integer`);
    return BigInt(n);
}

/** An integer as an exact scalar. */
export function fromInt(n: number | bigint): Exact {
    return exact(n, 0, 0);
}

export function add(x: Exact, y: Exact): Exact {
    if (x.k === y.k)
        return canon(x.a + y.a, x.b + y.b, x.k);
    if (x.k > y.k) {
        const s = BigInt(x.k - y.k);
        return canon(x.a + (y.a << s), x.b + (y.b << s), x.k);
    }
    const s = BigInt(y.k - x.k);
    return canon((x.a << s) + y.a, (x.b << s) + y.b, y.k);
}

export function neg(x: Exact): Exact {
    return x === ZERO ? ZERO : { a: -x.a, b: -x.b, k: x.k };
}

export function sub(x: Exact, y: Exact): Exact {
    return add(x, neg(y));
}

export function mul(x: Exact, y: Exact): Exact {
    // (a1 + b1√3)(a2 + b2√3) = (a1a2 + 3b1b2) + (a1b2 + a2b1)√3
    return canon(x.a * y.a + 3n * x.b * y.b, x.a * y.b + x.b * y.a, x.k + y.k);
}

/** Multiply by an integer. */
export function scale(x: Exact, n: number | bigint): Exact {
    const N = typeof n === "bigint" ? n : toBig(n);
    return canon(x.a * N, x.b * N, x.k);
}

/** Divide by 2^n. */
export function half(x: Exact, n = 1): Exact {
    if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(x.k + n)) {
        throw new RangeError(`half: n must be a non-negative safe integer, got ${n}`);
    }
    return canon(x.a, x.b, x.k + n);
}

export function isZero(x: Exact): boolean {
    return x.a === 0n && x.b === 0n;
}

export function eq(x: Exact, y: Exact): boolean {
    return x.k === y.k && x.a === y.a && x.b === y.b;
}

/** Exact sign of a + b√3: -1, 0 or 1, with no floating point. */
export function sign(x: Exact): -1 | 0 | 1 {
    const { a, b } = x;
    if (a === 0n && b === 0n)
        return 0;
    if (a >= 0n && b >= 0n)
        return 1;
    if (a <= 0n && b <= 0n)
        return -1;
    // Mixed signs: compare a² against 3b².
    const a2 = a * a;
    const b2 = 3n * b * b;
    if (a > 0n)
        return a2 > b2 ? 1 : -1; // a > 0 > b: positive when a > |b|√3
    return b2 > a2 ? 1 : -1; // b > 0 > a: positive when b√3 > |a|
}

export function cmp(x: Exact, y: Exact): -1 | 0 | 1 {
    return sign(sub(x, y));
}

export function abs(x: Exact): Exact {
    return sign(x) < 0 ? neg(x) : x;
}

export function min(x: Exact, y: Exact): Exact {
    return cmp(x, y) <= 0 ? x : y;
}

export function max(x: Exact, y: Exact): Exact {
    return cmp(x, y) >= 0 ? x : y;
}

export function sum(xs: Iterable<Exact>): Exact {
    let acc = ZERO;
    for (const x of xs)
        acc = add(acc, x);
    return acc;
}

function bitLength(mag: bigint): number {
    if (mag <= 0n)
        return 0;
    let v = mag;
    let bits = 0;
    while (v >= (1n << 64n)) {
        v >>= 64n;
        bits += 64;
    }
    while (v >= (1n << 32n)) {
        v >>= 32n;
        bits += 32;
    }
    return bits + (32 - Math.clz32(Number(v)));
}

/** Shift |n| down to at most 53 bits with round-to-nearest-even, returning m * 2^shift ≈ n. */
function bigShifted(n: bigint, shift: number): number {
    if (n === 0n)
        return 0;
    if (shift <= 0)
        return Number(n) * 2 ** -shift;
    const signMul = n < 0n ? -1 : 1;
    const mag = n < 0n ? -n : n;
    if (bitLength(mag) < shift - 60)
        return 0;
    const s = BigInt(shift);
    let top = mag >> s;
    const halfBit = 1n << (s - 1n);
    const rem = mag & ((1n << s) - 1n);
    if (rem > halfBit || (rem === halfBit && (top & 1n) === 1n))
        top += 1n;
    return signMul * Number(top);
}

/** Sum u + v·√3 where u and v share the same sign (zero cancellation), scaled as m * 2^e. */
function sumSameSign(u: bigint, v: bigint): { m: number; e: number } {
    const bu = bitLength(u < 0n ? -u : u);
    const bv = bitLength(v < 0n ? -v : v);
    const e = Math.max(0, Math.max(bu, bv) - 53);
    return { m: bigShifted(u, e) + bigShifted(v, e) * SQRT3, e };
}

function scalePow2(x: number, exp: number): number {
    if (x === 0 || exp === 0)
        return x;
    while (exp > 1023) {
        x *= 2 ** 1023;
        if (!Number.isFinite(x))
            return x;
        exp -= 1023;
    }
    while (exp < -1022) {
        x *= 2 ** -1022;
        if (x === 0)
            return 0;
        exp += 1022;
    }
    return x * 2 ** exp;
}

/**
 * The one sanctioned conversion to floating point. Call it only at the final
 * Three.js or Rapier call. Preserves 53-bit precision across arbitrary BigInt
 * magnitudes, k >= 1024, and opposite-sign cancellation via (a² − 3b²)/(a − b√3).
 */
export function toFloat(x: Exact): number {
    if (x === ZERO)
        return 0;
    if (x.a === 0n || x.b === 0n || (x.a > 0n) === (x.b > 0n)) {
        const s = sumSameSign(x.a, x.b);
        return scalePow2(s.m, s.e - x.k);
    }
    // Opposite signs: rationalize numerator in exact BigInt so a + b√3 never cancels in float.
    const disc = x.a * x.a - 3n * x.b * x.b;
    const eNum = Math.max(0, bitLength(disc < 0n ? -disc : disc) - 53);
    const mNum = bigShifted(disc, eNum);
    const den = sumSameSign(x.a, -x.b);
    return scalePow2(mNum / den.m, eNum - den.e - x.k);
}

/** JSON form: [a, b, k] with decimal strings for the integers. */
export type ExactJSON = readonly [string, string, number];

export function toJSON(x: Exact): ExactJSON {
    return [x.a.toString(), x.b.toString(), x.k];
}

export function fromJSON(j: ExactJSON): Exact {
    if (!Array.isArray(j) || j.length !== 3)
        throw new TypeError("fromJSON: expected [a, b, k]");
    return exact(BigInt(j[0]), BigInt(j[1]), j[2]);
}

/** Human readable form such as "(3 + 2√3)/4". */
export function format(x: Exact): string {
    const parts: string[] = [];
    if (x.a !== 0n || x.b === 0n)
        parts.push(x.a.toString());
    if (x.b !== 0n) {
        const mag = x.b < 0n ? -x.b : x.b;
        const body = `${mag === 1n ? "" : mag.toString()}√3`;
        if (parts.length === 0)
            parts.push(x.b < 0n ? `-${body}` : body);
        else
            parts.push(x.b < 0n ? `- ${body}` : `+ ${body}`);
    }
    const num = parts.join(" ");
    if (x.k === 0)
        return num;
    return `${parts.length > 1 ? `(${num})` : num}/${(1n << BigInt(x.k)).toString()}`;
}
