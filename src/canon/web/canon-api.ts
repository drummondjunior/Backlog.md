// Fetch direto para as rotas do serviço do canon (drummond-canon, nó 1.34.12). Sem passar pelo
// `ApiClient` deles (src/web/lib/api.ts): as rotas `/api/canon/*` vivem no proxy do canon, não no
// servidor do Backlog.md, e o código novo mora só em `src/canon/` (README.md do branch).
export interface CanonProjectSummary {
	repo: string;
	rootDir: string;
	current: boolean;
}

export interface CanonNodeSummary {
	id: string;
	title: string;
	status: string;
	tipo?: string;
	parentId?: string;
}

async function getJson<T>(url: string): Promise<T> {
	const res = await fetch(url, { cache: "no-store" });
	if (!res.ok) throw new Error(`${url}: ${res.status}`);
	return res.json() as Promise<T>;
}

export function fetchCanonProjects(): Promise<CanonProjectSummary[]> {
	return getJson("/api/canon/projects");
}

export function fetchCanonNodes(): Promise<CanonNodeSummary[]> {
	return getJson("/api/canon/nodes");
}

export function fetchCanonVersion(): Promise<string> {
	return getJson<{ version: string }>("/api/canon/version").then((d) => d.version);
}

async function postJson(url: string, body: unknown): Promise<void> {
	const res = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		throw new Error((data as { error?: string }).error || `${url}: ${res.status}`);
	}
}

export function addCanonProject(rootDir: string): Promise<void> {
	return postJson("/api/canon/projects/add", { rootDir });
}

export function removeCanonProject(rootDir: string): Promise<void> {
	return postJson("/api/canon/projects/remove", { rootDir });
}

/** Navegação de servidor de verdade (troca de cookie via `/open`) — nunca o roteador do React. */
export function openCanonProject(repo: string): void {
	window.location.assign(`/open?repo=${encodeURIComponent(repo)}`);
}
