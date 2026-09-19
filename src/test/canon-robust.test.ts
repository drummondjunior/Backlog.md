import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setCanonIdentity } from "../canon/identity.ts";
import { createFileSystem } from "../canon/index.ts";
import { parseCanonNode } from "../canon/node-codec.ts";

// drummond-canon 1.34.10.5.2: um documento do PHC com cabeçalho que o YAML não lê ("title: 06 — Comercial CRM:
// as-built ...") derrubava a leitura inteira — o quadro dizia "não encontrado" para qualquer nó. Arquivo com
// cabeçalho ruim aparece do mesmo jeito; nunca derruba os outros.
function fakeProject(): string {
	const root = mkdtempSync(join(tmpdir(), "canon-robust-"));
	const arch = join(root, "docs", "architecture");
	mkdirSync(join(arch, "proj-canon"), { recursive: true });
	writeFileSync(
		join(arch, "canon.config.json"),
		JSON.stringify({
			sistema: "teste",
			repoName: "proj",
			paths: {
				dataDir: "docs/architecture/proj-canon",
				monolith: "docs/architecture/00.md",
				pendenciasDir: "docs/p",
				vaultRoot: "docs",
			},
		}),
	);
	writeFileSync(
		join(arch, "06-comercial.md"),
		"---\ntitle: 06 — Comercial CRM: as-built (telas FE + backend)\n---\n# 06 — Comercial CRM\n\ntexto do documento\n",
	);
	writeFileSync(
		join(arch, "proj-canon", "1.md"),
		'---\nid: 1\nparent: ""\nstatus: TODO\ntipo: trabalho\n---\n# 1\n\n```canon\n1   Nó que precisa aparecer.\n```\n',
	);
	return root;
}

describe("cabeçalho que o YAML não lê", () => {
	afterEach(() => setCanonIdentity(false));

	test("documento com cabeçalho ruim aparece e não derruba a leitura dos nós", async () => {
		const fs = createFileSystem(fakeProject());
		const docs = await fs.listDocuments();
		const doc = docs.find((d) => d.path === "06-comercial.md");
		expect(doc?.title).toBe("06 — Comercial CRM");
		expect(doc?.rawContent).toContain("texto do documento");
		expect((await fs.loadTask("1"))?.title).toBe("Nó que precisa aparecer.");
	});

	test("nó com cabeçalho ruim ainda é lido pelas chaves do canon", () => {
		const node =
			'---\nid: 2\nparent: "1"\nstatus: DOING\ntipo: trabalho\ntitle: a: b: c\n---\n# 2\n\n```canon\n2   Texto do nó.\n```\n';
		const task = parseCanonNode(node, "2");
		expect(task.id).toBe("2");
		expect(task.status).toBe("Em curso");
		expect(task.title).toBe("Texto do nó.");
	});
});
