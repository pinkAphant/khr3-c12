# `@khr3/c12` API and Configuration Guide

This guide documents the public `@khr3/c12` API, exact cyclotomic $\mathbb{Z}[1/2, \sqrt{3}]$ types, coordinate conventions, piece sockets, settlement rules, and `InstancedMesh` batching helpers.

## Import Paths

```ts
import {
  Ex,
  exact,
  fromInt,
  toFloat,
  ZERO,
  ONE,
  HALF,
  ROOT3,
  HALF_ROOT3,
  latticePose,
  localSockets,
  worldSockets,
  snapPose,
  poseEq,
  canPlace,
  buildFootprint,
  planSettlement,
  instanceBatches,
  mergeBatches,
  DOOR_HINGE_SPEC,
  TIER_RULES,
} from "@khr3/c12";
```

## Coordinate Conventions

- Right-handed SI metres (`+Y` up).
- `yaw` is an integer in `0..11` representing `30°` (`Math.PI / 6`) steps about `+Y`.
- `yaw = 0` faces `+Z` with left toward `+X` and right toward `-X`.
- Positive yaw rotates `+Z` toward `+X` (counter-clockwise seen from above).
- Building grid step: `STEP = 0.25 m` (`exact(1, 0, 2)`).
- Module size: `MODULE_STEPS = 12` (`MODULE = 3 m`, `SIDE = STOREY = MODULE`, `SIDE_METRES = STOREY_METRES = 3`).

## Exact Cyclotomic Scalars (`Ex` / `scalar`)

An `Exact` represents $(a + b\sqrt{3}) / 2^k$ in canonical reduced form (`k >= 0`).

```ts
export interface Exact {
  readonly a: bigint;
  readonly b: bigint;
  readonly k: number;
}

export type ExactJSON = readonly [string, string, number];
```

### Constants & Constructors

| Export | Value / Signature | Description |
| --- | --- | --- |
| `ZERO` | `0` | Canonical `0/2^0` |
| `ONE` | `1` | Canonical `1/2^0` |
| `NEG_ONE` | `-1` (via `Ex.NEG_ONE`) | Canonical `-1/2^0` |
| `HALF` | `1/2` | Canonical `1/2^1` |
| `ROOT3` | `√3` | Canonical `(0 + 1√3)/2^0` |
| `HALF_ROOT3` | `√3/2` | Canonical `(0 + 1√3)/2^1` |
| `exact` | `(a: bigint \| number, b?: bigint \| number, k?: number) => Exact` | Construct canonical scalar (`b = 0`, `k = 0`) |
| `fromInt` | `(n: number \| bigint) => Exact` | Integer as exact scalar |
| `toFloat` | `(x: Exact) => number` | 53-bit precision float conversion |

Additional helpers exported on `Ex`: `add`, `neg`, `sub`, `mul`, `scale`, `half` (`n = 1`), `isZero`, `eq`, `sign`, `cmp`, `abs`, `min`, `max`, `sum`, `toJSON`, `fromJSON`, `format`.

## Vectors, Yaws, and Rotations (`rotation`)

```ts
export interface ExactVec3 {
  readonly x: Exact;
  readonly y: Exact;
  readonly z: Exact;
}

export type ExactVec3JSON = readonly [ExactJSON, ExactJSON, ExactJSON];
export type Yaw = number; // integer 0..11, 30° steps about +Y

export interface ExactMat3 {
  readonly m: readonly [Exact, Exact, Exact, Exact, Exact, Exact, Exact, Exact, Exact];
}

export type ExactMat3JSON = readonly ExactJSON[]; // length 9, row-major
```

| Export | Signature / Value | Description |
| --- | --- | --- |
| `YAW_STEPS` | `12` | Steps per full turn |
| `YAW_STEP_RADIANS` | `Math.PI / 6` | `30°` in radians |
| `COS12`, `SIN12` | `readonly Exact[]` | Exact cosines/sines for `0..11` |
| `wrapYaw` | `(i: number) => Yaw` | Normalize integer yaw to `0..11` |
| `yawCos`, `yawSin` | `(i: number) => Exact` | Exact cosine/sine |
| `yawRadians` | `(i: number) => number` | Float radians |
| `yawForward`, `yawLeft`, `yawRight` | `(i: number) => ExactVec3` | Unit basis vectors |
| `M_IDENTITY` | `ExactMat3` | 3×3 exact identity matrix |
| `rotY`, `rotX`, `rotZ` | `(i: number) => ExactMat3` | Exact `30°`-step `SO(3)` rotation matrices |
| `mMul`, `mTranspose`, `mApply`, `mEq`, `mDet`, `isProperRotation` | matrix ops | Exact matrix algebra |
| `mToFloat`, `mToQuaternion` | conversion | Row-major float matrix & unit `[x, y, z, w]` quaternion |
| `mToJSON`, `mFromJSON` | `(p: ExactMat3) => ExactMat3JSON` / `(j: ExactMat3JSON) => ExactMat3` | Exact matrix JSON serialization |

Vector helpers: `V_ZERO`, `vec`, `vAdd`, `vSub`, `vNeg`, `vScale`, `vDot`, `vCross`, `vEq`, `vIsZero`, `vLengthSq`, `vToFloat`, `vToJSON`, `vFromJSON`.

## Rigid Transforms & Lattice (`transform`)

```ts
export interface ExactTransform {
  readonly rot: ExactMat3;
  readonly pos: ExactVec3;
}

export interface ExactTransformJSON {
  readonly r: ExactMat3JSON;
  readonly p: ExactVec3JSON;
}
```

| Export | Signature / Value | Description |
| --- | --- | --- |
| `STEP`, `STEP_METRES` | `exact(1, 0, 2)` / `0.25` | Building grid increment (`0.25 m`) |
| `MODULE_STEPS`, `MODULE`, `MODULE_METRES` | `12` / `scale(STEP, 12)` / `3` | One foundation edge / storey height (`3 m`) |
| `steps`, `metres` | `(n: number) => Exact` | Exact length constructors |
| `T_IDENTITY` | `ExactTransform` | Identity transform |
| `transform`, `translation`, `yawTransform`, `placement` | constructors | Build `ExactTransform` |
| `compose`, `invert`, `applyPoint`, `applyDirection`, `tEq`, `relative` | ops | Exact rigid transform algebra |
| `tToFloat` | `(t: ExactTransform) => { position, quaternion }` | Final float pose for Three.js / Rapier |
| `tToJSON`, `tFromJSON` | `(t: ExactTransform) => ExactTransformJSON` / `(j: ExactTransformJSON) => ExactTransform` | Exact transform JSON serialization |
| `latticePoint`, `alongYaw`, `acrossYaw`, `turtleMove` | lattice builders | Exact step movement |
| `stepsToFloat`, `latticeToFloat`, `floatToSteps`, `floatToExact` | conversions | Step/metre conversions (`floatToExact` quantizes to `2^-20 m`) |
| `nearestYaw`, `yawToFloat`, `yawToQuaternion`, `slopeToFloat`, `tiltToFloat` | helpers | Angle/slope helpers |

## Pieces & Socket Snapping (`pieces` & `piecePlacement`)

```ts
export const PIECE_KINDS = [
  "FoundationSquare", "FoundationTriangle", "Street", "Wall",
  "Doorway", "DoorLeaf", "Floor", "Roof", "Stairs",
] as const;

export type PieceKind = (typeof PIECE_KINDS)[number];
export type SocketKind = "edge" | "top" | "cell";

export interface PiecePose {
  pos: ExactVec3;
  yaw: Yaw;
}

export type PiecePoseJSON = readonly [ExactVec3JSON, number];

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
```

### Piece Constants & `DOOR_HINGE_SPEC`

| Export | Value | Description |
| --- | --- | --- |
| `SIDE`, `SIDE_METRES` | `MODULE` / `3` | Foundation side length (`3 m`) |
| `STOREY`, `STOREY_METRES` | `MODULE` / `3` | Storey height (`3 m`) |
| `TRI_EDGE_YAWS` | `[6, 2, 10]` | Equilateral triangle edge socket yaws |
| `TRI_CORNER_YAWS` | `[0, 4, 8]` | Equilateral triangle corner yaws |

`DOOR_HINGE_SPEC` defines the standard `0.9 m × 2.1 m` C12 doorway leaf revolute hinge contract (verified in [src/c12.test.ts](../src/c12.test.ts)):

| Field | Value |
| --- | --- |
| `openingWidthM` | `0.9` |
| `openingHeightM` | `2.1` |
| `hingeOffsetLocal` | `[-0.45, 0, 0]` |
| `axisLocal` | `[0, 1, 0]` |
| `limitsRad` | `[0, Math.PI / 2]` |
| `massKg` | `36.5` |
| `stiffness` | `180` |
| `damping` | `18` |

### Piece Functions

| Export | Signature | Description |
| --- | --- | --- |
| `triangleCorners` | `() => [number, number, number][]` | Triangle foundation corners in metres |
| `localSockets` | `(kind: PieceKind) => Socket[]` | Local `"edge"`, `"top"`, `"cell"` sockets |
| `worldSocket`, `worldSockets` | `(pose, socket) => Socket` / `(kind, pose) => Socket[]` | Transform sockets to world |
| `socketFor` | `(kind: PieceKind) => SocketKind` | Required socket kind for placement |
| `snapPose` | `(kind: PieceKind, target: Socket, own = 0) => PiecePose` | Exact snap onto target socket |
| `poseEq`, `poseToJSON`, `poseFromJSON`, `poseToFloat` | pose helpers | Equality, JSON, `{ position, yaw }` float conversion |
| `latticePose` | `(xSteps: number, zSteps: number, yaw: Yaw = 0, ySteps = 0) => PiecePose` | Ground lattice pose in `0.25 m` steps |
| `canPlace` | `(existing: readonly PlacedPiece[], kind: PieceKind, rawPose: PiecePose) => { ok: boolean; reason: string }` | Exact overlap & structural support check |

## Procedural Settlements (`footprint` & `settlements`)

Consumes any `RoadLike`:

```ts
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

export const SETTLEMENT_TIERS = [
  "village", "town", "suburb", "city_small", "city_medium", "city_large", "ginormous",
] as const;
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

export interface Settlement {
  tier: SettlementTier;
  seed: number;
  streets: PlacedPiece[];
  buildings: Building[];
  pieces: PlacedPiece[];
}

export interface SettlementOptions {
  centerS?: number; // default: road.length / 2
  setback?: number; // default: 2 (clamped >= 0)
}
```

### `TIER_RULES`

| Tier | Span | Spacing | Fill | Width | Depth | Storeys | Rows | Alley |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `village` | `240` | `21` | `0.45` | `[2, 3]` | `[2, 2]` | `[1, 1]` | `1` | `0` |
| `town` | `420` | `15` | `0.65` | `[2, 4]` | `[2, 3]` | `[1, 2]` | `1` | `0` |
| `suburb` | `600` | `18` | `0.85` | `[3, 4]` | `[3, 3]` | `[1, 2]` | `2` | `9` |
| `city_small` | `600` | `15` | `0.9` | `[3, 4]` | `[3, 4]` | `[2, 4]` | `2` | `6` |
| `city_medium` | `900` | `15` | `0.93` | `[3, 4]` | `[4, 4]` | `[3, 8]` | `3` | `6` |
| `city_large` | `1200` | `15` | `0.95` | `[3, 4]` | `[4, 5]` | `[5, 16]` | `3` | `6` |
| `ginormous` | `1800` | `15` | `0.97` | `[3, 4]` | `[4, 6]` | `[8, 40]` | `4` | `6` |

Functions:
- `buildFootprint(id: string, rawPose: PiecePose, w: number, d: number, storeys: number): Building`
- `planSettlement(road: RoadLike, tier: SettlementTier, seed: number, options?: SettlementOptions): Settlement` (defaults: `centerS = road.length / 2`, `setback = 2`)

## Instancing (`instancing`)

```ts
export interface InstanceBatch {
  kind: PieceKind;
  count: number;
  /** `count * 16` floats, column-major. Pass to `new THREE.InstancedBufferAttribute(matrices, 16)`. */
  matrices: Float32Array;
}
```

| Export | Signature | Description |
| --- | --- | --- |
| `writePieceMatrix` | `(p: PlacedPiece, out: Float32Array, offset: number) => void` | Column-major 4×4 matrix |
| `instanceBatches` | `(pieces: readonly PlacedPiece[]) => InstanceBatch[]` | One batch per `PieceKind` |
| `mergeBatches` | `(batches: readonly InstanceBatch[]) => InstanceBatch[]` | Concatenate chunk batches per `PieceKind` |

## Minimal Runtime Usage

```ts
import {
  buildFootprint,
  instanceBatches,
  latticePose,
  planSettlement,
  type RoadLike,
} from "@khr3/c12";

const road: RoadLike = {
  halfWidth: 4,
  length: 600,
  at: (s) => ({ s, pos: [0, 0, s], tangent: [0, 0, 1], left: [1, 0, 0] }),
};

const settlement = planSettlement(road, "town", 7);
const landmark = buildFootprint("hall", latticePose(0, 0, 0), 2, 2, 2);
const batches = instanceBatches([...settlement.pieces, ...landmark.pieces]);
console.log(batches.map((b) => `${b.kind}:${b.count}`));
```
