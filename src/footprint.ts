/**
 * Rectangular C12 building footprint generator.
 */
import { type ExactVec3, mApply, rotY, vAdd, vec, wrapYaw } from "./rotation.js";
import { steps, MODULE_STEPS } from "./transform.js";
import { type PieceKind, type PiecePose, type PlacedPiece, worldSockets } from "./pieces.js";

export interface Building {
    id: string;
    pose: PiecePose;
    width: number;
    depth: number;
    storeys: number;
    stairCellIndex: number | null;
    doorPose: PiecePose;
    pieces: PlacedPiece[];
}

const exactKey = (v: ExactVec3): string => `${v.x.a}/${v.x.b}/${v.x.k}|${v.y.a}/${v.y.b}/${v.y.k}|${v.z.a}/${v.z.b}/${v.z.k}`;

/** Build one `w x d` square-module building at an exact pose, `storeys` tall. */
export function buildFootprint(id: string, rawPose: PiecePose, w: number, d: number, storeys: number): Building {
    if (!Number.isSafeInteger(w) || w < 1 || !Number.isSafeInteger(d) || d < 1 || !Number.isSafeInteger(storeys) || storeys < 1) {
        throw new RangeError(`buildFootprint: w, d, storeys must be positive integers, got ${w}x${d}x${storeys}`);
    }
    const yaw = wrapYaw(rawPose.yaw);
    const pose: PiecePose = { pos: rawPose.pos, yaw };
    const pieces: PlacedPiece[] = [];
    const add = (kind: PieceKind, p: PiecePose): number => pieces.push({ id: `${id}/${kind}${pieces.length}`, kind, pose: p });
    const rot = rotY(yaw);
    const cells: PiecePose[] = [];
    for (let i = 0; i < w; i++) {
        for (let j = 0; j < d; j++) {
            const local = vec(steps((2 * i - (w - 1)) * (MODULE_STEPS / 2)), steps(0), steps((2 * j - (d - 1)) * (MODULE_STEPS / 2)));
            cells.push({ pos: vAdd(pose.pos, mApply(rot, local)), yaw });
        }
    }
    const baseEdges = cells.flatMap((c) => worldSockets("FoundationSquare", c).filter((s) => s.kind === "edge"));
    const edgeCounts = new Map<string, number>();
    for (const e of baseEdges)
        edgeCounts.set(exactKey(e.mid), (edgeCounts.get(exactKey(e.mid)) ?? 0) + 1);
    const baseOuter = baseEdges.filter((e) => edgeCounts.get(exactKey(e.mid)) === 1);
    const frontOuter = baseOuter.filter((e) => e.yaw === yaw);
    const doorBase = frontOuter[Math.floor(frontOuter.length / 2)];
    const stairCellIndex = storeys > 1 ? 0 : null;
    const baseStairYaw = d === 1 && w >= 2 ? wrapYaw(yaw + 3) : yaw;
    let doorPose = pose;
    for (let k = 0; k < storeys; k++) {
        const lift = vec(steps(0), steps(k * MODULE_STEPS), steps(0));
        for (let idx = 0; idx < cells.length; idx++) {
            if (k === 0)
                add("FoundationSquare", cells[idx]);
            else if (idx !== stairCellIndex)
                add("Floor", { pos: vAdd(cells[idx].pos, lift), yaw });
        }
        for (const e of baseOuter) {
            const edgePose: PiecePose = { pos: vAdd(e.mid, lift), yaw: e.yaw };
            if (k === 0 && e === doorBase) {
                doorPose = edgePose;
                add("Doorway", edgePose);
                add("DoorLeaf", edgePose);
            }
            else {
                add("Wall", edgePose);
            }
        }
        if (stairCellIndex !== null && k < storeys - 1) {
            const flightYaw = k % 2 === 1 ? wrapYaw(baseStairYaw + 6) : baseStairYaw;
            add("Stairs", { pos: vAdd(cells[stairCellIndex].pos, lift), yaw: flightYaw });
        }
    }
    const roofLift = vec(steps(0), steps(storeys * MODULE_STEPS), steps(0));
    for (let idx = 0; idx < cells.length; idx++) {
        add("Roof", { pos: vAdd(cells[idx].pos, roofLift), yaw });
    }
    return { id, pose, width: w, depth: d, storeys, stairCellIndex, doorPose, pieces };
}
