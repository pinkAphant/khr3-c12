/**
 * Base pieces placed by exact transforms on the 3.0 m C12 lattice.
 * Every piece pose is an exact position and one of 12 yaws (30-degree steps);
 * snapping is an exact equation so a ring of 6 equilateral triangle foundations
 * closes on itself with zero drift.
 */
import { type Exact, HALF_ROOT3, ROOT3, ZERO, half, neg } from "./scalar.js";
import {
    type ExactVec3,
    type ExactVec3JSON,
    type Yaw,
    V_ZERO,
    mApply,
    rotY,
    vAdd,
    vEq,
    vFromJSON,
    vSub,
    vToFloat,
    vToJSON,
    vec,
    wrapYaw,
} from "./rotation.js";
import { MODULE, MODULE_STEPS, steps, stepsToFloat, yawToFloat } from "./transform.js";

export const PIECE_KINDS = [
    "FoundationSquare", "FoundationTriangle", "Street", "Wall", "Doorway", "DoorLeaf", "Floor", "Roof", "Stairs",
] as const;

export type PieceKind = (typeof PIECE_KINDS)[number];

/** A foundation's side and a storey's height: one 3 m module, 12 steps. */
export const SIDE: Exact = MODULE;
export const SIDE_METRES = stepsToFloat(MODULE_STEPS);
export const STOREY: Exact = MODULE;
export const STOREY_METRES = stepsToFloat(MODULE_STEPS);

export interface DoorHingeSpec {
    readonly openingWidthM: number;
    readonly openingHeightM: number;
    readonly hingeOffsetLocal: readonly [number, number, number];
    readonly axisLocal: readonly [number, number, number];
    readonly limitsRad: readonly [number, number];
    readonly massKg: number;
    readonly stiffness: number;
    readonly damping: number;
}

/** Matches CubicWave `door_hinged_single_900x2100.glb` KHR revolute door leaf contract. */
export const DOOR_HINGE_SPEC: DoorHingeSpec = Object.freeze<DoorHingeSpec>({
    openingWidthM: 0.9,
    openingHeightM: 2.1,
    hingeOffsetLocal: [-0.45, 0, 0],
    axisLocal: [0, 1, 0],
    limitsRad: [0, Math.PI / 2],
    massKg: 36.5,
    stiffness: 180,
    damping: 18,
});

export interface PiecePose {
    pos: ExactVec3;
    yaw: Yaw;
}

export type SocketKind = "edge" | "top" | "cell";

export interface Socket {
    kind: SocketKind;
    mid: ExactVec3;
    yaw: Yaw;
}

export interface PlacedPiece {
    id: string;
    kind: PieceKind;
    pose: PiecePose;
}

const HALF_SIDE = half(SIDE);
const TRI_IN = HALF_ROOT3;
const TRI_OUT = ROOT3;

export const TRI_EDGE_YAWS: readonly Yaw[] = [6, 2, 10];
export const TRI_CORNER_YAWS: readonly Yaw[] = [0, 4, 8];

const along = (yaw: Yaw, distance: Exact): ExactVec3 => mApply(rotY(yaw), vec(ZERO, ZERO, distance));

const TRI_CORNERS: ExactVec3[] = TRI_CORNER_YAWS.map((y) => along(y, TRI_OUT));

/** Corners of the triangle foundation in its own frame, in metres. */
export const triangleCorners = (): [number, number, number][] => TRI_CORNERS.map(vToFloat);

/** A piece's sockets in its own frame. */
export function localSockets(kind: PieceKind): Socket[] {
    const top: Socket = { kind: "top", mid: vec(ZERO, STOREY, ZERO), yaw: 0 };
    if (kind === "FoundationSquare" || kind === "Floor") {
        return [
            ...[0, 3, 6, 9].map((yaw): Socket => ({ kind: "edge", mid: along(yaw, HALF_SIDE), yaw })),
            top,
            { kind: "cell", mid: V_ZERO, yaw: 0 },
        ];
    }
    if (kind === "Street")
        return [0, 3, 6, 9].map((yaw): Socket => ({ kind: "edge", mid: along(yaw, HALF_SIDE), yaw }));
    if (kind === "FoundationTriangle")
        return TRI_EDGE_YAWS.map((yaw): Socket => ({ kind: "edge", mid: along(yaw, TRI_IN), yaw }));
    return [];
}

/** A socket of a placed piece, in the world. */
export function worldSocket(pose: PiecePose, socket: Socket): Socket {
    return { kind: socket.kind, mid: vAdd(pose.pos, mApply(rotY(pose.yaw), socket.mid)), yaw: wrapYaw(socket.yaw + pose.yaw) };
}

export const worldSockets = (kind: PieceKind, pose: PiecePose): Socket[] => localSockets(kind).map((s) => worldSocket(pose, s));

/** Which kind of socket a piece is placed on. */
export function socketFor(kind: PieceKind): SocketKind {
    if (kind === "Floor" || kind === "Roof")
        return "top";
    return kind === "Stairs" ? "cell" : "edge";
}

/** The pose that puts a piece on a socket. */
export function snapPose(kind: PieceKind, target: Socket, own = 0): PiecePose {
    if (kind === "FoundationSquare" || kind === "FoundationTriangle" || kind === "Street") {
        const edges = localSockets(kind).filter((s) => s.kind === "edge");
        const mine = edges[((own % edges.length) + edges.length) % edges.length];
        const yaw = wrapYaw(target.yaw + 6 - mine.yaw);
        return { pos: vSub(target.mid, mApply(rotY(yaw), mine.mid)), yaw };
    }
    if (kind === "Stairs")
        return { pos: target.mid, yaw: wrapYaw(target.yaw + 3 * own) };
    return { pos: target.mid, yaw: wrapYaw(target.yaw) };
}

export const poseEq = (a: PiecePose, b: PiecePose): boolean => wrapYaw(a.yaw) === wrapYaw(b.yaw) && vEq(a.pos, b.pos);

export type PiecePoseJSON = readonly [ExactVec3JSON, number];
export const poseToJSON = (p: PiecePose): PiecePoseJSON => [vToJSON(p.pos), wrapYaw(p.yaw)];
export const poseFromJSON = (j: PiecePoseJSON): PiecePose => ({ pos: vFromJSON(j[0]), yaw: wrapYaw(j[1]) });

/** The pose as floats: position in metres and yaw in radians. */
export const poseToFloat = (p: PiecePose): { position: [number, number, number]; yaw: number } => ({
    position: vToFloat(p.pos),
    yaw: yawToFloat(p.yaw),
});

/** A pose on the ground lattice: x and z in 0.25 m steps, yaw in twelfths of a turn. */
export function latticePose(xSteps: number, zSteps: number, yaw: Yaw = 0, ySteps = 0): PiecePose {
    return { pos: vec(steps(Math.trunc(xSteps)), steps(Math.trunc(ySteps)), steps(Math.trunc(zSteps))), yaw: wrapYaw(yaw) };
}
