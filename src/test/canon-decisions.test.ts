import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { setCanonIdentity } from "../canon/identity.ts";
import { type CanonFileSystem, createFileSystem } from "../canon/index.ts";

const ROOT = join(import.meta.dir, "fixtures", "canon-project");

/** As quatro fontes da spec §5 (drummond-canon, nó 1.34.12) — cada teste prova uma fonte isolada. */
describe("CanonFileSystem.listDecisions — quatro fontes (spec §5)", () => {
	afterEach(() => setCanonIdentity(false));

	test("fonte 1: decisão formal (arquivo ADR-nomeado) continua aceita", async () => {
		const decisions = await createFileSystem(ROOT).listDecisions();
		const adr = decisions.find((d) => d.id.includes("ADR-001"));
		expect(adr?.status).toBe("accepted");
	});

	test("fonte 2: seção '## Decisão' dentro de um documento comum (não decisão-nomeado)", async () => {
		const decisions = await createFileSystem(ROOT).listDecisions();
		const found = decisions.find((d) => d.id.startsWith("decision-secao-design-exemplo"));
		expect(found?.status).toBe("accepted");
		expect(found?.decision).toContain("JSON para o campo de exemplo");
		expect(found?.context).toContain("design-exemplo.md");
	});

	test("fonte 3: registro de nó em que o Drummond decidiu (verbatim) — as duas formas aceitas", async () => {
		const decisions = await createFileSystem(ROOT).listDecisions();
		const nodeDecisions = decisions.filter((d) => d.id.startsWith("decision-no-1.2.9-"));
		expect(nodeDecisions).toHaveLength(2);
		expect(nodeDecisions[0]?.title).toContain("DECIDIDO formato");
		expect(nodeDecisions[1]?.title).toContain("verbatim");
	});

	test("fonte 3 é conservadora: linha de investigação sem marcador de decisão fica de fora", async () => {
		const decisions = await createFileSystem(ROOT).listDecisions();
		const leaked = decisions.some((d) => d.decision.includes("Investigação: conferido que ninguém decidiu"));
		expect(leaked).toBe(false);
	});

	test("fonte 4: pergunta pendente (## Perguntas) continua proposta", async () => {
		const decisions = await createFileSystem(ROOT).listDecisions();
		const pergunta = decisions.find((d) => d.id.startsWith("decision-pergunta-1.2-"));
		expect(pergunta?.status).toBe("proposed");
	});

	test("nó estrutural (por tipo) não interfere na leitura das decisões (raw nodes independe do filtro do quadro)", async () => {
		const fs = createFileSystem(ROOT) as CanonFileSystem;
		const decisions = await fs.listDecisions();
		expect(decisions.some((d) => d.id.startsWith("decision-no-1.11-"))).toBe(false); // 1.11 não tem Journal
	});
});
