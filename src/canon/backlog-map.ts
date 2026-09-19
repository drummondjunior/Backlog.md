// Mapa central canon ↔ Backlog.md (drummond-canon, nó 1.34.10.7). Fonte única: este arquivo lê
// `scripts/canon-tools/backlog-map.json` do plugin (ou o caminho de `CANON_BACKLOG_MAP`, usado pelos
// testes) e aplica a sobreposição por repo (`backlog` em `canon.config.json`). Nem o codec
// (node-codec.ts) nem a camada de arquivos (canon-file-system.ts) guardam lista própria — os dois leem
// daqui. Desenho: docs/superpowers/specs/2026-09-18-backlog-connector-design.md §4.3.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface BacklogMapStatus {
	column: string | null;
	group: "board" | "completed" | "archived" | "structural";
	draft?: boolean;
}

export interface BacklogMapFolders {
	documents: string[];
	excluded: string[];
	decisionFileNames: string[];
}

export interface BacklogMapValues {
	type: string[];
	priority: string[];
	nodeTypes: string[];
	nodeTypeLegacy: Record<string, string>;
}

export interface BacklogMap {
	folders: BacklogMapFolders;
	statuses: Record<string, BacklogMapStatus>;
	fields: Record<string, unknown>;
	values: BacklogMapValues;
}

const DEFAULT_MAP_PATH = join(homedir(), ".claude/skills/drummond-canon/scripts/canon-tools/backlog-map.json");

function mapFilePath(): string {
	return process.env.CANON_BACKLOG_MAP || DEFAULT_MAP_PATH;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

/** Sobrepõe chave a chave; objeto funde recursivo, o resto (inclusive array) troca inteiro. */
function overlay(base: unknown, override: unknown): unknown {
	if (!isPlainObject(base) || !isPlainObject(override)) return override === undefined ? base : override;
	const out: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(override)) out[key] = overlay(base[key], value);
	return out;
}

function repoOverride(repoRoot: string): Record<string, unknown> {
	for (const file of ["docs/architecture/canon.config.json", "canon.config.json"]) {
		const configPath = join(repoRoot, file);
		if (!existsSync(configPath)) continue;
		try {
			const config = JSON.parse(readFileSync(configPath, "utf8")) as { backlog?: Record<string, unknown> };
			return config.backlog ?? {};
		} catch {
			return {};
		}
	}
	return {};
}

const baseMapCache = new Map<string, BacklogMap>();

function loadBaseMap(): BacklogMap {
	const path = mapFilePath();
	const cached = baseMapCache.get(path);
	if (cached) return cached;
	if (!existsSync(path)) {
		throw new Error(
			`Mapa central canon ↔ Backlog.md não encontrado em "${path}". ` +
				"Instale o plugin drummond-canon ou defina CANON_BACKLOG_MAP apontando para o arquivo — " +
				"o conector nunca adivinha este mapeamento.",
		);
	}
	const map = JSON.parse(readFileSync(path, "utf8")) as BacklogMap;
	baseMapCache.set(path, map);
	return map;
}

/**
 * Mapa central, com a sobreposição do repo aplicada quando `repoRoot` é passado. Sem `repoRoot`
 * (chamado de código sem contexto de projeto, como o codec do nó), devolve só o mapa base.
 */
export function loadBacklogMap(repoRoot?: string): BacklogMap {
	const base = loadBaseMap();
	if (!repoRoot) return base;
	return overlay(base, repoOverride(repoRoot)) as BacklogMap;
}
