import { describe, expect, test } from "bun:test";
import { applyViewOrder } from "./view-order";

// drummond-canon 1.34.13.1: sorting a column is a view choice; it reorders what is shown and writes nothing.
describe("applyViewOrder", () => {
	const tasks = [{ id: "1" }, { id: "2" }, { id: "3" }];

	test("without a view order, keeps the incoming order", () => {
		expect(applyViewOrder(tasks, null).map((t) => t.id)).toEqual(["1", "2", "3"]);
	});

	test("shows the tasks in the chosen order", () => {
		expect(applyViewOrder(tasks, ["3", "1", "2"]).map((t) => t.id)).toEqual(["3", "1", "2"]);
	});

	test("a task that arrived after the sort goes to the end; a task that left is dropped", () => {
		const next = [{ id: "1" }, { id: "3" }, { id: "4" }];
		expect(applyViewOrder(next, ["3", "2", "1"]).map((t) => t.id)).toEqual(["3", "1", "4"]);
	});
});
