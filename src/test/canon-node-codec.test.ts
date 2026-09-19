import { describe, expect, test } from "bun:test";
import { cleanNodeText, isCanonNode, parseCanonNode } from "../canon/node-codec.ts";
import { parseTask } from "../markdown/parser.ts";

const node = (id: string, status: string, text: string, extra = "") =>
	`---\nid: ${id}\nparent: "1"\nstatus: ${status}\ntipo: trabalho\ngerado_em: 2026-09-18T12:00:00Z\n---\n# ${id}\n\n\`\`\`canon\n${id}   ${text}\n\`\`\`\n${extra}`;

describe("canon node codec", () => {
	test("reconhece nó do canon e só ele", () => {
		expect(isCanonNode(node("1.40", "DOING", "x"))).toBe(true);
		expect(isCanonNode("---\nid: back-1\ntitle: x\n---\n## Description\n")).toBe(false);
	});
	test("mapeia as chaves existentes", () => {
		const t = parseCanonNode(
			node(
				"1.40",
				"DOING",
				"Embeddings viajam no git. Um arquivo por nó.",
				"\n## Journal\n- [2026-09-18 16:00] medido 4KB por nó\n",
			),
		);
		expect(t.id).toBe("1.40");
		expect(t.title).toBe("Embeddings viajam no git.");
		expect(t.status).toBe("Em curso");
		expect(t.parentTaskId).toBe("1");
		expect(t.labels).toEqual(["trabalho"]);
		expect(t.createdDate).toBe("2026-09-18 12:00");
		expect(t.implementationNotes).toContain("medido 4KB por nó");
	});
	test("estado fora do canon aparece como Estado inválido", () => {
		expect(parseCanonNode(node("8", "UNKNOWN", "x")).status).toBe("Estado inválido");
	});
	test("limpeza sem cortar conteúdo", () => {
		expect(cleanNodeText("# L647 | ├── 3.8.b.13.1 AUDIT", "3.8.b.13")).toBe("3.8.b.13.1 AUDIT");
		expect(cleanNodeText("16.a BUG: não [DONE 2026-07-29] │ batia", "16.a")).toBe("BUG: não batia");
		expect(cleanNodeText("9.1 L1 (review Opus LOW): x", "9.1")).toBe("L1 (review Opus LOW): x");
		expect(cleanNodeText("quando TODOS sumiram", "1")).toBe("quando TODOS sumiram");
	});
	test("campo novo com o nome do Backlog.md é lido", () => {
		const t = parseCanonNode(
			node("2", "TODO", "x").replace("tipo: trabalho", "tipo: trabalho\npriority: high\nassignee: [drummond]"),
		);
		expect(t.priority).toBe("high");
		expect(t.assignee).toEqual(["drummond"]);
	});
	test("parseTask delega ao codec quando o conteúdo é nó do canon", () => {
		expect(parseTask(node("11.o", "TODO", "Dieta de agentes. Resto.")).id).toBe("11.o");
	});
});
