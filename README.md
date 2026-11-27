# `@khr3/c12`

Exact architectural grid & procedural town layout for `@khr3/core` and `Kolmo`: zero-dependency cyclotomic $\mathbb{Z}[1/2, \sqrt{3}]$ lattice math, 12-step (`30°`) yaw rotations, `3.0 m` square + equilateral-triangle socket snapping, and road-aware settlement generation (`village` up to `ginormous` city).

- **Why "C12"?** Twelve `30°` yaw steps (`yaw 0..11`) over exact $\mathbb{Z}[1/2, \sqrt{3}]$ coordinates — a ring of 6 equilateral triangle foundations closes on itself with **zero floating-point drift** (`poseEq(pose, first) === true`).
- **Right-handed SI**: `+Y` up, `yaw = 0` faces `+Z`, positive yaw turns `+Z` toward `+X` in `30°` increments.
- **Zero dependencies & zero `koota`**: Consumes any structural `RoadLike` spline (`{ halfWidth, length, at(s) }`, such as `growRoad` from `@pinkaphant/kolmo/world`).

- Full API & integration reference: [docs/api-reference.md](./docs/api-reference.md)
- Runnable example: [example/index.ts](./example/index.ts)
- Source modules: [src/scalar.ts](./src/scalar.ts), [src/rotation.ts](./src/rotation.ts), [src/transform.ts](./src/transform.ts), [src/pieces.ts](./src/pieces.ts), [src/piecePlacement.ts](./src/piecePlacement.ts), [src/footprint.ts](./src/footprint.ts), [src/settlements.ts](./src/settlements.ts), [src/instancing.ts](./src/instancing.ts)

## Install

```sh
npm install @khr3/c12
```

## 1. Exact Cyclotomic Socket Snapping

```ts
import { Ex, ROOT3, toFloat, latticePose, localSockets, worldSockets, snapPose, poseEq } from "@khr3/c12";

console.log(toFloat(Ex.mul(ROOT3, ROOT3))); // 3 (exact)

const own = localSockets("FoundationTriangle").findIndex((s) => s.kind === "edge" && s.yaw === 10);
let pose = latticePose(8, 4, 0);
const first = pose;
for (let i = 0; i < 6; i++) {
  const target = worldSockets("FoundationTriangle", pose).find(
    (s) => s.kind === "edge" && s.yaw === (2 + pose.yaw) % 12,
  )!;
  pose = snapPose("FoundationTriangle", target, own);
}
console.log(poseEq(pose, first)); // true — zero drift around 6 triangles
```

## 2. Procedural Settlements Along Any `RoadLike` Spline

`planSettlement(road, tier, seed, options?)` places modular C12 buildings (`FoundationSquare`, `Wall`, `Doorway`, `DoorLeaf` with `DOOR_HINGE_SPEC`, `Floor` with stairwell cutouts, repeatable `Stairs`, `Roof`) and anchored `Street` pads (`settlement.streets`) along any structural `RoadLike` spline (`at(s) -> { s, pos, tangent, left }`), keeping doors facing the road and every rotated building/street OBB clear of the carriageway and neighbors. `instanceBatches(pieces)` packs one column-major `Float32Array` per `PieceKind` for `THREE.InstancedMesh`:

| Tier (seed 77) | Buildings | Street Pads | Total Pieces | Max Storeys | `InstancedMesh` Batches |
| --- | --- | --- | --- | --- | --- |
| `village` | 14 | 24 | 298 | 1 | 6 |
| `town` | 34 | 56 | 1,378 | 2 | 8 |
| `suburb` | 112 | 66 | 5,219 | 2 | 8 |
| `city_small` | 140 | 80 | 13,088 | 4 | 8 |
| `city_medium` | 330 | 120 | 59,236 | 8 | 8 |
| `city_large` | 451 | 160 | 154,545 | 16 | 8 |
| `ginormous` | 925 | 240 | 778,113 | 40 | 8 |

```ts
import { instanceBatches, planSettlement, type RoadLike } from "@khr3/c12";

// Works with Kolmo's `growRoad(seed, opts)` or any custom spline implementing RoadLike:
const straightRoad: RoadLike = {
  halfWidth: 4,
  length: 600,
  at: (s) => ({ s, pos: [0, 0, s], tangent: [0, 0, 1], left: [1, 0, 0] }),
};

const settlement = planSettlement(straightRoad, "town", 7);
for (const batch of instanceBatches(settlement.pieces)) {
  // batch.kind, batch.count, batch.matrices (Float32Array of length count * 16)
}
```
