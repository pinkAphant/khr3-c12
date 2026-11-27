/**
 * 2D exact overlap and structural placement validation for C12 pieces.
 */
import { type Exact, ROOT3, ZERO, abs, add, cmp, eq, half, max, min, mul, neg, sub } from "./scalar.js";
import { type ExactVec3, type Yaw, mApply, rotY, vAdd, vEq, vSub, vec, wrapYaw, yawCos, yawSin } from "./rotation.js";
import {
    type PieceKind,
    type PiecePose,
    type PlacedPiece,
    type Socket,
    SIDE,
    STOREY,
    TRI_CORNER_YAWS,
    TRI_EDGE_YAWS,
    worldSockets,
} from "./pieces.js";

const HALF_SIDE = half(SIDE);
const NEG_HALF_SIDE = neg(HALF_SIDE);
const SQ_CORNERS: ExactVec3[] = [
    vec(NEG_HALF_SIDE, ZERO, NEG_HALF_SIDE), vec(HALF_SIDE, ZERO, NEG_HALF_SIDE),
    vec(HALF_SIDE, ZERO, HALF_SIDE), vec(NEG_HALF_SIDE, ZERO, HALF_SIDE),
];
const TRI_CORNERS: ExactVec3[] = TRI_CORNER_YAWS.map((y) => mApply(rotY(y), vec(ZERO, ZERO, ROOT3)));

const sameEdge = (a: Socket, b: Socket): boolean => {
    const ay = wrapYaw(a.yaw);
    const by = wrapYaw(b.yaw);
    return vEq(a.mid, b.mid) && (ay === by || ay === wrapYaw(by + 6));
};

const isGroundPad = (k: PieceKind): boolean => k === "FoundationSquare" || k === "FoundationTriangle" || k === "Street";
const isSlab = (k: PieceKind): boolean => isGroundPad(k) || k === "Floor" || k === "Roof";
const isEdgePiece = (k: PieceKind): boolean => k === "Wall" || k === "Doorway";

function projectRange(verts: ExactVec3[], axis: Yaw): [Exact, Exact] {
    const nx = yawSin(axis);
    const nz = yawCos(axis);
    let lo = add(mul(verts[0].x, nx), mul(verts[0].z, nz));
    let hi = lo;
    for (let i = 1; i < verts.length; i++) {
        const d = add(mul(verts[i].x, nx), mul(verts[i].z, nz));
        lo = min(lo, d);
        hi = max(hi, d);
    }
    return [lo, hi];
}

function slabsOverlap2D(aKind: PieceKind, aPose: PiecePose, bKind: PieceKind, bPose: PiecePose): boolean {
    const rotA = rotY(aPose.yaw);
    const rotB = rotY(bPose.yaw);
    const vertsA = (aKind === "FoundationTriangle" ? TRI_CORNERS : SQ_CORNERS).map((c) => vAdd(aPose.pos, mApply(rotA, c)));
    const vertsB = (bKind === "FoundationTriangle" ? TRI_CORNERS : SQ_CORNERS).map((c) => vAdd(bPose.pos, mApply(rotB, c)));
    const axesA = (aKind === "FoundationTriangle" ? TRI_EDGE_YAWS : [0, 3]).map((a) => wrapYaw(aPose.yaw + a));
    const axesB = (bKind === "FoundationTriangle" ? TRI_EDGE_YAWS : [0, 3]).map((a) => wrapYaw(bPose.yaw + a));
    for (const axis of [...axesA, ...axesB]) {
        const [aLo, aHi] = projectRange(vertsA, axis);
        const [bLo, bHi] = projectRange(vertsB, axis);
        if (cmp(max(aLo, bLo), min(aHi, bHi)) >= 0)
            return false;
    }
    return true;
}

/** Whether a piece may be placed at a pose, given what stands already. */
export function canPlace(existing: readonly PlacedPiece[], kind: PieceKind, rawPose: PiecePose): { ok: boolean; reason: string } {
    const pose: PiecePose = { pos: rawPose.pos, yaw: wrapYaw(rawPose.yaw) };
    const groundPad = isGroundPad(kind);
    const slab = isSlab(kind);
    const here: Socket = { kind: "edge", mid: pose.pos, yaw: pose.yaw };
    for (const p of existing) {
        const pPose: PiecePose = { pos: p.pose.pos, yaw: wrapYaw(p.pose.yaw) };
        if (slab && isSlab(p.kind)) {
            const sameBand = groundPad && isGroundPad(p.kind) ? cmp(abs(sub(pPose.pos.y, pose.pos.y)), STOREY) < 0 : eq(pPose.pos.y, pose.pos.y);
            if (sameBand && slabsOverlap2D(p.kind, pPose, kind, pose))
                return { ok: false, reason: `a ${p.kind} already stands there` };
        }
        else if ((isEdgePiece(kind) && isEdgePiece(p.kind)) || (kind === "DoorLeaf" && p.kind === "DoorLeaf")) {
            if (sameEdge({ kind: "edge", mid: pPose.pos, yaw: pPose.yaw }, here))
                return { ok: false, reason: `a ${p.kind} already stands there` };
        }
        else if (kind === "Stairs" && p.kind === "Stairs" && vEq(pPose.pos, pose.pos)) {
            return { ok: false, reason: "a Stairs already stands there" };
        }
    }
    if (groundPad)
        return { ok: true, reason: "" };
    if (kind === "DoorLeaf") {
        const framed = existing.some((p) => p.kind === "Doorway" && sameEdge({ kind: "edge", mid: p.pose.pos, yaw: p.pose.yaw }, here));
        return framed ? { ok: true, reason: "" } : { ok: false, reason: "a DoorLeaf needs a Doorway at the same edge" };
    }
    const bases = existing.filter((p) => p.kind === "FoundationSquare" || p.kind === "FoundationTriangle" || p.kind === "Floor");
    const walls = existing.filter((p) => isEdgePiece(p.kind));
    const oneStoreyUp = vec(ZERO, STOREY, ZERO);
    if (isEdgePiece(kind)) {
        const heldByBase = bases.some((b) => worldSockets(b.kind, b.pose).some((s) => s.kind === "edge" && sameEdge(s, here)));
        const heldByWall = walls.some((w) => sameEdge({ kind: "edge", mid: vAdd(w.pose.pos, oneStoreyUp), yaw: w.pose.yaw }, here));
        return heldByBase || heldByWall ? { ok: true, reason: "" } : { ok: false, reason: `a ${kind} needs a foundation, floor, or wall below` };
    }
    const hasEdgeWall = (cellPose: PiecePose): boolean =>
        worldSockets("FoundationSquare", cellPose).some((e) => e.kind === "edge" && walls.some((w) => sameEdge(e, { kind: "edge", mid: w.pose.pos, yaw: w.pose.yaw })));
    const hasAdjSlab = (slabKind: PieceKind, slabPose: PiecePose): boolean =>
        worldSockets("FoundationSquare", slabPose).some((e) =>
            e.kind === "edge" &&
            existing.some((p) => p.kind === slabKind && wrapYaw(p.pose.yaw - slabPose.yaw) % 3 === 0 && worldSockets("FoundationSquare", p.pose).some((pe) => pe.kind === "edge" && sameEdge(e, pe))));
    if (kind === "Floor" || kind === "Roof") {
        const stairAtCell = existing.some((p) => p.kind === "Stairs" && vEq(p.pose.pos, pose.pos));
        const stairOneBelow = existing.find((p) => p.kind === "Stairs" && vEq(vAdd(p.pose.pos, oneStoreyUp), pose.pos));
        if (kind === "Floor" && (stairAtCell || stairOneBelow))
            return { ok: false, reason: "a Floor cannot cap or occupy a stairwell cell" };
        const below = bases.find((b) => b.kind !== "FoundationTriangle" && worldSockets(b.kind, b.pose).some((s) => s.kind === "top" && vEq(s.mid, pose.pos)));
        if (below) {
            if (wrapYaw(pose.yaw - below.pose.yaw) % 3 !== 0)
                return { ok: false, reason: `${kind} yaw must align in 90° steps with support below` };
            return hasEdgeWall(below.pose) || hasAdjSlab(kind, pose) ? { ok: true, reason: "" } : { ok: false, reason: `a ${kind} needs a wall under one of its edges` };
        }
        if (kind === "Roof") {
            const twoStoreysUp = vAdd(oneStoreyUp, oneStoreyUp);
            const stairBelow = !stairAtCell
                ? stairOneBelow ?? existing.find((p) => p.kind === "Stairs" && vEq(vAdd(p.pose.pos, twoStoreysUp), pose.pos) && !existing.some((u) => u.kind === "Stairs" && vEq(u.pose.pos, vAdd(p.pose.pos, oneStoreyUp))))
                : undefined;
            if (stairBelow) {
                if (wrapYaw(pose.yaw - stairBelow.pose.yaw) % 3 !== 0)
                    return { ok: false, reason: "Roof yaw must align in 90° steps with stairwell below" };
                return hasEdgeWall({ pos: vSub(pose.pos, oneStoreyUp), yaw: pose.yaw }) || hasAdjSlab("Roof", pose)
                    ? { ok: true, reason: "" }
                    : { ok: false, reason: "a Roof above a stairwell needs a supporting wall at the storey below" };
            }
        }
        return { ok: false, reason: `a ${kind} needs a square foundation, floor, or stairwell one storey below it` };
    }
    if (existing.some((p) => p.kind === "Floor" && vEq(p.pose.pos, vAdd(pose.pos, oneStoreyUp))))
        return { ok: false, reason: "stairs cannot rise into a solid floor above" };
    const baseCell = bases.find((b) => b.kind !== "FoundationTriangle" && worldSockets(b.kind, b.pose).some((s) => s.kind === "cell" && vEq(s.mid, pose.pos)));
    if (baseCell)
        return wrapYaw(pose.yaw - baseCell.pose.yaw) % 3 === 0 ? { ok: true, reason: "" } : { ok: false, reason: "stairs yaw must align in 90° steps with base below" };
    const stairUnder = existing.find((p) => p.kind === "Stairs" && vEq(vAdd(p.pose.pos, oneStoreyUp), pose.pos));
    if (stairUnder) {
        if (wrapYaw(pose.yaw - stairUnder.pose.yaw) % 3 !== 0)
            return { ok: false, reason: "stairs yaw must align in 90° steps with stairs below" };
        return hasEdgeWall(pose) || hasAdjSlab("Floor", pose) ? { ok: true, reason: "" } : { ok: false, reason: "upper stairs need a wall or adjacent floor" };
    }
    return { ok: false, reason: "stairs need a square foundation, floor, or stairwell below" };
}
