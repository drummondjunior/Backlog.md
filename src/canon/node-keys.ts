// Mapa único legado→atual de chave do frontmatter do nó (drummond-canon, nó 1.44.6). Porta de
// scripts/canon-tools/node-keys.js: fonte é o MESMO backlog-map (fields.<campo>.legacyKey) — nenhuma
// lista própria aqui. `node-codec.ts` (rawField) e `canon-file-system.ts` leem por ele, indiretamente,
// via `rawField` (único choke point de leitura de frontmatter cru do canon neste fork).
import { loadBacklogMap } from "./backlog-map.ts";

interface FieldDef {
	legacyKey?: string;
}

/** legado → atual, ex.: { tipo: "kind", gerado_em: "created_date", ... }. */
export function nodeKeyMap(repoRoot?: string): Record<string, string> {
	const { fields } = loadBacklogMap(repoRoot);
	const map: Record<string, string> = {};
	for (const [current, def] of Object.entries(fields)) {
		const legacyKey = (def as FieldDef)?.legacyKey;
		if (legacyKey) map[legacyKey] = current;
	}
	return map;
}
