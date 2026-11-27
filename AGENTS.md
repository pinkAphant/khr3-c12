# `@khr3/c12` (`khr3-c12`) — Agent & Contributor Guide

- **Zero Dependencies**: Keep `@khr3/c12` a pure, zero-dependency TypeScript ESM library (`three` and `koota` free, using column-major `Float32Array` matrices in `instanceBatches` for `THREE.InstancedMesh`).
- **Exact Cyclotomic Arithmetic**: Represent coordinates as exact $\mathbb{Z}[1/2, \sqrt{3}]$ scalars (`(a + b * sqrt(3)) / 2^k` in [src/scalar.ts](./src/scalar.ts)) with 12-step (`30°`, `yaw 0..11`, $\det R = +1$) right-handed SI orientations (`+Y` up, `+Z` forward at `yaw = 0`) and `3.0 m` modular square and equilateral-triangle socket snapping.
- **Module Hygiene & Verification**: Keep every source file in `src/` `<= 250` lines, keep [README.md](./README.md) and [docs/api-reference.md](./docs/api-reference.md) aligned with exports, and verify with `npm run typecheck && npm test && npm run build`.
