import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { documentGlobs, loadBacklogMap } from "../canon/backlog-map.ts";
import { setCanonIdentity } from "../canon/identity.ts";
import { createFileSystem } from "../canon/index.ts";

// drummond-canon 1.34.10.7: o mapa central canon ↔ Backlog.md é lido daqui — nem o codec nem a camada
// de arquivos guardam lista própria. CANON_BACKLOG_MAP (setado pelo comando de teste) aponta para
// src/test/fixtures/backlog-map.json, cópia do arquivo real do plugin — a suíte do fork não depende de
// o drummond-canon estar instalado na máquina.
const BASE_PROJECT = join(import.meta.dir, "fixtures", "canon-project");
const OVERLAY_PROJECT = join(import.meta.dir, "fixtures", "canon-project-overlay");

describe("mapa central canon ↔ Backlog.md", () => {
	afterEach(() => setCanonIdentity(false));

	test("carrega o mapa base (pastas, estados, valores)", () => {
		const map = loadBacklogMap();
		expect(documentGlobs(map)).toContain("docs/architecture/**");
		expect(map.statuses.DOING?.column).toBe("Em curso");
		expect(map.values.nodeTypeLegacy.correcao).toBe("correção");
	});

	test("sem o arquivo do mapa, recusa com mensagem clara — nunca adivinha", () => {
		const original = process.env.CANON_BACKLOG_MAP;
		process.env.CANON_BACKLOG_MAP = "/tmp/nao-existe-1.34.10.7.json";
		try {
			expect(() => loadBacklogMap()).toThrow(/mapa central/i);
		} finally {
			if (original === undefined) delete process.env.CANON_BACKLOG_MAP;
			else process.env.CANON_BACKLOG_MAP = original;
		}
	});

	test("escopo de documentos hoje (docs/architecture) continua com id/path relativos a ela", async () => {
		const docs = await createFileSystem(BASE_PROJECT).listDocuments();
		const adr = docs.find((d) => d.path === "ADR-001-exemplo.md");
		expect(adr?.id).toBe("doc-ADR-001-exemplo");
	});

	test("pasta nova do mapa (docs/superpowers/specs) entra sem sobreposição do repo, id/path relativos à raiz", async () => {
		const docs = await createFileSystem(BASE_PROJECT).listDocuments();
		const spec = docs.find((d) => d.path === "docs/superpowers/specs/exemplo-spec.md");
		expect(spec).toBeDefined();
		expect(spec?.id).toBe("doc-docs--superpowers--specs--exemplo-spec");
		expect(spec?.title).toBe("Spec de exemplo");
	});

	test("sobreposição do repo troca só o tipo que declara (folders.kinds em canon.config.json > backlog)", async () => {
		const docs = await createFileSystem(OVERLAY_PROJECT).listDocuments();
		const paths = docs.map((d) => d.path);
		expect(paths).toContain("docs/custom/note.md");
		expect(paths).not.toContain("should-not-appear.md");
		expect(docs.find((d) => d.path === "docs/custom/note.md")?.id).toBe("doc-docs--custom--note");
	});

	test("pasta oculta do mapa (.claude/specs) é lida", async () => {
		const docs = await createFileSystem(BASE_PROJECT).listDocuments();
		expect(docs.map((d) => d.path)).toContain(".claude/specs/hidden-spec.md");
	});

	test("nó DONE aparece na lista e no quadro, na coluna Entregue (drummond-canon 1.34.13.1)", async () => {
		const tasks = await createFileSystem(BASE_PROJECT).listTasks();
		expect(tasks.find((t) => t.id === "1.2.9")?.status).toBe("Entregue");
	});

	test("o dataDir dos nós nunca aparece como documento, mesmo sob a pasta observada", async () => {
		const docs = await createFileSystem(BASE_PROJECT).listDocuments();
		expect(docs.some((d) => d.path?.includes("proj-canon"))).toBe(false);
	});
});
