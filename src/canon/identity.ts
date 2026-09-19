// Número Dewey do drummond-canon (nó 1.34.10.2). Num projeto do canon o ID do nó passa intacto — sem prefixo,
// sem maiúscula — inclusive os antigos com letra ("11.o"); o canon não cria mais nó com letra, mas há muitos.
// Fora de projeto do canon, nada muda: "12" continua virando o ID com prefixo do Backlog.md.
const CANON_ID = /^[0-9]+(?:\.[0-9A-Za-z]+)*$/;

let canonProject = false;

/** Liga a identidade Dewey. Quem liga é o conector, ao abrir um projeto do canon. */
export function setCanonIdentity(enabled: boolean): void {
	canonProject = enabled;
}

export function isCanonId(id: string): boolean {
	return CANON_ID.test(id.trim());
}

/** Vale a regra Dewey para este ID: projeto do canon e ID no formato do canon. */
export function usesCanonIdentity(id: string): boolean {
	return canonProject && isCanonId(id);
}

function segmentKey(segment: string): [number, number, string] {
	return /^[0-9]+$/.test(segment) ? [0, Number(segment), ""] : [1, 0, segment.toLowerCase()];
}

/** Ordem da árvore: segmento a segmento, número antes de letra, "1.2" antes de "1.10". */
export function compareCanonIds(a: string, b: string): number {
	const left = a.split(".");
	const right = b.split(".");
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		if (left[i] === undefined) return -1;
		if (right[i] === undefined) return 1;
		const [kindA, numberA, textA] = segmentKey(left[i] as string);
		const [kindB, numberB, textB] = segmentKey(right[i] as string);
		if (kindA !== kindB) return kindA - kindB;
		if (numberA !== numberB) return numberA - numberB;
		if (textA !== textB) return textA < textB ? -1 : 1;
	}
	return 0;
}
