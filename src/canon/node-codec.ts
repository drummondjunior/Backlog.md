// Codec do nó do canon (drummond-canon, nó 1.34.10.3; nós, campos e mapa central em 1.34.10.7/1.43).
// Portado de scripts/canon-tools/backlog-adapter.js do drummond-canon: NOMES (linhas 19-22),
// limparTexto (linhas 57-67), titulo (linhas 124-128) e paraTask (linhas 130-161). O código do
// status continua sendo a verdade no arquivo; o nome aqui é só o que a tela do Backlog.md exibe.
// Nomes de estado, colunas e "Estado inválido" vêm do mapa central (backlog-map.ts) — nenhuma lista
// própria aqui. Sem contexto de projeto (parser.ts chama sem repoRoot), usa só o mapa base, sem
// sobreposição de repo.
import { parseMarkdown } from "../markdown/parser.ts";
import {
	AcceptanceCriteriaManager,
	CommentsManager,
	DefinitionOfDoneManager,
	extractStructuredSection,
	STRUCTURED_SECTION_KEYS,
} from "../markdown/structured-sections.ts";
import type { Task } from "../types/index.ts";
import { normalizeDueDate } from "../utils/due-date.ts";
import { normalizePriorityValue } from "../utils/priority-config.ts";
import { loadBacklogMap } from "./backlog-map.ts";
import { isCanonId } from "./identity.ts";
import { nodeKeyMap } from "./node-keys.ts";

interface StatusMapState {
	names: Record<string, string>;
	invalid: string;
	columns: string[];
	words: string[];
	bracketedOldStatus: RegExp;
	looseOldStatus: RegExp;
}

let cachedStatusState: StatusMapState | undefined;

/** Lê o mapa central uma vez e monta o estado derivado (nomes, colunas, regex de estado antigo). */
function statusState(): StatusMapState {
	if (cachedStatusState) return cachedStatusState;
	const map = loadBacklogMap();
	const names: Record<string, string> = {};
	const columns: string[] = [];
	let invalid = "Estado inválido";
	for (const [code, info] of Object.entries(map.statuses)) {
		if (code === "_invalid") {
			invalid = info.column ?? invalid;
			continue;
		}
		if (info.group === "structural" || !info.column) continue;
		names[code] = info.column;
		if (info.group !== "archived") columns.push(info.column);
	}
	const words = Object.keys(names);
	cachedStatusState = {
		names,
		invalid,
		columns,
		words,
		bracketedOldStatus: new RegExp(`\\s*\\[(?:${words.join("|")})\\b[^\\]]*\\]`, "g"),
		looseOldStatus: new RegExp(`\\s+(?:${words.join("|")})\\b`, "g"),
	};
	return cachedStatusState;
}

/** Nome exibido de cada estado (backlog-adapter.js:19-22, `NOMES`) — do mapa central. */
export function getStatusNames(): Record<string, string> {
	return statusState().names;
}

/** Estado fora do canon: aparece, nunca some (backlog-adapter.js:24-26). */
export function getInvalidStatus(): string {
	return statusState().invalid;
}

/** Profundidade do marco derivado (mapa central `fields.milestone.derivedDepth`; 2 se ausente). */
function milestoneDerivedDepth(): number {
	const milestoneField = loadBacklogMap().fields.milestone as { derivedDepth?: number } | undefined;
	return milestoneField?.derivedDepth ?? 2;
}

/**
 * Marco derivado quando o nó não tem `milestone` explícito: ancestral feito dos primeiros `depth`
 * segmentos do id (1.34.10.7 → "1.34" com depth 2; PHC "3.1.c" → "3.1"). Id com menos segmentos que
 * `depth` fica sem marco. Decisão do Drummond 2026-09-19 (nó 1.43).
 */
export function deriveMilestoneId(id: string, depth: number = milestoneDerivedDepth()): string | undefined {
	const segments = id.split(".");
	return segments.length < depth ? undefined : segments.slice(0, depth).join(".");
}

/**
 * Colunas do quadro, na ordem em que o trabalho anda (backlog-adapter.js:23, `COLUNAS`). Recusado e
 * Substituído não têm coluna — são arquivamento (nó 1.34.10.4, spec §4.1), não board.
 */
export function getColumns(): string[] {
	return statusState().columns;
}

const CANON_BLOCK = /```canon\n([\s\S]*?)```/;
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Campo lido do TEXTO CRU do frontmatter, nunca do YAML já resolvido (backlog-adapter.js:33-36,
 * `campo`). Um id Dewey como "1.40" é sintaxe válida de float em YAML — resolvido, vira o número
 * 1.4 e perde o zero à direita. Os campos que o próprio canon grava (id, status, parent, tipo,
 * gerado_em, desenho, review) sempre saem daqui; só os campos novos do Backlog.md usam o YAML.
 * Exportado: `CanonFileSystem` (1.34.10.4) precisa do mesmo campo cru para status/parent/desenho
 * ao listar o projeto inteiro, antes de decidir se um nó vira Task.
 */
/**
 * parseMarkdown deles, sem deixar um cabeçalho que o YAML não lê derrubar a leitura (nó 1.34.10.5.2: um documento
 * do PHC com "title: 06 — Comercial CRM: as-built ..." fazia o quadro dizer "não encontrado" para qualquer nó).
 * Cabeçalho ruim → sem campos de YAML, e o corpo é o texto depois do cabeçalho.
 */
export function safeParseMarkdown(content: string): { frontmatter: Record<string, unknown>; content: string } {
	try {
		return parseMarkdown(content);
	} catch {
		return { frontmatter: {}, content: content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "") };
	}
}

let cachedLegacyToCurrent: Record<string, string> | undefined;
let cachedCurrentToLegacy: Record<string, string> | undefined;

function keyAliases(): { legacyToCurrent: Record<string, string>; currentToLegacy: Record<string, string> } {
	if (!cachedLegacyToCurrent) {
		cachedLegacyToCurrent = nodeKeyMap();
		cachedCurrentToLegacy = Object.fromEntries(
			Object.entries(cachedLegacyToCurrent).map(([legacy, current]) => [current, legacy]),
		);
	}
	return { legacyToCurrent: cachedLegacyToCurrent, currentToLegacy: cachedCurrentToLegacy ?? {} };
}

function readRawField(rawFrontmatter: string, name: string): string {
	const match = new RegExp(`^${name}:[ \\t]*"?([^"\\n]*)"?[ \\t]*$`, "m").exec(rawFrontmatter);
	return match ? (match[1] ?? "").trim() : "";
}

/**
 * Lê `name` no frontmatter cru; sem `name`, tenta a outra forma da MESMA chave (legada↔atual, nó
 * 1.44.6, mesmo mecanismo de `campo()` em node-edit.js) — nó só com a chave antiga, só com a nova, ou
 * misturado leem igual, qualquer que seja o nome passado pelo chamador.
 */
export function rawField(rawFrontmatter: string, name: string): string {
	const direct = readRawField(rawFrontmatter, name);
	if (direct) return direct;
	const { legacyToCurrent, currentToLegacy } = keyAliases();
	const alias = legacyToCurrent[name] ?? currentToLegacy[name];
	return alias ? readRawField(rawFrontmatter, alias) : "";
}

export function frontmatterText(content: string): string {
	return FRONTMATTER_BLOCK.exec(content)?.[1] ?? "";
}

/** Um nó do canon é frontmatter com `id` Dewey E um bloco ```canon``` — nunca uma tarefa comum deles. */
export function isCanonNode(content: string): boolean {
	if (!CANON_BLOCK.test(content)) return false;
	return isCanonId(rawField(frontmatterText(content), "id"));
}

/**
 * Texto do nó pronto para a tela: tira a referência de linha ("# L647"), o desenho de árvore
 * ("|| └──"), o próprio id repetido no começo e o estado antigo solto. backlog-adapter.js:57-67.
 */
export function cleanNodeText(raw: string, id: string): string {
	const { bracketedOldStatus, looseOldStatus } = statusState();
	let text = String(raw).replace(/\s+/g, " ").trim();
	text = text.replace(/^#\s*L\d+\s*\|?\s*/, "").replace(/^L\d+\s*\|\s*/, "");
	text = text.replace(/^[\s│├└─|]+/, "");
	if (id && (text === id || text.startsWith(`${id} `))) text = text.slice(id.length);
	return text
		.replace(bracketedOldStatus, "")
		.replace(/\s*[│├└]+\s*/g, " ")
		.replace(looseOldStatus, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** 1ª frase = título (backlog-adapter.js:119-128). Corta só em fim de frase de verdade (. ! ?). */
function nodeTitle(body: string): string {
	return splitTitleAndRest(body).title;
}

/**
 * Título (1ª frase) e o resto do bloco `canon` depois dele — usado para a descrição nunca repetir o
 * título (Drummond viu a descrição repetir o título nos nós 3.6.b.4, 3.6.b.5, 3.7).
 */
function splitTitleAndRest(body: string): { title: string; rest: string } {
	const match = /^(.{12,}?[.!?])(\s|$)/.exec(body);
	const rawTitle = match?.[1] ?? body;
	const rest = match ? body.slice(match[0].length).trim() : "";
	const title = rawTitle.length > 140 ? `${rawTitle.slice(0, 139).trimEnd()}…` : rawTitle;
	return { title, rest };
}

/**
 * backlog-adapter.js:44-47 (secao) — linhas marcadas ("- ") dentro de uma seção `## <heading>`.
 * Exportado: `CanonFileSystem` reusa para ler "## Perguntas" ao montar decisões (spec §5).
 */
export function bulletSection(text: string, heading: string): string[] {
	const match = new RegExp(`\\n## ${heading}\\n([\\s\\S]*?)(\\n## |$)`).exec(text);
	return match ? (match[1] ?? "").split("\n").filter((line) => line.startsWith("- ")) : [];
}

/**
 * backlog-adapter.js:38-42 (`data`). Aceita string crua (id/status/gerado_em, lidos via `rawField`)
 * ou Date (campo novo lido pelo YAML deles, que resolve timestamp não citado — `updated_date`).
 * Exportado: `CanonFileSystem` reusa para formatar a data de criação vinda do git e a data de
 * decisão formal vinda do mtime do arquivo.
 */
export function formatCanonDate(value: unknown): string {
	const str = value instanceof Date ? value.toISOString() : String(value ?? "");
	const match = /(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(str);
	return match ? `${match[1]} ${match[2]}` : "";
}

function stringOrUndefined(value: unknown): string | undefined {
	return value ? String(value) : undefined;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.map(String) : [];
}

/** `tipo` do canon → label (normaliza a forma legada — `correcao` → `correção` — via mapa central). */
function normalizedTipoLabel(tipo: string | undefined): string | undefined {
	if (!tipo) return undefined;
	const legacy = loadBacklogMap().values?.nodeTypeLegacy ?? {};
	return legacy[tipo] ?? tipo;
}

/**
 * Nó do canon → Task deles. Chaves existentes mapeadas (backlog-adapter.js:paraTask); campos novos
 * lidos com o nome que o Backlog.md grava no arquivo, com os mesmos normalizadores do `parseTask`,
 * inclusive as seções estruturadas do corpo (critérios de aceite, definição de pronto, plano, resumo
 * final, comentários) lidas pelo próprio parser deles — nó 1.43, spec §4.2.
 */
export function parseCanonNode(content: string, fileId?: string): Task {
	const { frontmatter, content: rawContent } = safeParseMarkdown(content);
	const fm = frontmatterText(content);
	const id = fileId ?? rawField(fm, "id");

	const block = CANON_BLOCK.exec(rawContent);
	const body = cleanNodeText(block?.[1] ?? "", id);
	const { title: bodyTitle, rest: bodyRest } = body ? splitTitleAndRest(body) : { title: "", rest: "" };
	const journal = bulletSection(rawContent, "Journal");

	const statusCode = rawField(fm, "status");
	// nó 1.44.6: chave atual (kind/design/created_date) — rawField já lê a legada (tipo/desenho/
	// gerado_em) por baixo, num nó ainda não migrado por normalize-keys.
	const tipo = rawField(fm, "kind") || undefined;
	const desenho = rawField(fm, "design") || undefined;
	const review = rawField(fm, "review") || undefined;
	const geradoEm = rawField(fm, "created_date") || undefined;

	const references = [
		...(desenho ? [desenho] : []),
		...(review ? [review] : []),
		...stringArray(frontmatter.references),
	];

	// labels = tipo (normalizado) + frontmatter.labels, sem repetir (spec §4.2).
	const tipoLabel = normalizedTipoLabel(tipo);
	const labels = [...new Set([...(tipoLabel ? [tipoLabel] : []), ...stringArray(frontmatter.labels)])];

	// description: "## Description" se existir; senão o resto do bloco canon depois do título; senão
	// nenhuma — nunca uma cópia do título (visto repetindo nos nós 3.6.b.4, 3.6.b.5, 3.7).
	const descriptionSection = extractStructuredSection(rawContent, STRUCTURED_SECTION_KEYS.description);
	const description = descriptionSection || bodyRest || undefined;

	return {
		id,
		title: body
			? bodyTitle
			: journal.length
				? nodeTitle(journal[0]?.replace(/^-\s*(\[[^\]]*\]\s*)?/, "") ?? "")
				: "(nó sem texto)",
		status: getStatusNames()[statusCode] ?? getInvalidStatus(),
		assignee: Array.isArray(frontmatter.assignee)
			? frontmatter.assignee.map(String)
			: frontmatter.assignee
				? [String(frontmatter.assignee)]
				: [],
		reporter: stringOrUndefined(frontmatter.reporter),
		createdDate: frontmatter.created_date ? formatCanonDate(frontmatter.created_date) : formatCanonDate(geradoEm),
		updatedDate: frontmatter.updated_date ? formatCanonDate(frontmatter.updated_date) : undefined,
		dueDate: normalizeDueDate(frontmatter.due_date, "due_date"),
		labels,
		milestone: stringOrUndefined(frontmatter.milestone) ?? deriveMilestoneId(id),
		dependencies: stringArray(frontmatter.dependencies),
		references,
		documentation: stringArray(frontmatter.documentation),
		modifiedFiles: stringArray(frontmatter.modified_files),
		rawContent,
		description,
		acceptanceCriteriaItems: AcceptanceCriteriaManager.parseAllCriteria(rawContent),
		definitionOfDoneItems: DefinitionOfDoneManager.parseAllCriteria(rawContent),
		implementationPlan: extractStructuredSection(rawContent, STRUCTURED_SECTION_KEYS.implementationPlan),
		finalSummary: extractStructuredSection(rawContent, STRUCTURED_SECTION_KEYS.finalSummary),
		comments: CommentsManager.parseAllComments(rawContent),
		implementationNotes: journal.length ? journal.map((line) => line.replace(/^-\s*/, "")).join("\n\n") : undefined,
		parentTaskId: rawField(fm, "parent") || undefined,
		priority: normalizePriorityValue(frontmatter.priority ? String(frontmatter.priority) : undefined),
		type: stringOrUndefined(frontmatter.type),
		project: stringOrUndefined(frontmatter.project),
		onStatusChange: stringOrUndefined(frontmatter.onStatusChange),
	};
}
