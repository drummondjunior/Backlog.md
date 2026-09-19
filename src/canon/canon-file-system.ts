// Onde e como o Backlog.md lê um projeto do canon (drummond-canon, nó 1.34.10.4). Substitui a
// camada de persistência inteira: os nós moram em `docs/architecture/<repo>-canon/*.md`, os
// documentos em `docs/architecture/**` e as decisões nas quatro fontes da spec §5. Escrita de NÓ é o
// nó 1.34.7 — todo método que grava nó/documento/decisão recusa. Exceção: `saveConfig` (nó 1.34.12) —
// não é arquivo de nó, é config geral do computador (`canon-settings.ts`), sem concorrência com a
// sessão do Claude Code.
//
// Transpilado de scripts/canon-tools/backlog-adapter.js do drummond-canon: `lerNos`/`datasDeCriacao`
// (linhas 69-113, listagem + data de criação pelo git), `ehTrabalho`/`ehPastaDeFora` (linhas 117,
// 196-199), `config`/`status` (linhas 163-180), `docs`/`doc`/`listarMd`/`h1` (linhas 213-237),
// `decisions`/`decision`/`EH_DECISAO` (linhas 239-289) e `drafts` (linhas 292-295).

import { execFileSync } from "node:child_process";
import type { Dirent } from "node:fs";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { FileSystem } from "../file-system/operations.ts";
import type { BacklogConfig, Decision, Document, Milestone, Task, TaskListFilter } from "../types/index.ts";
import type { BacklogMap } from "./backlog-map.ts";
import { loadBacklogMap } from "./backlog-map.ts";
import { readCanonSettings, writeCanonSettings } from "./canon-settings.ts";
import { compareCanonIds } from "./identity.ts";
import {
	bulletSection,
	formatCanonDate,
	frontmatterText,
	getColumns,
	getInvalidStatus,
	getStatusNames,
	parseCanonNode,
	rawField,
	safeParseMarkdown,
} from "./node-codec.ts";
import type { CanonProject } from "./project.ts";

export class CanonReadOnlyError extends Error {
	constructor(message = "Somente leitura por ora: escrever pelo canon é o nó 1.34.7.") {
		super(message);
		this.name = "CanonReadOnlyError";
	}
}

/** Um candidato a documento: caminho absoluto, o caminho usado para id/nome/path (§ regra abaixo) e o
 * caminho sempre relativo à raiz do repo, usado só em mensagem/contexto. */
interface DocumentCandidate {
	absPath: string;
	idPath: string;
	repoRelPath: string;
}

interface RawNode {
	id: string;
	filePath: string;
	content: string;
	statusCode: string;
	tipo?: string;
	parentId?: string;
	mtime: Date;
}

// Data em que cada nó ENTROU no git: uma consulta por projeto, guardada enquanto o HEAD não muda
// (backlog-adapter.js:70-90, `criacaoCache`/`datasDeCriacao`).
const creationDateCache = new Map<string, Record<string, string>>();

function creationDatesByFile(dataDir: string): Record<string, string> {
	let head: string;
	try {
		head = execFileSync("git", ["-C", dataDir, "rev-parse", "HEAD"], { encoding: "utf8", stdio: "pipe" }).trim();
	} catch {
		return {};
	}
	const cacheKey = `${dataDir}@${head}`;
	const cached = creationDateCache.get(cacheKey);
	if (cached) return cached;

	const dates: Record<string, string> = {};
	try {
		const output = execFileSync(
			"git",
			["-C", dataDir, "log", "--diff-filter=A", "--name-only", "--format=@@%aI", "--", "."],
			{ encoding: "utf8", stdio: "pipe", maxBuffer: 64 * 1024 * 1024 },
		);
		let when = "";
		for (const line of output.split("\n")) {
			if (line.startsWith("@@")) {
				when = line.slice(2);
				continue;
			}
			if (!line.endsWith(".md")) continue;
			dates[basename(line, ".md")] = when; // log vem do mais novo pro mais velho: fica a 1ª adição
		}
	} catch {
		// sem git: cada nó fica só com o que o próprio arquivo disser
	}
	creationDateCache.set(cacheKey, dates);
	return dates;
}

export class CanonFileSystem extends FileSystem {
	private readonly project: CanonProject;

	// Mapa central com a sobreposição do repo já aplicada (§4.3) — lido uma vez por instância.
	private readonly map: BacklogMap;
	// Ancestral materializado pelo conversor (backlog-adapter.js:115-117, `ehTrabalho`): não tem texto
	// nem trabalho, existe só para a árvore ligar — nunca vira Task. Grupo "structural" no mapa.
	private readonly structuralStatus: string;
	// Arquivamento (spec §4.1): grupo "completed" vira concluído, "archived" vira arquivado. "board"
	// (inclusive DEFERRED) continua no quadro normal.
	private readonly doneStatus: string;
	private readonly archivedStatuses: Set<string>;
	private readonly draftStatus?: string;
	// Decisão formal no nome do arquivo (backlog-adapter.js:240): ADR-NNN, ASR-NNNN, "…decisão…" — do mapa.
	private readonly isDecisionFile: RegExp;

	constructor(projectRoot: string, project: CanonProject) {
		super(projectRoot);
		this.project = project;
		this.map = loadBacklogMap(project.repoRoot);

		let structuralStatus = "estrutural";
		let doneStatus = "DONE";
		let draftStatus: string | undefined;
		const archivedStatuses = new Set<string>();
		for (const [code, info] of Object.entries(this.map.statuses)) {
			if (code === "_invalid") continue;
			if (info.group === "structural") structuralStatus = code;
			else if (info.group === "completed") doneStatus = code;
			else if (info.group === "archived") archivedStatuses.add(code);
			if (info.draft) draftStatus = code;
		}
		this.structuralStatus = structuralStatus;
		this.doneStatus = doneStatus;
		this.archivedStatuses = archivedStatuses;
		this.draftStatus = draftStatus;
		this.isDecisionFile = new RegExp((this.map.folders.decisionFileNames ?? []).join("|") || "(?!)", "i");
	}

	// Pastas observadas pelo tempo real são as do canon (despacho 1.34.10.4).
	override get backlogDir(): string {
		return this.project.dataDir;
	}
	override get backlogDirName(): string {
		return basename(this.project.dataDir);
	}
	override get tasksDir(): string {
		return this.project.dataDir;
	}
	override get completedDir(): string {
		return this.project.dataDir;
	}
	override get docsDir(): string {
		return this.project.archDir;
	}
	override get decisionsDir(): string {
		return this.project.archDir;
	}

	// --- leitura dos nós ---------------------------------------------------------------------

	private async readRawNodes(): Promise<RawNode[]> {
		let names: string[];
		try {
			names = (await readdir(this.project.dataDir)).filter((name) => name.endsWith(".md") && !name.startsWith("_"));
		} catch {
			return [];
		}
		const nodes: RawNode[] = [];
		for (const name of names) {
			const filePath = join(this.project.dataDir, name);
			let content: string;
			try {
				content = await readFile(filePath, "utf8");
			} catch {
				continue;
			}
			const fm = frontmatterText(content);
			const info = await stat(filePath);
			nodes.push({
				id: name.slice(0, -3),
				filePath,
				content,
				statusCode: rawField(fm, "status"),
				tipo: rawField(fm, "kind") || undefined, // nó 1.44.6: rawField já lê "tipo" legado por baixo
				parentId: rawField(fm, "parent") || undefined,
				mtime: info.mtime,
			});
		}
		return nodes;
	}

	/** Task por nó (backlog-adapter.js:130-161, `paraTask`), com subtasks/createdDate resolvidos entre irmãos. */
	private buildTasks(raw: RawNode[]): Map<string, Task> {
		const created = creationDatesByFile(this.project.dataDir);
		const byParent = new Map<string, RawNode[]>();
		for (const node of raw) {
			if (!node.parentId) continue;
			const siblings = byParent.get(node.parentId) ?? [];
			siblings.push(node);
			byParent.set(node.parentId, siblings);
		}

		const tasks = new Map<string, Task>();
		for (const node of raw) tasks.set(node.id, parseCanonNode(node.content, node.id));

		for (const node of raw) {
			const base = tasks.get(node.id);
			if (!base) continue;
			const children = (byParent.get(node.id) ?? []).slice().sort((a, b) => compareCanonIds(a.id, b.id));
			tasks.set(node.id, {
				...base,
				// `gerado_em` (via parseCanonNode) tem prioridade; sem ele, a data é a do commit que
				// criou o arquivo — nunca a última edição (backlog-adapter.test.js: "gerado_em do nó
				// tem prioridade").
				createdDate: base.createdDate || formatCanonDate(created[node.id]),
				filePath: node.filePath,
				lastModified: node.mtime,
				subtasks: children.map((child) => child.id),
				subtaskSummaries: children.map((child) => ({ id: child.id, title: tasks.get(child.id)?.title ?? child.id })),
				source: "local",
			});
		}
		return tasks;
	}

	private applyTaskFilter(tasks: Task[], filter?: TaskListFilter): Task[] {
		if (!filter) return tasks;
		let list = tasks;
		if (filter.status) {
			const wanted = new Set(Array.isArray(filter.status) ? filter.status : [filter.status]);
			list = list.filter((task) => wanted.has(task.status));
		}
		if (filter.excludeStatus) {
			const excluded = new Set(Array.isArray(filter.excludeStatus) ? filter.excludeStatus : [filter.excludeStatus]);
			list = list.filter((task) => !excluded.has(task.status));
		}
		if (filter.parentTaskId) {
			list = list.filter((task) => task.parentTaskId === filter.parentTaskId);
		}
		return list;
	}

	/**
	 * Nó estrutural (nó `1.34.10.5.3`): por `status: estrutural` (já existia) OU `tipo: estrutural`
	 * — o mesmo literal do mapa central, nos dois campos. Sai do quadro e da lista; continua na
	 * árvore de Nós como pai que agrupa (o codec não filtra `readRawNodes`/`buildTasks`).
	 */
	private isStructural(node: RawNode): boolean {
		return node.statusCode === this.structuralStatus || node.tipo === this.structuralStatus;
	}

	private tasksWhere(raw: RawNode[], tasks: Map<string, Task>, keep: (node: RawNode) => boolean): Task[] {
		return raw
			.filter(keep)
			.map((node) => tasks.get(node.id))
			.filter((task): task is Task => task !== undefined)
			.sort((a, b) => compareCanonIds(a.id, b.id));
	}

	override async listTasks(filter?: TaskListFilter): Promise<Task[]> {
		const raw = await this.readRawNodes();
		const tasks = this.buildTasks(raw);
		const list = this.tasksWhere(
			raw,
			tasks,
			(node) =>
				!this.isStructural(node) && node.statusCode !== this.doneStatus && !this.archivedStatuses.has(node.statusCode),
		);
		return this.applyTaskFilter(list, filter).sort((a, b) => compareCanonIds(a.id, b.id));
	}

	override async loadTask(taskId: string): Promise<Task | null> {
		const raw = await this.readRawNodes();
		if (!raw.some((node) => node.id === taskId)) return null;
		return this.buildTasks(raw).get(taskId) ?? null;
	}

	override async listDrafts(): Promise<Task[]> {
		const raw = await this.readRawNodes();
		return this.tasksWhere(raw, this.buildTasks(raw), (node) => node.statusCode === this.draftStatus);
	}

	/** Concluído (spec §4.1): grupo "completed" (DONE). Nada muda de pasta — responde pelo estado. */
	override async listCompletedTasks(): Promise<Task[]> {
		const raw = await this.readRawNodes();
		return this.tasksWhere(raw, this.buildTasks(raw), (node) => node.statusCode === this.doneStatus);
	}

	/** Arquivado (spec §4.1): grupo "archived" (REJECTED, SUPERSEDED). */
	override async listArchivedTasks(): Promise<Task[]> {
		const raw = await this.readRawNodes();
		return this.tasksWhere(raw, this.buildTasks(raw), (node) => this.archivedStatuses.has(node.statusCode));
	}

	/**
	 * Um Milestone por marco derivado (node-codec.ts `deriveMilestoneId`) com pelo menos um nó —
	 * estrutural fora, DONE/board dentro (fica visível até alguém arquivar o próprio ancestral;
	 * spec do despacho 1.43). Título = o do nó ancestral quando existe; senão o próprio id.
	 */
	override async listMilestones(): Promise<Milestone[]> {
		const raw = await this.readRawNodes();
		const tasks = this.buildTasks(raw);
		// Marco cujo próprio ancestral está arquivado sai daqui — mora só em listArchivedMilestones(),
		// mutuamente exclusivo como as pastas ativa/arquivada da base (evita duplicar na tela).
		const archivedIds = new Set(raw.filter((n) => this.archivedStatuses.has(n.statusCode)).map((n) => n.id));
		const ids = new Set<string>();
		for (const node of raw) {
			if (this.isStructural(node)) continue;
			const milestoneId = tasks.get(node.id)?.milestone;
			if (milestoneId && !archivedIds.has(milestoneId)) ids.add(milestoneId);
		}
		return [...ids].sort(compareCanonIds).map((id) => ({
			id,
			title: tasks.get(id)?.title ?? id,
			description: "",
			rawContent: "",
		}));
	}

	/**
	 * Marco arquivado = o próprio nó ancestral está no grupo "archived" (REJECTED/SUPERSEDED) do mapa
	 * central. DONE fica fora de propósito: a tela usa este método para ZERAR `task.milestone` em
	 * todo lugar (App.tsx `applySearchResults`), e um marco concluído ainda precisa aparecer com
	 * progresso 100% na página de Milestones — tratá-lo como arquivado apagaria isso (desvio do texto
	 * literal do despacho "DONE/archived", registrado no relatório).
	 */
	override async listArchivedMilestones(): Promise<Milestone[]> {
		const raw = await this.readRawNodes();
		const tasks = this.buildTasks(raw);
		return raw
			.filter((node) => this.archivedStatuses.has(node.statusCode))
			.map((node) => tasks.get(node.id))
			.filter((task): task is Task => task !== undefined)
			.sort((a, b) => compareCanonIds(a.id, b.id))
			.map((task) => ({ id: task.id, title: task.title, description: "", rawContent: "" }));
	}

	// --- config / status -----------------------------------------------------------------------

	override async loadConfig(): Promise<BacklogConfig | null> {
		const raw = await this.readRawNodes();
		const hasInvalidStatus = raw.some(
			(node) => node.statusCode !== this.structuralStatus && !(node.statusCode in getStatusNames()),
		);
		// Geral do computador (nó 1.34.12, spec §2): os campos que a tela Settings deixa editar vêm de
		// `~/.claude/canon-settings.json`, por cima do que é sempre derivado do projeto (nome, colunas).
		return {
			projectName: this.project.repoName,
			statuses: hasInvalidStatus ? [...getColumns(), getInvalidStatus()] : getColumns(),
			labels: [],
			definitionOfDone: [],
			defaultStatus: "A fazer",
			dateFormat: "yyyy-mm-dd hh:mm",
			maxColumnWidth: 20,
			defaultEditor: "",
			autoOpenBrowser: false,
			defaultPort: 7337,
			remoteOperations: false,
			autoCommit: false,
			filesystemOnly: true,
			bypassGitHooks: false,
			checkActiveBranches: false,
			activeBranchDays: 0,
			prefixes: { task: "" },
			...readCanonSettings(),
		};
	}

	/**
	 * Geral do computador (nó 1.34.12): grava só os campos que `writeCanonSettings` reconhece —
	 * `projectName`/`prefixes` continuam computados, nunca vêm daqui. Não é escrita de nó (nó 1.34.7
	 * segue fora desta leva) — é config do computador, sem concorrência com a sessão do Claude Code.
	 */
	override async saveConfig(config: BacklogConfig): Promise<void> {
		writeCanonSettings(config);
	}

	// --- documentos ------------------------------------------------------------------------------

	/**
	 * O prefixo literal (sem `*`/`?`) de um padrão do mapa, para achar a pasta real a percorrer — de
	 * `"docs/superpowers/specs/**"` sai `"docs/superpowers/specs"`.
	 */
	private static literalPrefix(pattern: string): string {
		const literal: string[] = [];
		for (const segment of pattern.split("/")) {
			if (segment.includes("*") || segment.includes("?")) break;
			literal.push(segment);
		}
		return literal.join("/");
	}

	/** Raízes únicas a percorrer (relativas à raiz do repo), sem uma pasta dentro da outra. */
	private static scanRoots(patterns: string[]): string[] {
		const prefixes = [...new Set(patterns.map(CanonFileSystem.literalPrefix).filter(Boolean))];
		return prefixes.filter((prefix) => !prefixes.some((other) => other !== prefix && prefix.startsWith(`${other}/`)));
	}

	/** Percorre `.md` sem entrar nas pastas que `skipDir` recusa (pasta dos nós, excluídas do mapa). */
	private async walkMarkdownFiles(
		absDir: string,
		skipDir: (absDir: string) => boolean,
		out: string[] = [],
	): Promise<string[]> {
		let entries: Dirent[];
		try {
			entries = await readdir(absDir, { withFileTypes: true });
		} catch {
			return out;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const abs = join(absDir, entry.name);
			if (entry.isDirectory()) {
				if (!skipDir(abs)) await this.walkMarkdownFiles(abs, skipDir, out);
			} else if (entry.name.endsWith(".md")) out.push(abs);
		}
		return out;
	}

	/**
	 * Documento = todo `.md` dentro das pastas do mapa central (`folders.documents`, §4.3: hoje
	 * `docs/architecture/**`, `docs/superpowers/specs/**`, `docs/superpowers/plans/**`,
	 * `docs/plans/**`), fora do que o mapa exclui (`folders.excluded`) e sempre fora do `dataDir` dos
	 * nós (excluído mesmo que a sobreposição do repo troque `folders.excluded` inteiro).
	 *
	 * Regra do id/path (§ relatório 1.34.10.7): arquivo dentro de `docs/architecture` mantém o formato
	 * de hoje — relativo a `docs/architecture`, `/` vira `--` no id (`doc-06-comercial`). Arquivo fora
	 * de `docs/architecture` (as pastas novas) usa o caminho relativo à RAIZ DO REPO (`doc-docs--plans--x`).
	 */
	private async documentCandidates(): Promise<DocumentCandidate[]> {
		const documentGlobs = this.map.folders.documents.map((pattern) => new Bun.Glob(pattern));
		const excludedGlobs = this.map.folders.excluded.map((pattern) => new Bun.Glob(pattern));
		const dataDirRel = relative(this.project.repoRoot, this.project.dataDir);

		// Poda na descida: a pasta dos nós (milhares de notas) e as excluídas nem são lidas.
		const skipDir = (absDir: string): boolean => {
			const rel = relative(this.project.repoRoot, absDir).split("\\").join("/");
			return rel === dataDirRel || excludedGlobs.some((glob) => glob.match(`${rel}/x.md`));
		};

		const absFiles = new Set<string>();
		for (const root of CanonFileSystem.scanRoots(this.map.folders.documents)) {
			const absRoot = join(this.project.repoRoot, root);
			if (!existsSync(absRoot)) continue;
			for (const absPath of await this.walkMarkdownFiles(absRoot, skipDir)) absFiles.add(absPath);
		}

		const candidates: DocumentCandidate[] = [];
		for (const absPath of absFiles) {
			const repoRelPath = relative(this.project.repoRoot, absPath).split("\\").join("/");
			if (repoRelPath === dataDirRel || repoRelPath.startsWith(`${dataDirRel}/`)) continue;
			if (!documentGlobs.some((glob) => glob.match(repoRelPath))) continue;
			if (excludedGlobs.some((glob) => glob.match(repoRelPath))) continue;

			const archRelPath = relative(this.project.archDir, absPath).split("\\").join("/");
			const isUnderArch = !archRelPath.startsWith("..") && !isAbsolute(archRelPath);
			candidates.push({ absPath, idPath: isUnderArch ? archRelPath : repoRelPath, repoRelPath });
		}
		return candidates.sort((a, b) => (a.idPath < b.idPath ? -1 : a.idPath > b.idPath ? 1 : 0));
	}

	private toDocument(relativePath: string, content: string, modified: string): Document {
		const heading = /^#\s+(.+)$/m.exec(content)?.[1]?.trim();
		return {
			id: `doc-${relativePath.replace(/\.md$/, "").replace(/\//g, "--")}`,
			title: heading ?? basename(relativePath, ".md"),
			type: "other",
			createdDate: modified,
			updatedDate: modified,
			rawContent: safeParseMarkdown(content).content,
			name: basename(relativePath),
			path: relativePath,
			lastModified: modified,
			tags: relativePath.includes("/") ? [relativePath.split("/")[0] as string] : [],
		};
	}

	/** Documento = todo `.md` no escopo do mapa central, arquitetura inclusive (backlog-adapter.js:218-228, `docs`). */
	override async listDocuments(): Promise<Document[]> {
		const candidates = await this.documentCandidates();
		const docs: Document[] = [];
		for (const { absPath, idPath } of candidates) {
			let content: string;
			try {
				content = await readFile(absPath, "utf8");
			} catch {
				continue;
			}
			const info = await stat(absPath);
			docs.push(this.toDocument(idPath, content, formatCanonDate(info.mtime)));
		}
		return docs;
	}

	override async loadDocument(id: string): Promise<Document> {
		const withPrefix = id.startsWith("doc-") ? id : `doc-${id}`;
		const doc = (await this.listDocuments()).find((d) => d.id === withPrefix || d.path === id || d.name === id);
		if (!doc) throw new Error(`Document not found: ${id}`);
		return doc;
	}

	// --- decisões: as quatro fontes da spec §5 ---------------------------------------------------

	private async acceptDecisionFile(
		decisions: Decision[],
		seen: Set<string>,
		filePath: string,
		id: string,
		source: string,
	): Promise<void> {
		if (seen.has(filePath) || !existsSync(filePath)) return;
		seen.add(filePath);
		let content: string;
		try {
			content = await readFile(filePath, "utf8");
		} catch {
			return;
		}
		const info = await stat(filePath);
		decisions.push({
			id: `decision-${id.replace(/\//g, "--")}`,
			title: /^#\s+(.+)$/m.exec(content)?.[1]?.trim() ?? basename(filePath, ".md"),
			status: "accepted",
			date: formatCanonDate(info.mtime).slice(0, 10),
			context: source,
			decision: content.replace(/^#\s+.+\n+/, ""),
			consequences: "",
			rawContent: content,
		});
	}

	/**
	 * Bullet do `## Journal` em que o Drummond decidiu, verbatim (spec §5, fonte 3) — regra
	 * CONSERVADORA, testada contra amostras reais (docs/architecture/skill-canon deste repo,
	 * nó `1.34.12`): melhor deixar de fora do que chamar de decisão o que é investigação/correção
	 * SOBRE uma decisão. Duas formas aceitas: (a) o marcador abre a linha (até 3 palavras antes —
	 * "DECIDIDO tempo (...)", "Operador decidiu (...)", "Requisitos decididos pelo Drummond (...)");
	 * (b) fala entre aspas ("verbatim: '...'") na mesma linha de um "decidiu/decidido(s)" — cobre o
	 * padrão "Drummond DATA, verbatim: '...'. DECIDIDO: ...". Marcador NO MEIO da frase sem aspas
	 * ("...descartado pelo rumo novo: o Drummond decidiu tirar...") fica de fora de propósito.
	 */
	private static readonly DECISION_LEAD = /^(?:\S+\s+){0,3}(?:DECIDIDO|decidiu|decidido|decididos)\b/;
	private static readonly DECISION_VERBATIM = /verbatim:\s*['"]/;
	private static readonly DECISION_WORD = /\bdecidid[oa]s?\b/i;

	private isDecidedJournalLine(line: string): boolean {
		return (
			CanonFileSystem.DECISION_LEAD.test(line) ||
			(CanonFileSystem.DECISION_VERBATIM.test(line) && CanonFileSystem.DECISION_WORD.test(line))
		);
	}

	/**
	 * `## Decisão`/`## Decision` dentro de QUALQUER documento de arquitetura (spec §5, fonte 2) —
	 * uma seção por decisão, até o próximo `#`/`##`. Não duplica a fonte 1 (arquivo inteiro
	 * decisão-nomeado): quem chama pula o `absPath` já aceito por `acceptDecisionFile`.
	 */
	private extractDecisionSections(content: string): { heading: string; body: string }[] {
		const headingRe = /^##\s+(Decis(?:ão|ao|ion)\b.*)$/gim;
		const sections: { heading: string; body: string }[] = [];
		let match: RegExpExecArray | null = headingRe.exec(content);
		while (match !== null) {
			const rest = content.slice(match.index + match[0].length);
			const next = /^#{1,2}\s+/m.exec(rest);
			const body = (next ? rest.slice(0, next.index) : rest).trim();
			if (body) sections.push({ heading: (match[1] ?? "Decisão").trim(), body });
			match = headingRe.exec(content);
		}
		return sections;
	}

	/**
	 * As quatro fontes da spec §5: decisão formal (ADR-/ASR-/"decisão" no nome + desenho aprovado
	 * referenciado por nó), seção `## Decisão…` em documento de arquitetura, registro de nó em que o
	 * Drummond decidiu (verbatim) e pergunta pendente (`## Perguntas`) — backlog-adapter.js:239-283.
	 */
	override async listDecisions(): Promise<Decision[]> {
		const raw = await this.readRawNodes();
		const decisions: Decision[] = [];

		for (const node of raw) {
			const body = parseCanonNode(node.content, node.id).description ?? "";
			const context = `Nó ${node.id}: ${body}`;
			bulletSection(node.content, "Perguntas").forEach((line, index) => {
				if (!line.startsWith("- [ ]")) return;
				const dateMatch = /\[(\d{4}-\d{2}-\d{2})/.exec(line);
				const text = line.replace(/^- \[ \]\s*(\[[^\]]*\]\s*)?/, "").trim();
				decisions.push({
					id: `decision-pergunta-${node.id}-${index + 1}`,
					title: text.slice(0, 140),
					status: "proposed",
					date: dateMatch?.[1] ?? "",
					context,
					decision: "",
					consequences: "",
					rawContent: `## Pergunta\n\n${text}\n\n## Contexto\n\n${context}\n`,
				});
			});
			bulletSection(node.content, "Journal").forEach((line, index) => {
				const text = line.replace(/^-\s*(\[[^\]]*\]\s*)?/, "").trim();
				if (!this.isDecidedJournalLine(text)) return;
				const dateMatch = /\[(\d{4}-\d{2}-\d{2})/.exec(line);
				decisions.push({
					id: `decision-no-${node.id}-${index + 1}`,
					title: text.slice(0, 140),
					status: "accepted",
					date: dateMatch?.[1] ?? "",
					context,
					decision: text,
					consequences: "",
					rawContent: `## Decisão\n\n${text}\n\n## Contexto\n\n${context}\n`,
				});
			});
		}

		const seen = new Set<string>();
		const allCandidates = await this.documentCandidates();
		const decisionFiles = allCandidates.filter((candidate) => this.isDecisionFile.test(basename(candidate.idPath)));
		for (const { absPath, idPath, repoRelPath } of decisionFiles) {
			await this.acceptDecisionFile(
				decisions,
				seen,
				absPath,
				idPath.replace(/\.md$/, ""),
				`Decisão formal: ${repoRelPath}`,
			);
		}

		for (const node of raw) {
			// nó 1.44.6: "design" é a chave atual — rawField já lê "desenho" legado por baixo.
			const design = rawField(frontmatterText(node.content), "design");
			if (!design) continue;
			const who = raw
				.filter((other) => rawField(frontmatterText(other.content), "design") === design)
				.map((other) => other.id);
			await this.acceptDecisionFile(
				decisions,
				seen,
				resolve(this.project.repoRoot, design),
				`desenho-${basename(design, ".md")}`,
				`Desenho aprovado dos nós ${who.join(", ")} (${design})`,
			);
		}

		// fonte 2: seção "## Decisão" em qualquer doc, exceto o que já virou decisão inteira (fonte 1).
		for (const { absPath, idPath, repoRelPath } of allCandidates) {
			if (seen.has(absPath)) continue;
			let content: string;
			try {
				content = await readFile(absPath, "utf8");
			} catch {
				continue;
			}
			const sections = this.extractDecisionSections(content);
			if (!sections.length) continue;
			const docTitle = /^#\s+(.+)$/m.exec(content)?.[1]?.trim() ?? basename(absPath, ".md");
			const info = await stat(absPath);
			const date = formatCanonDate(info.mtime).slice(0, 10);
			sections.forEach((section, index) => {
				decisions.push({
					id: `decision-secao-${idPath.replace(/\.md$/, "").replace(/\//g, "--")}-${index + 1}`,
					title: /^decis/i.test(section.heading) ? docTitle : section.heading,
					status: "accepted",
					date,
					context: `Seção "${section.heading}" em ${repoRelPath}`,
					decision: section.body,
					consequences: "",
					rawContent: `## ${section.heading}\n\n${section.body}\n`,
				});
			});
		}

		return decisions;
	}

	/** A tela deles busca com o prefixo "decision-"; link antigo pode vir sem (backlog-adapter.js:286-289). */
	override async loadDecision(id: string): Promise<Decision | null> {
		const withPrefix = id.startsWith("decision-") ? id : `decision-${id}`;
		return (await this.listDecisions()).find((d) => d.id === withPrefix) ?? null;
	}

	// --- escrita: nó 1.34.7 --------------------------------------------------------------------

	override async saveTask(..._args: Parameters<FileSystem["saveTask"]>): ReturnType<FileSystem["saveTask"]> {
		throw new CanonReadOnlyError();
	}
	override async saveDraft(..._args: Parameters<FileSystem["saveDraft"]>): ReturnType<FileSystem["saveDraft"]> {
		throw new CanonReadOnlyError();
	}
	override async saveDecision(
		..._args: Parameters<FileSystem["saveDecision"]>
	): ReturnType<FileSystem["saveDecision"]> {
		throw new CanonReadOnlyError();
	}
	override async saveDocument(
		..._args: Parameters<FileSystem["saveDocument"]>
	): ReturnType<FileSystem["saveDocument"]> {
		throw new CanonReadOnlyError();
	}
	override async archiveTask(..._args: Parameters<FileSystem["archiveTask"]>): ReturnType<FileSystem["archiveTask"]> {
		throw new CanonReadOnlyError();
	}
	override async completeTask(
		..._args: Parameters<FileSystem["completeTask"]>
	): ReturnType<FileSystem["completeTask"]> {
		throw new CanonReadOnlyError();
	}
	override async archiveDraft(
		..._args: Parameters<FileSystem["archiveDraft"]>
	): ReturnType<FileSystem["archiveDraft"]> {
		throw new CanonReadOnlyError();
	}
	override async promoteDraft(
		..._args: Parameters<FileSystem["promoteDraft"]>
	): ReturnType<FileSystem["promoteDraft"]> {
		throw new CanonReadOnlyError();
	}
	override async demoteTask(..._args: Parameters<FileSystem["demoteTask"]>): ReturnType<FileSystem["demoteTask"]> {
		throw new CanonReadOnlyError();
	}
	override async createMilestone(
		..._args: Parameters<FileSystem["createMilestone"]>
	): ReturnType<FileSystem["createMilestone"]> {
		throw new CanonReadOnlyError();
	}
	override async renameMilestone(
		..._args: Parameters<FileSystem["renameMilestone"]>
	): ReturnType<FileSystem["renameMilestone"]> {
		throw new CanonReadOnlyError();
	}
	override async archiveMilestone(
		..._args: Parameters<FileSystem["archiveMilestone"]>
	): ReturnType<FileSystem["archiveMilestone"]> {
		throw new CanonReadOnlyError();
	}

	/**
	 * NÃO recusa (desvio da lista literal do despacho, ver relatório): `content-store.ts` chama
	 * `ensureBacklogStructure()` no caminho de LEITURA, antes de cada publicação do board — recusar
	 * aqui derrubaria a tela inteira, não só a escrita. É idempotente e os diretórios do canon já
	 * existem (o próprio nó vive lá), então não há nada para criar.
	 */
	override async ensureBacklogStructure(): Promise<void> {}
}
