// Codec do nó do canon (drummond-canon, nó 1.34.10.3). Portado de
// scripts/canon-tools/backlog-adapter.js do drummond-canon: NOMES (linhas 19-22), limparTexto
// (linhas 57-67), titulo (linhas 124-128) e paraTask (linhas 130-161). O código do status
// continua sendo a verdade no arquivo; o nome aqui é só o que a tela do Backlog.md exibe.
import { parseMarkdown } from "../markdown/parser.ts";
import type { Task } from "../types/index.ts";
import { normalizeDueDate } from "../utils/due-date.ts";
import { normalizePriorityValue } from "../utils/priority-config.ts";
import { isCanonId } from "./identity.ts";

/** backlog-adapter.js:19-22 (NOMES). */
export const STATUS_NAMES: Record<string, string> = {
	CAPTURED: "Capturado",
	TODO: "A fazer",
	DOING: "Em curso",
	BLOCKED: "Travado",
	VERIFY: "A verificar",
	ACTIVE: "Ativo",
	DEFERRED: "Adiado",
	DONE: "Entregue",
	REJECTED: "Recusado",
	SUPERSEDED: "Substituído",
};

/** Estado fora do canon: aparece, nunca some (backlog-adapter.js:24-26). */
export const INVALID_STATUS = "Estado inválido";

const CANON_BLOCK = /```canon\n([\s\S]*?)```/;
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Campo lido do TEXTO CRU do frontmatter, nunca do YAML já resolvido (backlog-adapter.js:33-36,
 * `campo`). Um id Dewey como "1.40" é sintaxe válida de float em YAML — resolvido, vira o número
 * 1.4 e perde o zero à direita. Os campos que o próprio canon grava (id, status, parent, tipo,
 * gerado_em, desenho, review) sempre saem daqui; só os campos novos do Backlog.md usam o YAML.
 */
function rawField(frontmatterText: string, name: string): string {
	const match = new RegExp(`^${name}:[ \\t]*"?([^"\\n]*)"?[ \\t]*$`, "m").exec(frontmatterText);
	return match ? (match[1] ?? "").trim() : "";
}

function frontmatterText(content: string): string {
	return FRONTMATTER_BLOCK.exec(content)?.[1] ?? "";
}

/** Um nó do canon é frontmatter com `id` Dewey E um bloco ```canon``` — nunca uma tarefa comum deles. */
export function isCanonNode(content: string): boolean {
	if (!CANON_BLOCK.test(content)) return false;
	return isCanonId(rawField(frontmatterText(content), "id"));
}

const STATUS_WORDS = Object.keys(STATUS_NAMES);
// Estado antigo escrito DENTRO do texto (monolito, antes de o estado ir para o cabeçalho): sai do
// título. backlog-adapter.js:50-51 (ESTADO_ENTRE_COLCHETES, ESTADO_SOLTO).
const BRACKETED_OLD_STATUS = new RegExp(`\\s*\\[(?:${STATUS_WORDS.join("|")})\\b[^\\]]*\\]`, "g");
const LOOSE_OLD_STATUS = new RegExp(`\\s+(?:${STATUS_WORDS.join("|")})\\b`, "g");

/**
 * Texto do nó pronto para a tela: tira a referência de linha ("# L647"), o desenho de árvore
 * ("|| └──"), o próprio id repetido no começo e o estado antigo solto. backlog-adapter.js:57-67.
 */
export function cleanNodeText(raw: string, id: string): string {
	let text = String(raw).replace(/\s+/g, " ").trim();
	text = text.replace(/^#\s*L\d+\s*\|?\s*/, "").replace(/^L\d+\s*\|\s*/, "");
	text = text.replace(/^[\s│├└─|]+/, "");
	if (id && (text === id || text.startsWith(`${id} `))) text = text.slice(id.length);
	return text
		.replace(BRACKETED_OLD_STATUS, "")
		.replace(/\s*[│├└]+\s*/g, " ")
		.replace(LOOSE_OLD_STATUS, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** 1ª frase = título (backlog-adapter.js:119-128). Corta só em fim de frase de verdade (. ! ?). */
function nodeTitle(body: string): string {
	const match = /^(.{12,}?[.!?])(\s|$)/.exec(body);
	const title = match?.[1] ?? body;
	return title.length > 140 ? `${title.slice(0, 139).trimEnd()}…` : title;
}

/** backlog-adapter.js:44-47 (secao) — linhas marcadas ("- ") dentro de uma seção `## <heading>`. */
function bulletSection(text: string, heading: string): string[] {
	const match = new RegExp(`\\n## ${heading}\\n([\\s\\S]*?)(\\n## |$)`).exec(text);
	return match ? (match[1] ?? "").split("\n").filter((line) => line.startsWith("- ")) : [];
}

/**
 * backlog-adapter.js:38-42 (`data`). Aceita string crua (id/status/gerado_em, lidos via `rawField`)
 * ou Date (campo novo lido pelo YAML deles, que resolve timestamp não citado — `updated_date`).
 */
function formatCanonDate(value: unknown): string {
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

/**
 * Nó do canon → Task deles. Chaves existentes mapeadas (backlog-adapter.js:paraTask); campos novos
 * lidos com o nome que o Backlog.md grava no arquivo, com os mesmos normalizadores do `parseTask`.
 */
export function parseCanonNode(content: string, fileId?: string): Task {
	const { frontmatter, content: rawContent } = parseMarkdown(content);
	const fm = frontmatterText(content);
	const id = fileId ?? rawField(fm, "id");

	const block = CANON_BLOCK.exec(rawContent);
	const body = cleanNodeText(block?.[1] ?? "", id);
	const journal = bulletSection(rawContent, "Journal");

	const statusCode = rawField(fm, "status");
	const tipo = rawField(fm, "tipo") || undefined;
	const desenho = rawField(fm, "desenho") || undefined;
	const review = rawField(fm, "review") || undefined;
	const geradoEm = rawField(fm, "gerado_em") || undefined;

	const references = [
		...(desenho ? [desenho] : []),
		...(review ? [review] : []),
		...stringArray(frontmatter.references),
	];

	return {
		id,
		title: body
			? nodeTitle(body)
			: journal.length
				? nodeTitle(journal[0]?.replace(/^-\s*(\[[^\]]*\]\s*)?/, "") ?? "")
				: "(nó sem texto)",
		status: STATUS_NAMES[statusCode] ?? INVALID_STATUS,
		assignee: Array.isArray(frontmatter.assignee)
			? frontmatter.assignee.map(String)
			: frontmatter.assignee
				? [String(frontmatter.assignee)]
				: [],
		reporter: stringOrUndefined(frontmatter.reporter),
		createdDate: formatCanonDate(geradoEm),
		updatedDate: frontmatter.updated_date ? formatCanonDate(frontmatter.updated_date) : undefined,
		dueDate: normalizeDueDate(frontmatter.due_date, "due_date"),
		labels: tipo ? [tipo] : [],
		milestone: stringOrUndefined(frontmatter.milestone),
		dependencies: stringArray(frontmatter.dependencies),
		references,
		documentation: stringArray(frontmatter.documentation),
		modifiedFiles: stringArray(frontmatter.modified_files),
		rawContent,
		description: body,
		implementationNotes: journal.length ? journal.map((line) => line.replace(/^-\s*/, "")).join("\n\n") : undefined,
		parentTaskId: rawField(fm, "parent") || undefined,
		priority: normalizePriorityValue(frontmatter.priority ? String(frontmatter.priority) : undefined),
		type: stringOrUndefined(frontmatter.type),
	};
}
