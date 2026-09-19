// Núcleo somente leitura num projeto do canon (drummond-canon, nó 1.34.10.5.2). O núcleo do Backlog.md grava no
// disco direto em vários métodos (arquivar move o arquivo do nó, apagar usa unlink, o editor reescreve com
// Bun.write) — o CanonFileSystem sozinho não segura. Aqui, cada método que grava passa a recusar com
// CanonReadOnlyError; a lista é conferida contra o protótipo do núcleo por teste, para método novo do upstream
// não passar em silêncio. Escrever pelo canon é o nó 1.34.7.
import { CanonFileSystem, CanonReadOnlyError } from "./canon-file-system.ts";

export const MUTATING_CORE_METHODS = [
	"createTaskFromInput",
	"createTask",
	"updateTask",
	"updateTaskFromInput",
	"updateDraft",
	"updateDraftFromInput",
	"editTaskOrDraft",
	"editTask",
	"updateTasksBulk",
	"reorderTask",
	"moveTasksToStatus",
	"archiveTask",
	"archiveMilestone",
	"renameMilestone",
	"completeTask",
	"archiveDraft",
	"promoteDraft",
	"demoteTask",
	"addAcceptanceCriteria",
	"removeAcceptanceCriteria",
	"createDecision",
	"updateDecisionFromContent",
	"createDecisionWithTitle",
	"createDocument",
	"updateDocument",
	"createDocumentWithId",
	"createDocumentFromInput",
	"updateDocumentFromInput",
	"editTaskInTui",
	"promoteDraftWithUpdates",
	"demoteTaskWithUpdates",
] as const;

/**
 * Se o núcleo está num projeto do canon, troca cada método que grava por um que recusa. Fora do canon (inclusive
 * quando o mesmo núcleo passa a outro projeto), tira a troca e volta o comportamento deles.
 */
export function guardCanonCore(core: object, fileSystem: unknown): void {
	if (!(fileSystem instanceof CanonFileSystem)) {
		for (const name of MUTATING_CORE_METHODS) delete (core as Record<string, unknown>)[name];
		return;
	}
	for (const name of MUTATING_CORE_METHODS) {
		Object.defineProperty(core, name, {
			configurable: true,
			value: async () => {
				throw new CanonReadOnlyError();
			},
		});
	}
}
