/**
 * Batch placed pieces into per-kind instance matrices: one `THREE.InstancedMesh` (one draw call) per piece kind.
 * Matrices are column-major 4x4, the exact layout of `THREE.Matrix4.elements` / `InstancedMesh.instanceMatrix.array`.
 */
import { type PieceKind, type PlacedPiece } from "./pieces.js";
import { vToFloat } from "./rotation.js";
import { yawToFloat } from "./transform.js";

export interface InstanceBatch {
    kind: PieceKind;
    count: number;
    /** `count * 16` floats, column-major. Pass to `new THREE.InstancedBufferAttribute(matrices, 16)`. */
    matrices: Float32Array;
}

/** Write a yaw-and-translate matrix for one piece at `out[offset..offset+16]`. */
export function writePieceMatrix(p: PlacedPiece, out: Float32Array, offset: number): void {
    const [x, y, z] = vToFloat(p.pose.pos);
    const t = yawToFloat(p.pose.yaw);
    const c = Math.cos(t), s = Math.sin(t);
    out.set([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1], offset);
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
        list.forEach((p, i) => writePieceMatrix(p, matrices, i * 16));
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
