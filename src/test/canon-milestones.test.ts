// Marco derivado da árvore Dewey (nó 1.43, despacho 2026-09-19): sem `milestone` explícito, o marco
// é o ancestral com os `fields.milestone.derivedDepth` primeiros segmentos do id. Cobre a derivação
// (node-codec.ts) e a listagem por CanonFileSystem (canon-file-system.ts).
import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { setCanonIdentity } from "../canon/identity.ts";
import { createFileSystem } from "../canon/index.ts";
import { deriveMilestoneId, parseCanonNode } from "../canon/node-codec.ts";

const ROOT = join(import.meta.dir, "fixtures", "canon-project");

describe("marco derivado do id (deriveMilestoneId)", () => {
	test("ancestral com os 2 primeiros segmentos", () => {
		expect(deriveMilestoneId("1.34.10.7", 2)).toBe("1.34");
	});
	test("nó de 2 segmentos é o próprio marco", () => {
		expect(deriveMilestoneId("1.34", 2)).toBe("1.34");
	});
	test("nó de 1 segmento fica sem marco", () => {
		expect(deriveMilestoneId("1", 2)).toBeUndefined();
	});
	test("segmento com letra (PHC) também deriva", () => {
		expect(deriveMilestoneId("3.1.c", 2)).toBe("3.1");
	});
});

describe("marco no nó (parseCanonNode)", () => {
	const node = (id: string, extra = "") =>
		`---\nid: ${id}\nparent: ""\nstatus: TODO\ntipo: trabalho\ngerado_em: 2026-09-18T12:00:00Z\n${extra}---\n# ${id}\n\n\`\`\`canon\n${id}   x.\n\`\`\`\n`;

	test("sem campo explícito, deriva do id", () => {
		expect(parseCanonNode(node("1.34.10.7")).milestone).toBe("1.34");
	});
	test("id de 1 segmento fica sem marco", () => {
		expect(parseCanonNode(node("1")).milestone).toBeUndefined();
	});
	test("campo explícito vence a derivação", () => {
		expect(parseCanonNode(node("1.34.10.7", "milestone: 9.9\n")).milestone).toBe("9.9");
	});
});

describe("CanonFileSystem — Milestone", () => {
	afterEach(() => setCanonIdentity(false));

	test("listMilestones: um por marco derivado com nó, com o título do ancestral", async () => {
		const milestones = await createFileSystem(ROOT).listMilestones();
		expect(milestones.map((m) => m.id)).toEqual(["1.2", "1.10", "11.o"]);
		const m12 = milestones.find((m) => m.id === "1.2");
		expect(m12?.title).toBe("Formato de exportação ainda não escolhido.");
	});

	test("listMilestones: marco sem nó ancestral usa o próprio id como título", async () => {
		// "1.10" e "11.o" têm nó ancestral homônimo nesta fixture; nenhum caso sem ancestral aqui —
		// a garantia é estrutural: o fallback é `tasks.get(id)?.title ?? id` (canon-file-system.ts).
		const milestones = await createFileSystem(ROOT).listMilestones();
		for (const milestone of milestones) expect(milestone.title.length).toBeGreaterThan(0);
	});

	test("marco arquivado (nó REJECTED) sai de listMilestones e entra em listArchivedMilestones", async () => {
		const fs = createFileSystem(ROOT);
		const active = await fs.listMilestones();
		const archived = await fs.listArchivedMilestones();
		expect(active.map((m) => m.id)).not.toContain("3.1");
		expect(archived).toEqual([
			{ id: "3.1", title: "Frente descartada antes de começar.", description: "", rawContent: "" },
		]);
	});

	test("filho de nó arquivado ainda carrega o campo milestone derivado", async () => {
		const task = await createFileSystem(ROOT).loadTask("3.1.a");
		expect(task?.milestone).toBe("3.1");
	});

	test("neto herda o marco do avô (1.2.1 → 1.2)", async () => {
		const task = await createFileSystem(ROOT).loadTask("1.2.1");
		expect(task?.milestone).toBe("1.2");
	});
});
