// Onde e como o Backlog.md lê um projeto do canon (drummond-canon, nó 1.34.10.4). Substitui a
// camada de persistência inteira: os nós moram em `docs/architecture/<repo>-canon/*.md`, os
// documentos em `docs/architecture/**` e as decisões nas quatro fontes da spec §5. Escrita é o nó
// 1.34.7 — aqui todo método que grava recusa.
//
// Transpilado de scripts/canon-tools/backlog-adapter.js do drummond-canon: `lerNos`/`datasDeCriacao`
// (linhas 69-113, listagem + data de criação pelo git), `ehTrabalho`/`ehPastaDeFora` (linhas 117,
// 196-199), `config`/`status` (linhas 163-180), `docs`/`doc`/`listarMd`/`h1` (linhas 213-237),
// `decisions`/`decision`/`EH_DECISAO` (linhas 239-289) e `drafts` (linhas 292-295).

import { execFileSync } from "node:child_process";
import type { Dirent } from "node:fs";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { FileSystem } from "../file-system/operations.ts";
import { parseMarkdown } from "../markdown/parser.ts";
import type { BacklogConfig, Decision, Document, Milestone, Task, TaskListFilter } from "../types/index.ts";
import { compareCanonIds } from "./identity.ts";
import {
	bulletSection,
	COLUMNS,
	formatCanonDate,
	frontmatterText,
	INVALID_STATUS,
	parseCanonNode,
	rawField,
	STATUS_NAMES,
} from "./node-codec.ts";
import type { CanonProject } from "./project.ts";

export class CanonReadOnlyError extends Error {
	constructor(message = "Somente leitura por ora: escrever pelo canon é o nó 1.34.7.") {
		super(message);
		this.name = "CanonReadOnlyError";
	}
}

// Ancestral materializado pelo conversor (backlog-adapter.js:115-117, `ehTrabalho`): não tem texto
// nem trabalho, existe só para a árvore ligar — nunca vira Task.
const STRUCTURAL_STATUS = "estrutural";
// Arquivamento (spec §4.1): DONE vira concluído, REJECTED/SUPERSEDED viram arquivado. DEFERRED
// continua no quadro normal.
const DONE_STATUS = "DONE";
const ARCHIVED_STATUSES = new Set(["REJECTED", "SUPERSEDED"]);
const DRAFT_STATUS = "CAPTURED";
// Decisão formal no nome do arquivo (backlog-adapter.js:240): ADR-NNN, ASR-NNNN, "…decisão…".
const IS_DECISION_FILE = /^(ADR|ASR)-\d+|decis/i;

interface RawNode {
	id: string;
	filePath: string;
	content: string;
	statusCode: string;
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

	constructor(projectRoot: string, project: CanonProject) {
		super(projectRoot);
		this.project = project;
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
				node.statusCode !== STRUCTURAL_STATUS &&
				node.statusCode !== DONE_STATUS &&
				!ARCHIVED_STATUSES.has(node.statusCode),
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
		return this.tasksWhere(raw, this.buildTasks(raw), (node) => node.statusCode === DRAFT_STATUS);
	}

	/** Concluído (spec §4.1): DONE. Nada muda de pasta — responde pelo estado. */
	override async listCompletedTasks(): Promise<Task[]> {
		const raw = await this.readRawNodes();
		return this.tasksWhere(raw, this.buildTasks(raw), (node) => node.statusCode === DONE_STATUS);
	}

	/** Arquivado (spec §4.1): REJECTED e SUPERSEDED. */
	override async listArchivedTasks(): Promise<Task[]> {
		const raw = await this.readRawNodes();
		return this.tasksWhere(raw, this.buildTasks(raw), (node) => ARCHIVED_STATUSES.has(node.statusCode));
	}

	override async listMilestones(): Promise<Milestone[]> {
		return [];
	}

	// --- config / status -----------------------------------------------------------------------

	override async loadConfig(): Promise<BacklogConfig | null> {
		const raw = await this.readRawNodes();
		const hasInvalidStatus = raw.some(
			(node) => node.statusCode !== STRUCTURAL_STATUS && !(node.statusCode in STATUS_NAMES),
		);
		return {
			projectName: this.project.repoName,
			statuses: hasInvalidStatus ? [...COLUMNS, INVALID_STATUS] : COLUMNS,
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
		};
	}

	// --- documentos ------------------------------------------------------------------------------

	/** Pastas da arquitetura que NÃO são documento: os próprios nós, backup do monolito, backlog pré-canon (backlog-adapter.js:196-199). */
	private isOutsideDocsScope(relativePath: string): boolean {
		const nodesRelative = relative(this.project.archDir, this.project.dataDir);
		if (relativePath === nodesRelative || relativePath.startsWith(`${nodesRelative}/`)) return true;
		return relativePath.split("/").some((segment) => segment === "_backup" || segment.endsWith("-backlog"));
	}

	private async listMarkdownFiles(relativeDir = ""): Promise<string[]> {
		let entries: Dirent[];
		try {
			entries = await readdir(join(this.project.archDir, relativeDir), { withFileTypes: true });
		} catch {
			return [];
		}
		const files: string[] = [];
		for (const entry of entries) {
			const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				if (!entry.name.startsWith(".") && !this.isOutsideDocsScope(relativePath)) {
					files.push(...(await this.listMarkdownFiles(relativePath)));
				}
			} else if (entry.name.endsWith(".md")) {
				files.push(relativePath);
			}
		}
		return files;
	}

	private toDocument(relativePath: string, content: string, modified: string): Document {
		const heading = /^#\s+(.+)$/m.exec(content)?.[1]?.trim();
		return {
			id: `doc-${relativePath.replace(/\.md$/, "").replace(/\//g, "--")}`,
			title: heading ?? basename(relativePath, ".md"),
			type: "other",
			createdDate: modified,
			updatedDate: modified,
			rawContent: parseMarkdown(content).content,
			name: basename(relativePath),
			path: relativePath,
			lastModified: modified,
			tags: relativePath.includes("/") ? [relativePath.split("/")[0] as string] : [],
		};
	}

	/** Documento = todo .md da arquitetura, inclusive em subpasta (backlog-adapter.js:218-228, `docs`). */
	override async listDocuments(): Promise<Document[]> {
		const relativePaths = (await this.listMarkdownFiles()).sort();
		const docs: Document[] = [];
		for (const relativePath of relativePaths) {
			const filePath = join(this.project.archDir, relativePath);
			let content: string;
			try {
				content = await readFile(filePath, "utf8");
			} catch {
				continue;
			}
			const info = await stat(filePath);
			docs.push(this.toDocument(relativePath, content, formatCanonDate(info.mtime)));
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
	 * Pergunta pendente do nó (proposta) + decisão formal ADR-/ASR-/"decisão" + desenho aprovado
	 * referenciado por um nó (aceitas) — backlog-adapter.js:239-283, `decisions`.
	 */
	override async listDecisions(): Promise<Decision[]> {
		const raw = await this.readRawNodes();
		const decisions: Decision[] = [];

		for (const node of raw) {
			const body = parseCanonNode(node.content, node.id).description ?? "";
			bulletSection(node.content, "Perguntas").forEach((line, index) => {
				if (!line.startsWith("- [ ]")) return;
				const dateMatch = /\[(\d{4}-\d{2}-\d{2})/.exec(line);
				const text = line.replace(/^- \[ \]\s*(\[[^\]]*\]\s*)?/, "").trim();
				const context = `Nó ${node.id}: ${body}`;
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
		}

		const seen = new Set<string>();
		const decisionFiles = (await this.listMarkdownFiles()).filter((relativePath) =>
			IS_DECISION_FILE.test(basename(relativePath)),
		);
		for (const relativePath of decisionFiles) {
			await this.acceptDecisionFile(
				decisions,
				seen,
				join(this.project.archDir, relativePath),
				relativePath.replace(/\.md$/, ""),
				`Decisão formal: docs/architecture/${relativePath}`,
			);
		}

		for (const node of raw) {
			const design = rawField(frontmatterText(node.content), "desenho");
			if (!design) continue;
			const who = raw
				.filter((other) => rawField(frontmatterText(other.content), "desenho") === design)
				.map((other) => other.id);
			await this.acceptDecisionFile(
				decisions,
				seen,
				resolve(this.project.repoRoot, design),
				`desenho-${basename(design, ".md")}`,
				`Desenho aprovado dos nós ${who.join(", ")} (${design})`,
			);
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
	override async saveConfig(..._args: Parameters<FileSystem["saveConfig"]>): ReturnType<FileSystem["saveConfig"]> {
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
