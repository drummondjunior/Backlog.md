import { afterEach, describe, expect, test } from "bun:test";
import { compareCanonIds, isCanonId, setCanonIdentity } from "../canon/identity.ts";
import { normalizeId } from "../utils/prefix-config.ts";
import { canonicalTaskId, isValidTaskId } from "../utils/task-id.ts";
import { compareTaskIds } from "../utils/task-sorting.ts";

// drummond-canon 1.34.10.2: número Dewey passa intacto — só num projeto do canon.
describe("canon identity", () => {
	afterEach(() => setCanonIdentity(false));

	test("reconhece Dewey puro e com letra", () => {
		for (const id of ["0", "1.40", "11.o", "3.4.h.4", "11.g.1.1.1.1.1"]) expect(isCanonId(id)).toBe(true);
		for (const id of ["back-12", "BACK-4.1", "", "1..2", ".2"]) expect(isCanonId(id)).toBe(false);
	});

	test("ordem da árvore: número antes de letra, segmento a segmento", () => {
		const ids = ["1.10", "1.2", "1.2.a", "1.2.1", "11.o", "2"];
		expect([...ids].sort(compareCanonIds)).toEqual(["1.2", "1.2.1", "1.2.a", "1.10", "2", "11.o"]);
	});

	test("projeto comum do Backlog.md: nada muda", () => {
		expect(normalizeId("12", "back")).toBe("BACK-12");
		expect(normalizeId("back-12", "back")).toBe("BACK-12");
		expect(isValidTaskId("11.o")).toBe(false);
		expect(canonicalTaskId("1.40", "back")).toBe("BACK-1.40");
	});

	test("projeto do canon: o número passa intacto, inclusive com letra, e ordena como a árvore", () => {
		setCanonIdentity(true);
		expect(normalizeId("1.40", "back")).toBe("1.40");
		expect(normalizeId("11.o", "back")).toBe("11.o");
		expect(canonicalTaskId("1.40", "back")).toBe("1.40");
		expect(isValidTaskId("11.o")).toBe(true);
		expect(compareTaskIds("1.10", "1.2")).toBeGreaterThan(0);
		expect(compareTaskIds("1.2.a", "1.2.1")).toBeGreaterThan(0);
		expect(normalizeId("back-12", "back")).toBe("BACK-12");
	});
});
