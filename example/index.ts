import {
    Ex,
    ROOT3,
    toFloat,
    latticePose,
    localSockets,
    worldSockets,
    snapPose,
    poseEq,
    planSettlement,
    instanceBatches,
    type RoadLike,
} from "../src/index.js";

console.log("ROOT3 * ROOT3 =", toFloat(Ex.mul(ROOT3, ROOT3)));

const own = localSockets("FoundationTriangle").findIndex((s) => s.kind === "edge" && s.yaw === 10);
let pose = latticePose(8, 4, 0);
const first = pose;
for (let i = 0; i < 6; i++) {
    const target = worldSockets("FoundationTriangle", pose).find(
        (s) => s.kind === "edge" && s.yaw === (2 + pose.yaw) % 12,
    )!;
    pose = snapPose("FoundationTriangle", target, own);
}
console.log("6-triangle ring closed exactly:", poseEq(pose, first));

const road: RoadLike = {
    halfWidth: 4,
    length: 600,
    at: (s) => ({ s, pos: [0, 0, s], tangent: [0, 0, 1], left: [1, 0, 0] }),
};

const settlement = planSettlement(road, "town", 7);
const batches = instanceBatches(settlement.pieces);
console.log(`Town: ${settlement.buildings.length} buildings, ${settlement.streets.length} streets, ${batches.length} instanced batches.`);
for (const b of batches) {
    console.log(`  ${b.kind}: ${b.count}`);
}
