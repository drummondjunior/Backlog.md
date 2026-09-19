import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { CanonReadOnlyError } from "../canon/canon-file-system.ts";
import { setCanonIdentity } from "../canon/identity.ts";
import { MUTATING_CORE_METHODS } from "../canon/read-only-core.ts";
import { Core } from "../core/backlog.ts";

// drummond-canon 1.34.10.5.2: o núcleo do Backlog.md grava no disco direto (move o arquivo do nó ao arquivar,
// apaga, reescreve depois do editor) — o CanonFileSystem sozinho não segura. Num projeto do canon, todo método
// do núcleo que grava recusa com CanonReadOnlyError e nenhum arquivo muda. Escrever é o nó 1.34.7.
const FIXTURE = join(import.meta.dir, "fixtures", "canon-project");
const WRITE_NAME =
	/^(create|update|archive|complete|move|reorder|promote|demote|delete|remove|rename|edit|add|set|save)[A-Z]/;

function snapshot(root: string): string {
	const hash = createHash("sha256");
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir).sort()) {
			const path = join(dir, entry);
			if (statSync(path).isDirectory()) walk(path);
			else hash.update(relative(root, path)).update(readFileSync(path));
		}
	};
	walk(root);
	return hash.digest("hex");
}

describe("núcleo somente leitura num projeto do canon", () => {
	afterEach(() => setCanonIdentity(false));

	test("a lista cobre todo método do núcleo com nome de gravação", () => {
		const names = Object.getOwnPropertyNames(Core.prototype).filter((n) => WRITE_NAME.test(n));
		const missing = names.filter((n) => !MUTATING_CORE_METHODS.includes(n as (typeof MUTATING_CORE_METHODS)[number]));
		expect(missing).toEqual([]);
	});

	test("cada método que grava recusa e nenhum arquivo muda", async () => {
		const root = mkdtempSync(join(tmpdir(), "canon-ro-"));
		cpSync(FIXTURE, root, { recursive: true });
		const before = snapshot(root);
		const core = new Core(root);
		for (const name of MUTATING_CORE_METHODS) {
			const method = (core as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[name] as (
				...args: unknown[]
			) => Promise<unknown>;
			expect(typeof method).toBe("function");
			let error: unknown;
			try {
				await method.call(core, "1", false);
			} catch (e) {
				error = e;
			}
			expect(error, name).toBeInstanceOf(CanonReadOnlyError);
		}
		expect(snapshot(root)).toBe(before);
	});

	test("projeto comum do Backlog.md não é afetado", () => {
		const core = new Core(mkdtempSync(join(tmpdir(), "comum-")));
		expect(Object.hasOwn(core, "archiveTask")).toBe(false);
	});
});
