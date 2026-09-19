import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { setCanonIdentity } from "../canon/identity.ts";
import { CanonFileSystem, CanonReadOnlyError, createFileSystem } from "../canon/index.ts";
import { FileSystem } from "../file-system/operations.ts";
import type { BacklogConfig } from "../types/index.ts";

const ROOT = join(import.meta.dir, "fixtures", "canon-project");

describe("CanonFileSystem", () => {
	// createFileSystem liga a identidade Dewey global (setCanonIdentity) — sem isto, o resto da
	// suíte herdaria "true" e trataria ids comuns do Backlog.md como nó do canon.
	afterEach(() => setCanonIdentity(false));

	test("é escolhido quando há canon.config.json, e não nos outros projetos", () => {
		expect(createFileSystem(ROOT)).toBeInstanceOf(CanonFileSystem);
		expect(createFileSystem(import.meta.dir)).not.toBeInstanceOf(CanonFileSystem);
		expect(createFileSystem(import.meta.dir)).toBeInstanceOf(FileSystem);
	});
	test("lista os nós de trabalho, sem o estrutural, na ordem da árvore", async () => {
		const ids = (await createFileSystem(ROOT).listTasks()).map((t) => t.id);
		expect(ids).toEqual(["1", "1.2", "1.2.1", "1.10", "3.1.a", "11.o", "20"]);
	});
	test("nó estrutural por tipo (não só por status) some do quadro/lista, mas continua legível (1.34.10.5.3)", async () => {
		const fs = createFileSystem(ROOT);
		const ids = (await fs.listTasks()).map((t) => t.id);
		expect(ids).not.toContain("1.11");
		expect((await fs.loadTask("1.11"))?.id).toBe("1.11");
	});
	test("carrega um nó pelo número, inclusive com letra", async () => {
		expect((await createFileSystem(ROOT).loadTask("11.o"))?.id).toBe("11.o");
	});
	test("as pastas observadas pelo tempo real são as do canon", () => {
		const fs = createFileSystem(ROOT) as CanonFileSystem;
		expect(fs.tasksDir).toBe(join(ROOT, "docs/architecture/proj-canon"));
		expect(fs.docsDir).toBe(join(ROOT, "docs/architecture"));
	});
	test("config do quadro com as colunas do canon", async () => {
		const cfg = await createFileSystem(ROOT).loadConfig();
		expect(cfg?.projectName).toBe("proj");
		expect(cfg?.statuses).toContain("Em curso");
	});
	test("gravar recusa", async () => {
		const fs = createFileSystem(ROOT);
		await expect(fs.saveTask({ id: "9" } as never)).rejects.toBeInstanceOf(CanonReadOnlyError);
	});
	test("config geral: saveConfig grava no computador, não recusa (nó 1.34.12)", async () => {
		const settingsFile = join(import.meta.dir, "fixtures", "canon-settings.test.json");
		const previousEnv = process.env.CANON_SETTINGS_FILE;
		process.env.CANON_SETTINGS_FILE = settingsFile;
		try {
			const fs = createFileSystem(ROOT);
			const before = await fs.loadConfig();
			expect(before?.dateFormat).toBe("yyyy-mm-dd hh:mm");
			await fs.saveConfig({ ...(before as BacklogConfig), dateFormat: "dd/mm/yyyy", projectName: "outro nome" });
			const after = await fs.loadConfig();
			expect(after?.dateFormat).toBe("dd/mm/yyyy");
			// projectName continua computado do projeto, nunca sobrescrito pela config geral.
			expect(after?.projectName).toBe("proj");
		} finally {
			if (previousEnv === undefined) delete process.env.CANON_SETTINGS_FILE;
			else process.env.CANON_SETTINGS_FILE = previousEnv;
			await Bun.file(settingsFile)
				.delete()
				.catch(() => {});
		}
	});
});
