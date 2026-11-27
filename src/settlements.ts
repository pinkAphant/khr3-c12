/**
 * Road-aware C12 settlements: village through ginormous city on any structural `RoadLike` spline.
 */
import { toFloat } from "./scalar.js";
import { vec, yawCos, yawSin } from "./rotation.js";
import { steps, nearestYaw, MODULE_METRES, MODULE_STEPS } from "./transform.js";
import { type PlacedPiece } from "./pieces.js";
import { type Building, buildFootprint } from "./footprint.js";

export { type Building, buildFootprint } from "./footprint.js";

export type RoadV3 = [number, number, number];

export interface RoadSampleLike {
    readonly s: number;
    readonly pos: RoadV3;
    readonly tangent: RoadV3;
    readonly left: RoadV3;
}

export interface RoadLike {
    readonly halfWidth: number;
    readonly length: number;
    at(s: number): RoadSampleLike;
}

export const SETTLEMENT_TIERS = ["village", "town", "suburb", "city_small", "city_medium", "city_large", "ginormous"] as const;
export type SettlementTier = (typeof SETTLEMENT_TIERS)[number];

export interface TierRule {
    span: number;
    spacing: number;
    fill: number;
    width: [number, number];
    depth: [number, number];
    storeys: [number, number];
    rows: number;
    alley: number;
}

export const TIER_RULES: Readonly<Record<SettlementTier, TierRule>> = Object.freeze({
    village: { span: 240, spacing: 21, fill: 0.45, width: [2, 3], depth: [2, 2], storeys: [1, 1], rows: 1, alley: 0 },
    town: { span: 420, spacing: 15, fill: 0.65, width: [2, 4], depth: [2, 3], storeys: [1, 2], rows: 1, alley: 0 },
    suburb: { span: 600, spacing: 18, fill: 0.85, width: [3, 4], depth: [3, 3], storeys: [1, 2], rows: 2, alley: 9 },
    city_small: { span: 600, spacing: 15, fill: 0.9, width: [3, 4], depth: [3, 4], storeys: [2, 4], rows: 2, alley: 6 },
    city_medium: { span: 900, spacing: 15, fill: 0.93, width: [3, 4], depth: [4, 4], storeys: [3, 8], rows: 3, alley: 6 },
    city_large: { span: 1200, spacing: 15, fill: 0.95, width: [3, 4], depth: [4, 5], storeys: [5, 16], rows: 3, alley: 6 },
    ginormous: { span: 1800, spacing: 15, fill: 0.97, width: [3, 4], depth: [4, 6], storeys: [8, 40], rows: 4, alley: 6 },
});

export interface Settlement {
    tier: SettlementTier;
    seed: number;
    streets: PlacedPiece[];
    buildings: Building[];
    pieces: PlacedPiece[];
}

export interface SettlementOptions {
    centerS?: number;
    setback?: number;
}

interface FrontageLot {
    s: number;
    front: RoadV3;
    facing: RoadV3;
    groundY: number;
    hasBuilding: boolean;
}

interface OBB2D {
    cx: number;
    cz: number;
    ux: number;
    uz: number;
    vx: number;
    vz: number;
    hw: number;
    hd: number;
    radius: number;
}

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function childSeed(seed: number, salt: string): number {
    const text = `${seed >>> 0}:${salt}`;
    let h = 2166136261;
    for (let i = 0; i < text.length; i++)
        h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
}

function frontage(road: RoadLike, spacing: number, setback: number): FrontageLot[] {
    const margin = spacing / 2;
    const out: FrontageLot[] = [];
    for (let s = margin; s <= road.length - margin + 1e-9; s += spacing) {
        const f = road.at(s);
        for (const side of ["left", "right"] as const) {
            const k = (side === "left" ? 1 : -1) * (road.halfWidth + setback);
            const front: RoadV3 = [f.pos[0] + f.left[0] * k, f.pos[1], f.pos[2] + f.left[2] * k];
            const facing: RoadV3 = side === "left" ? [-f.left[0], 0, -f.left[2]] : [f.left[0], 0, f.left[2]];
            out.push({ s, front, facing, groundY: f.pos[1], hasBuilding: false });
        }
    }
    return out;
}

const int = (rng: () => number, [lo, hi]: [number, number]): number => lo + Math.floor(rng() * (hi - lo + 1));
const STEP_M = MODULE_METRES / MODULE_STEPS;
const GRID_CELL = 16;

function makeOBB(cx: number, cz: number, yaw: number, hw: number, hd: number): OBB2D {
    const c = toFloat(yawCos(yaw));
    const s = toFloat(yawSin(yaw));
    return { cx, cz, ux: c, uz: -s, vx: s, vz: c, hw, hd, radius: Math.hypot(hw, hd) };
}

function obbOverlap(a: OBB2D, b: OBB2D, margin = 0): boolean {
    const m = margin * 0.5;
    const ahw = a.hw + m, ahd = a.hd + m, bhw = b.hw + m, bhd = b.hd + m;
    const dx = b.cx - a.cx, dz = b.cz - a.cz;
    for (const [nx, nz] of [[a.ux, a.uz], [a.vx, a.vz], [b.ux, b.uz], [b.vx, b.vz]] as const) {
        const rA = ahw * Math.abs(nx * a.ux + nz * a.uz) + ahd * Math.abs(nx * a.vx + nz * a.vz);
        const rB = bhw * Math.abs(nx * b.ux + nz * b.uz) + bhd * Math.abs(nx * b.vx + nz * b.vz);
        if (Math.abs(dx * nx + dz * nz) >= rA + rB)
            return false;
    }
    return true;
}

class SpatialOBBGrid {
    private readonly cells = new Map<string, OBB2D[]>();

    insert(obb: OBB2D): void {
        const x0 = Math.floor((obb.cx - obb.radius) / GRID_CELL);
        const x1 = Math.floor((obb.cx + obb.radius) / GRID_CELL);
        const z0 = Math.floor((obb.cz - obb.radius) / GRID_CELL);
        const z1 = Math.floor((obb.cz + obb.radius) / GRID_CELL);
        for (let gx = x0; gx <= x1; gx++) {
            for (let gz = z0; gz <= z1; gz++) {
                const key = `${gx},${gz}`;
                let bucket = this.cells.get(key);
                if (!bucket) {
                    bucket = [];
                    this.cells.set(key, bucket);
                }
                bucket.push(obb);
            }
        }
    }

    overlapsAny(obb: OBB2D, margin = 0): boolean {
        const reach = obb.radius + margin;
        const x0 = Math.floor((obb.cx - reach) / GRID_CELL);
        const x1 = Math.floor((obb.cx + reach) / GRID_CELL);
        const z0 = Math.floor((obb.cz - reach) / GRID_CELL);
        const z1 = Math.floor((obb.cz + reach) / GRID_CELL);
        const seen = new Set<OBB2D>();
        for (let gx = x0; gx <= x1; gx++) {
            for (let gz = z0; gz <= z1; gz++) {
                const bucket = this.cells.get(`${gx},${gz}`);
                if (!bucket)
                    continue;
                for (const other of bucket) {
                    if (seen.has(other))
                        continue;
                    seen.add(other);
                    if (obbOverlap(obb, other, margin))
                        return true;
                }
            }
        }
        return false;
    }
}

function buildRoadClearance(road: RoadLike): (obb: OBB2D, minDist: number) => boolean {
    const buckets = new Map<string, [number, number][]>();
    const n = Math.max(1, Math.ceil(road.length));
    for (let i = 0; i <= n; i++) {
        const [px, , pz] = road.at((i / n) * road.length).pos;
        const k = `${Math.floor(px / GRID_CELL)},${Math.floor(pz / GRID_CELL)}`;
        let list = buckets.get(k);
        if (!list) {
            list = [];
            buckets.set(k, list);
        }
        list.push([px, pz]);
    }
    return (obb: OBB2D, minDist: number): boolean => {
        const reach = obb.radius + minDist;
        const minSq = minDist * minDist;
        for (let gx = Math.floor((obb.cx - reach) / GRID_CELL); gx <= Math.floor((obb.cx + reach) / GRID_CELL); gx++) {
            for (let gz = Math.floor((obb.cz - reach) / GRID_CELL); gz <= Math.floor((obb.cz + reach) / GRID_CELL); gz++) {
                for (const [px, pz] of buckets.get(`${gx},${gz}`) ?? []) {
                    const dx = px - obb.cx, dz = pz - obb.cz;
                    const ox = Math.max(0, Math.abs(dx * obb.ux + dz * obb.uz) - obb.hw);
                    const oz = Math.max(0, Math.abs(dx * obb.vx + dz * obb.vz) - obb.hd);
                    if (ox * ox + oz * oz < minSq)
                        return false;
                }
            }
        }
        return true;
    };
}

/** Grow a settlement of a tier along a road, deterministically from `seed`, with anchored C12 `Street` town pads. */
export function planSettlement(road: RoadLike, tier: SettlementTier, seed: number, o: SettlementOptions = {}): Settlement {
    const rule = TIER_RULES[tier];
    const rng = mulberry32(childSeed(seed, `settlement:${tier}`));
    const center = o.centerS ?? road.length / 2;
    const s0 = Math.max(0, center - rule.span / 2), s1 = Math.min(road.length, center + rule.span / 2);
    const streetBand = MODULE_METRES + 0.5;
    const baseSetback = Math.max(0, o.setback ?? 2);
    const setback = baseSetback + streetBand + ((rule.width[1] * MODULE_METRES) / 2) * Math.sin(Math.PI / 12);
    const lots = frontage(road, rule.spacing, setback).filter((l) => l.s >= s0 && l.s <= s1);
    const clearOfRoad = buildRoadClearance(road);
    const bRoadMin = road.halfWidth + Math.max(0.75, Math.min(1.5, baseSetback + 0.75));
    const buildingGrid = new SpatialOBBGrid();
    const streetGrid = new SpatialOBBGrid();
    const buildings: Building[] = [];
    const streets: PlacedPiece[] = [];

    for (const lot of lots) {
        const yaw = nearestYaw(lot.facing[0], lot.facing[2]);
        for (let row = 0; row < rule.rows; row++) {
            if (rng() > rule.fill)
                continue;
            const w = int(rng, rule.width), d = int(rng, rule.depth), h = int(rng, rule.storeys);
            const depthM = d * MODULE_METRES;
            const back = row * (rule.depth[1] * MODULE_METRES + rule.alley) + depthM / 2;
            const xSteps = Math.round((lot.front[0] - lot.facing[0] * back) / STEP_M);
            const ySteps = Math.floor(lot.groundY / STEP_M);
            const zSteps = Math.round((lot.front[2] - lot.facing[2] * back) / STEP_M);
            const obb = makeOBB(xSteps * STEP_M, zSteps * STEP_M, yaw, (w * MODULE_METRES) / 2, depthM / 2);
            if (!clearOfRoad(obb, bRoadMin) || buildingGrid.overlapsAny(obb, 0.5))
                continue;
            buildingGrid.insert(obb);
            lot.hasBuilding = true;
            buildings.push(buildFootprint(`${tier}-${buildings.length}`, { pos: vec(steps(xSteps), steps(ySteps), steps(zSteps)), yaw }, w, d, h));
        }
    }

    for (const lot of lots) {
        if (!lot.hasBuilding)
            continue;
        const yaw = nearestYaw(lot.facing[0], lot.facing[2]);
        const sxSteps = Math.round((lot.front[0] + lot.facing[0] * (streetBand - MODULE_METRES * 0.5)) / STEP_M);
        const sySteps = Math.floor(lot.groundY / STEP_M);
        const szSteps = Math.round((lot.front[2] + lot.facing[2] * (streetBand - MODULE_METRES * 0.5)) / STEP_M);
        const sObb = makeOBB(sxSteps * STEP_M, szSteps * STEP_M, yaw, MODULE_METRES / 2, MODULE_METRES / 2);
        if (!clearOfRoad(sObb, road.halfWidth + 0.6))
            continue;
        if (streetGrid.overlapsAny(sObb, 0.05) || buildingGrid.overlapsAny(sObb, 0.05))
            continue;
        streetGrid.insert(sObb);
        streets.push({ id: `${tier}-street-${streets.length}`, kind: "Street", pose: { pos: vec(steps(sxSteps), steps(sySteps), steps(szSteps)), yaw } });
    }

    return { tier, seed, streets, buildings, pieces: [...streets, ...buildings.flatMap((b) => b.pieces)] };
}
