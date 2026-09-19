// Configuração GERAL do canon, do COMPUTADOR — não por projeto (drummond-canon, nó 1.34.12; spec
// §2 "Configuração: Geral (do computador), não por projeto", 2026-09-18). A tela Settings deles
// continua a mesma; só o destino da leitura/escrita muda, de `backlog.config.yml` do projeto para
// `~/.claude/canon-settings.json`, compartilhado por todo projeto do canon neste computador.
//
// Campos da tela Settings persistidos aqui (os que ela mostra como editáveis): dateFormat,
// autoCommit, remoteOperations, defaultStatus, defaultEditor, definitionOfDone, defaultPort,
// autoOpenBrowser, hideEmptyColumns, maxColumnWidth, taskResolutionStrategy, zeroPaddedIds.
// FORA (a tela mostra, mas não é geral do computador): `projectName` (nome do repo aberto) e
// `prefixes` (a tela já marca "read-only" — vem do canon.config.json de cada projeto). Os dois
// continuam computados por `CanonFileSystem.loadConfig()` a cada leitura, nunca sobrescritos daqui.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { BacklogConfig } from "../types/index.ts";

const DEFAULT_SETTINGS_PATH = join(homedir(), ".claude", "canon-settings.json");

/** Campos que a tela Settings grava aqui — o resto do BacklogConfig fica de fora (ver comentário acima). */
const GENERAL_FIELDS = [
	"dateFormat",
	"autoCommit",
	"remoteOperations",
	"defaultStatus",
	"defaultEditor",
	"definitionOfDone",
	"defaultPort",
	"autoOpenBrowser",
	"hideEmptyColumns",
	"maxColumnWidth",
	"taskResolutionStrategy",
	"zeroPaddedIds",
] as const satisfies readonly (keyof BacklogConfig)[];

function settingsPath(): string {
	return process.env.CANON_SETTINGS_FILE || DEFAULT_SETTINGS_PATH;
}

/** Overrides gravados pela tela, deste computador — `{}` sem arquivo ou com JSON ilegível. */
export function readCanonSettings(): Partial<BacklogConfig> {
	try {
		if (!existsSync(settingsPath())) return {};
		return JSON.parse(readFileSync(settingsPath(), "utf8"));
	} catch {
		return {};
	}
}

/** Grava só os campos gerais (`GENERAL_FIELDS`) do config recebido da tela — nunca `projectName`/`prefixes`. */
export function writeCanonSettings(config: BacklogConfig): Partial<BacklogConfig> {
	const path = settingsPath();
	const next: Partial<BacklogConfig> = {};
	for (const key of GENERAL_FIELDS) {
		if (config[key] !== undefined) (next as Record<string, unknown>)[key] = config[key];
	}
	mkdirSync(dirname(path), { recursive: true });
	const tmp = `${path}.tmp-${process.pid}`;
	writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
	renameSync(tmp, path);
	return next;
}
