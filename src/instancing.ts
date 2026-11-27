/**
 * Batch placed pieces into per-kind instance matrices: one `THREE.InstancedMesh` (one draw call) per piece kind.
 * Matrices are column-major 4x4, the exact layout of `THREE.Matrix4.elements` / `InstancedMesh.instanceMatrix.array`.
 */
import { type PieceKind, type PlacedPiece } from "./pieces.js";
import { toFloat } from "./scalar.js";
import { yawCos, yawSin } from "./rotation.js";

export interface InstanceBatch {
    kind: PieceKind;
    count: number;
    /** `count * 16` floats, column-major. Pass to `new THREE.InstancedBufferAttribute(matrices, 16)`. */
    matrices: Float32Array;
}

/** Write an exact yaw-and-translate matrix for one piece at `out[offset..offset+16]` with zero temporary allocations. */
export function writePieceMatrix(p: PlacedPiece, out: Float32Array, offset: number): void {
    const x = toFloat(p.pose.pos.x);
    const y = toFloat(p.pose.pos.y);
    const z = toFloat(p.pose.pos.z);
    const c = toFloat(yawCos(p.pose.yaw));
    const s = toFloat(yawSin(p.pose.yaw));
    out[offset] = c;
    out[offset + 1] = 0;
    out[offset + 2] = -s;
    out[offset + 3] = 0;
    out[offset + 4] = 0;
    out[offset + 5] = 1;
    out[offset + 6] = 0;
    out[offset + 7] = 0;
    out[offset + 8] = s;
    out[offset + 9] = 0;
    out[offset + 10] = c;
    out[offset + 11] = 0;
    out[offset + 12] = x;
    out[offset + 13] = y;
    out[offset + 14] = z;
    out[offset + 15] = 1;
}

/** Group pieces by kind into instance batches (stable order: first appearance). */
export function instanceBatches(pieces: readonly PlacedPiece[]): InstanceBatch[] {
    const groups = new Map<PieceKind, PlacedPiece[]>();
    for (const p of pieces) {
        let list = groups.get(p.kind);
        if (!list) {
            list = [];
            groups.set(p.kind, list);
        }
        list.push(p);
    }
    return [...groups].map(([kind, list]) => {
        const matrices = new Float32Array(list.length * 16);
        for (let i = 0; i < list.length; i++)
            writePieceMatrix(list[i], matrices, i * 16);
        return { kind, count: list.length, matrices };
    });
}

/** Instance matrices for one kind across chunks, for streaming worlds (concatenate chunk batches). */
export function mergeBatches(batches: readonly InstanceBatch[]): InstanceBatch[] {
    const byKind = new Map<PieceKind, InstanceBatch[]>();
    for (const b of batches) {
        let list = byKind.get(b.kind);
        if (!list) {
            list = [];
            byKind.set(b.kind, list);
        }
        list.push(b);
    }
    return [...byKind].map(([kind, list]) => {
        const count = list.reduce((n, b) => n + b.count, 0);
        const matrices = new Float32Array(count * 16);
        let off = 0;
        for (const b of list) {
            matrices.set(b.matrices, off);
            off += b.matrices.length;
        }
        return { kind, count, matrices };
    });
}
