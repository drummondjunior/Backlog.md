// Ponto único de escolha do conector (drummond-canon, nó 1.34.10.4): todo lugar que hoje faz
// `new FileSystem(projectRoot)` passa a chamar `createFileSystem(projectRoot)` — o núcleo, o
// servidor, a tela, o terminal e o MCP ficam intactos (spec §3).
import { FileSystem } from "../file-system/operations.ts";
import { CanonFileSystem } from "./canon-file-system.ts";
import { setCanonIdentity } from "./identity.ts";
import { readCanonProject } from "./project.ts";

export { CanonFileSystem, CanonReadOnlyError } from "./canon-file-system.ts";
export type { CanonProject } from "./project.ts";
export { readCanonProject } from "./project.ts";

/**
 * Escolhe a implementação da camada de persistência pelo `canon.config.json` do projeto. Também
 * liga a identidade Dewey (`setCanonIdentity`) para que id/ordem tratem "1.40"/"11.o" intactos só
 * quando o projeto de fato é do canon.
 */
export function createFileSystem(projectRoot: string): FileSystem {
	const project = readCanonProject(projectRoot);
	setCanonIdentity(project !== null);
	if (!project) return new FileSystem(projectRoot);
	return new CanonFileSystem(projectRoot, project);
}
