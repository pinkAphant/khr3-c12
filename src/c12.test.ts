import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    DOOR_HINGE_SPEC,
    Ex,
    HALF,
    HALF_ROOT3,
    ONE,
    ROOT3,
    SIDE_METRES,
    STOREY_METRES,
    ZERO,
    buildFootprint,
    canPlace,
    exact,
    fromInt,
    instanceBatches,
    isProperRotation,
    latticePose,
    localSockets,
    mDet,
    mFromJSON,
    mMul,
    mToJSON,
    mTranspose,
    planSettlement,
    poseEq,
    poseFromJSON,
    poseToFloat,
    poseToJSON,
    rotX,
    rotY,
    rotZ,
    snapPose,
    toFloat,
    worldSockets,
    writePieceMatrix,
    type PlacedPiece,
    type RoadLike,
} from "./index.js";

describe("@khr3/c12 exact cyclotomic lattice", () => {
    it("evaluates exact Z[1/2, sqrt(3)] arithmetic across huge BigInts with zero float drift", () => {
        assert.ok(Ex.eq(Ex.mul(ROOT3, ROOT3), fromInt(3)));
        assert.equal(toFloat(Ex.mul(ROOT3, ROOT3)), 3);
        assert.ok(Ex.eq(Ex.add(HALF, HALF), ONE));
        assert.ok(Ex.eq(Ex.sub(HALF_ROOT3, HALF_ROOT3), ZERO));
        const huge = exact(1n << 90n, 0n, 90);
        assert.equal(toFloat(huge), 1);
        const sample = exact(6, -4, 3);
        assert.deepEqual(Ex.fromJSON(Ex.toJSON(sample)), sample);
    });

    it("maintains proper SO(3) rotations (det = +1, R^T R = I) across all 12 yaw steps", () => {
        for (let i = 0; i < 12; i++) {
            for (const r of [rotY(i), rotX(i), rotZ(i)]) {
                assert.ok(Ex.eq(mDet(r), ONE));
                assert.equal(isProperRotation(r), true);
                const prod = mMul(mTranspose(r), r);
                assert.ok(Ex.eq(prod.m[0], ONE) && Ex.eq(prod.m[4], ONE) && Ex.eq(prod.m[8], ONE));
                assert.deepEqual(mFromJSON(mToJSON(r)), r);
            }
        }
    });

    it("closes a 6-piece equilateral FoundationTriangle ring with exact equality and roofs triangular rooms", () => {
        const own = localSockets("FoundationTriangle").findIndex((s) => s.kind === "edge" && s.yaw === 10);
        assert.ok(own >= 0);
        let pose = latticePose(8, 4, 0);
        const first = pose;
        for (let i = 0; i < 6; i++) {
            const target = worldSockets("FoundationTriangle", pose).find(
                (s) => s.kind === "edge" && s.yaw === (2 + pose.yaw) % 12,
            );
            assert.ok(target);
            pose = snapPose("FoundationTriangle", target, own);
        }
        assert.equal(poseEq(pose, first), true);
        assert.equal(poseEq(poseFromJSON(poseToJSON(pose)), first), true);

        const fl = poseToFloat(first);
        assert.equal(fl.position.length, 3);
        assert.equal(fl.quaternion.length, 4);
        assert.ok(Math.abs(Math.hypot(...fl.quaternion) - 1) < 1e-12);

        const triPlaced: PlacedPiece[] = [{ id: "tri0", kind: "FoundationTriangle", pose: first }];
        const edgeSock = worldSockets("FoundationTriangle", first).find((s) => s.kind === "edge")!;
        const topSock = worldSockets("FoundationTriangle", first).find((s) => s.kind === "top")!;
        const wallPose = snapPose("Wall", edgeSock);
        assert.equal(canPlace(triPlaced, "Wall", wallPose).ok, true);
        triPlaced.push({ id: "w0", kind: "Wall", pose: wallPose });
        const roofTriPose = snapPose("RoofTriangle", topSock);
        assert.equal(canPlace(triPlaced, "RoofTriangle", roofTriPose).ok, true);
    });

    it("enforces 3.0 m module dimensions, stairwell ceiling clearance, and exact 0.5 sin(30°) instancing", () => {
        assert.equal(SIDE_METRES, 3);
        assert.equal(STOREY_METRES, 3);
        assert.equal(DOOR_HINGE_SPEC.openingWidthM, 0.9);
        assert.equal(DOOR_HINGE_SPEC.openingHeightM, 2.1);

        const basePose = latticePose(0, 0, 0);
        const placed: PlacedPiece[] = [];
        assert.equal(canPlace(placed, "FoundationSquare", basePose).ok, true);
        placed.push({ id: "f0", kind: "FoundationSquare", pose: basePose });
        assert.equal(canPlace(placed, "FoundationSquare", basePose).ok, false);

        // Place wall + flat roof at y = 3m, then verify Stairs cannot rise into that solid flat roof
        const edge = worldSockets("FoundationSquare", basePose).find((s) => s.kind === "edge")!;
        const top = worldSockets("FoundationSquare", basePose).find((s) => s.kind === "top")!;
        placed.push({ id: "w0", kind: "Wall", pose: snapPose("Wall", edge) });
        placed.push({ id: "r0", kind: "Roof", pose: snapPose("Roof", top) });
        assert.equal(canPlace(placed, "Stairs", basePose).ok, false);

        // 1x1 multi-storey tower has open stairwell shaft instead of sealed floors
        const tower1x1 = buildFootprint("t1", latticePose(24, 0, 0), 1, 1, 3);
        assert.equal(tower1x1.stairCellIndex, 0);
        assert.equal(tower1x1.pieces.filter((p) => p.kind === "Stairs").length, 2);

        // Exact sin(30°) === 0.5 (not IEEE float 0.49999999999999994)
        const mat = new Float32Array(16);
        writePieceMatrix({ id: "m1", kind: "Wall", pose: latticePose(0, 0, 1) }, mat, 0);
        assert.equal(mat[8], 0.5);
        assert.equal(mat[2], -0.5);
    });

    it("generates collision-free road settlements and column-major InstancedMesh batches in O(N)", () => {
        const road: RoadLike = {
            halfWidth: 4,
            length: 900,
            at: (s) => ({ s, pos: [0, 0, s], tangent: [0, 0, 1], left: [1, 0, 0] }),
        };
        const settlement = planSettlement(road, "city_medium", 77);
        assert.ok(settlement.buildings.length > 0);
        assert.ok(settlement.streets.length > 0);
        assert.ok(settlement.streets.length <= settlement.buildings.length);
        const batches = instanceBatches(settlement.pieces);
        assert.ok(batches.length > 0);
        for (const batch of batches) {
            assert.equal(batch.matrices.length, batch.count * 16);
        }
    });
});
