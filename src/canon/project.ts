// Onde um projeto do canon guarda os nós e a arquitetura (drummond-canon, nó 1.34.10.4). Mesma
// resolução de scripts/canon-tools/config.js: `paths.dataDir` é relativo à raiz do repo; `archDir`
// é a pasta que contém `dataDir` (normalmente `docs/architecture`).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface CanonProject {
	repoName: string;
	repoRoot: string;
	dataDir: string;
	archDir: string;
}

interface CanonConfigFile {
	repoName?: string;
	paths?: { dataDir?: string };
}

/**
 * Lê `docs/architecture/canon.config.json`. `null` quando o projeto não é do canon — quem chama
 * (`createFileSystem`) cai de volta no `FileSystem` comum do Backlog.md.
 */
export function readCanonProject(projectRoot: string): CanonProject | null {
	const configPath = join(projectRoot, "docs/architecture/canon.config.json");
	if (!existsSync(configPath)) return null;

	let raw: CanonConfigFile;
	try {
		raw = JSON.parse(readFileSync(configPath, "utf8"));
	} catch {
		return null;
	}

	const dataDirRelative = raw.paths?.dataDir;
	if (!raw.repoName || !dataDirRelative) return null;

	const dataDir = resolve(projectRoot, dataDirRelative);
	return { repoName: raw.repoName, repoRoot: projectRoot, dataDir, archDir: dirname(dataDir) };
}
