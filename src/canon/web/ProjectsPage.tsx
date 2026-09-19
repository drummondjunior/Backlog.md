// Página de projetos do computador (drummond-canon, nó 1.34.12, spec §6/§7): dentro da tela deles,
// no mesmo visual da página de Settings — inclui e remove pelo `/api/canon/projects/add|remove`
// (panel/server.js do plugin), que este componente chama direto (não é rota do Backlog.md).
import { useEffect, useState } from "react";
import { addCanonProject, type CanonProjectSummary, fetchCanonProjects, openCanonProject, removeCanonProject } from "./canon-api";

export default function ProjectsPage() {
	const [projects, setProjects] = useState<CanonProjectSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [newPath, setNewPath] = useState("");
	const [busy, setBusy] = useState(false);

	const reload = () => {
		setLoading(true);
		fetchCanonProjects()
			.then((list) => {
				setProjects(list);
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load projects"))
			.finally(() => setLoading(false));
	};

	useEffect(reload, []);

	const handleAdd = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!newPath.trim()) return;
		setBusy(true);
		try {
			await addCanonProject(newPath.trim());
			setNewPath("");
			reload();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add project");
		} finally {
			setBusy(false);
		}
	};

	const handleRemove = async (rootDir: string) => {
		setBusy(true);
		try {
			await removeCanonProject(rootDir);
			reload();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to remove project");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="page-shell transition-colors duration-200">
			<div className="max-w-4xl mx-auto">
				<h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">Projects</h1>

				{error && (
					<div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
						<p className="text-sm text-red-700 dark:text-red-400">{error}</p>
					</div>
				)}

				<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
					<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Add project</h2>
					<form onSubmit={handleAdd} className="flex items-center gap-2">
						<input
							type="text"
							value={newPath}
							onChange={(e) => setNewPath(e.target.value)}
							placeholder="/absolute/path/to/repo"
							className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
						/>
						<button
							type="submit"
							disabled={busy || !newPath.trim()}
							className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500 disabled:opacity-50 transition-colors duration-200"
						>
							Add
						</button>
					</form>
					<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
						Project path — a repository with a canon.config.json. This list is per computer, shared by every project.
					</p>
				</div>

				<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Projects ({projects.length})</h2>
					{loading ? (
						<div className="text-gray-600 dark:text-gray-300">Loading...</div>
					) : projects.length === 0 ? (
						<p className="text-sm text-gray-500 dark:text-gray-400">No projects</p>
					) : (
						<ul className="space-y-2">
							{projects.map((project) => (
								<li
									key={project.rootDir}
									className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700"
								>
									<button
										type="button"
										onClick={() => openCanonProject(project.repo)}
										className="text-left flex-1"
									>
										<span className={`font-medium ${project.current ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-gray-100"}`}>
											{project.repo}
										</span>
										{project.current && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">Current project</span>}
										<div className="text-xs text-gray-500 dark:text-gray-400 truncate">{project.rootDir}</div>
									</button>
									<button
										type="button"
										onClick={() => handleRemove(project.rootDir)}
										disabled={busy}
										className="ml-4 px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
									>
										Remove
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}
