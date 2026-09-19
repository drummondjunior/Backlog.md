import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCanonNode } from "../canon/node-codec.ts";

// drummond-canon 1.43: contrato entre o que node-edit.js grava e o que o codec do fork lê. A fixture
// (canon-node-all-fields.md) é a mesma que scripts/canon-tools/test/fixtures/node-with-all-fields.md do
// plugin — gravada só pelo node-edit, nunca à mão — para o formato nunca divergir em silêncio (spec
// docs/superpowers/specs/2026-09-18-backlog-connector-design.md §4.2).
const FIXTURE = join(import.meta.dir, "fixtures", "canon-node-all-fields.md");

describe("codec lê todo campo que o node-edit grava (nó 1.43)", () => {
	const content = readFileSync(FIXTURE, "utf8");
	const task = parseCanonNode(content, "9.9");

	test("cabeçalho, valor único", () => {
		expect(task.priority).toBe("high");
		expect(task.type).toBe("feature");
		expect(task.dueDate).toBe("2026-12-31");
		expect(task.milestone).toBe("v1");
		expect(task.reporter).toBe("drummond");
		expect(task.project).toBe("canon");
		expect(task.onStatusChange).toBe("notify-team");
	});

	test("cabeçalho, lista", () => {
		expect(task.assignee).toEqual(["drummond"]);
		expect(task.dependencies).toEqual(["1"]);
		expect(task.documentation).toEqual(["docs/architecture/y.md"]);
		expect(task.modifiedFiles).toEqual(["scripts/canon-tools/node-fields.js"]);
		expect(task.references).toEqual(["docs/architecture/x.md"]);
	});

	test("labels = tipo + labels do frontmatter, sem repetir", () => {
		expect(task.labels).toEqual(["trabalho", "bug", "urgente"]);
	});

	test("datas: created_date e updated_date do frontmatter", () => {
		expect(task.createdDate).toBe("2026-09-19 10:57");
		expect(task.updatedDate).toBe("2026-09-19 10:57");
	});

	test("descrição vem da seção ## Description, nunca uma cópia do título", () => {
		expect(task.description).toBe("descrição completa do nó de exemplo");
		expect(task.description).not.toBe(task.title);
	});

	test("critérios de aceite: marcado e não marcado, numerados", () => {
		expect(task.acceptanceCriteriaItems).toEqual([
			{ checked: true, text: "critério de aceite um", index: 1 },
			{ checked: false, text: "critério de aceite dois", index: 2 },
		]);
	});

	test("definição de pronto", () => {
		expect(task.definitionOfDoneItems).toEqual([{ checked: false, text: "item de definição de pronto", index: 1 }]);
	});

	test("plano de implementação e resumo final", () => {
		expect(task.implementationPlan).toBe("passo um; passo dois");
		expect(task.finalSummary).toBe("resumo final do trabalho");
	});

	test("comentário: autor, data e corpo", () => {
		expect(task.comments).toEqual([
			{ index: 1, body: "primeiro comentário", createdDate: "2026-09-19 10:57", author: "drummond" },
		]);
	});

	test("notas de implementação = ## Journal, não uma 2ª seção", () => {
		expect(task.implementationNotes).toBe("[2026-09-19 10:57] achado registrado durante o exemplo");
	});
});
