// Versão no rodapé do menu lateral (drummond-canon, nó 1.34.12, spec §6): a do PLUGIN canon, curta
// ("canon 1.12.0") — a de hoje ("Backlog.md - v{versão}") quebrava o rodapé (linha longa demais).
import { useEffect, useState } from "react";
import { fetchCanonVersion } from "./canon-api";

export default function CanonVersion() {
	const [version, setVersion] = useState("");

	useEffect(() => {
		fetchCanonVersion()
			.then(setVersion)
			.catch(() => setVersion(""));
	}, []);

	if (!version) return null;
	return <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">canon {version}</span>;
}
