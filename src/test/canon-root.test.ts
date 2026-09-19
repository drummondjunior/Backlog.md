import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { findBacklogRoot } from "../utils/find-backlog-root.ts";

// drummond-canon 1.34.10.5: a CLI deles acha a raiz pela pasta backlog/ ou pelo backlog.json; projeto do canon
// tem docs/architecture/canon.config.json — sem reconhecer isso, "backlog board" nem chegava ao conector.
const ROOT = join(import.meta.dir, "fixtures", "canon-project");

describe("raiz de projeto do canon", () => {
	test("acha a raiz a partir dela e de uma subpasta", async () => {
		expect(await findBacklogRoot(ROOT)).toBe(ROOT);
		expect(await findBacklogRoot(join(ROOT, "docs", "architecture"))).toBe(ROOT);
	});
});
