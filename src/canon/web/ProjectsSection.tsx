// Seção recolhível "Projetos" no menu lateral (drummond-canon, nó 1.34.12, spec §6/§7): mesmo
// padrão visual das seções Documents/Decisions deles (SideNavigation.tsx). Clicar troca de projeto
// pelo `/open?repo=` do serviço do canon — navegação de servidor de verdade, nunca o roteador do React.
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { type CanonProjectSummary, fetchCanonProjects, openCanonProject } from "./canon-api";

const FolderIcon = () => (
	<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
		/>
	</svg>
);

const ChevronDown = () => (
	<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
	</svg>
);

const ChevronRight = () => (
	<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	</svg>
);

export default function ProjectsSection() {
	const [projects, setProjects] = useState<CanonProjectSummary[] | null>(null);
	const [isCollapsed, setIsCollapsed] = useState(() => {
		try {
			const saved = localStorage.getItem("canonProjectsCollapsed");
			return saved ? JSON.parse(saved) : false;
		} catch {
			return false;
		}
	});

	useEffect(() => {
		fetchCanonProjects()
			.then(setProjects)
			.catch(() => setProjects([]));
	}, []);

	useEffect(() => {
		try {
			localStorage.setItem("canonProjectsCollapsed", JSON.stringify(isCollapsed));
		} catch {
			/* localStorage indisponível: a preferência só não persiste */
		}
	}, [isCollapsed]);

	// Endpoint ausente (projeto comum do Backlog.md, sem o serviço do canon na frente): a seção
	// simplesmente não aparece (spec §1 do plano) — nunca um erro na tela.
	if (!projects || projects.length === 0) return null;

	return (
		<div className="px-4 py-4">
			<div className="flex items-center space-x-3 mb-4">
				<button
					type="button"
					onClick={() => setIsCollapsed(!isCollapsed)}
					className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors duration-200"
					title={isCollapsed ? "Expand projects" : "Collapse projects"}
				>
					{isCollapsed ? <ChevronRight /> : <ChevronDown />}
				</button>
				<span className="text-gray-500 dark:text-gray-400">
					<FolderIcon />
				</span>
				<span className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 whitespace-nowrap">
					Projects ({projects.length})
				</span>
			</div>
			{!isCollapsed && (
				<div className="space-y-1">
					{projects.map((project) => (
						<button
							type="button"
							key={project.rootDir}
							onClick={() => openCanonProject(project.repo)}
							aria-current={project.current ? "page" : undefined}
							className={`flex w-full items-center space-x-3 px-3 py-2 text-sm rounded-lg transition-colors duration-200 text-left ${
								project.current
									? "bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 font-medium"
									: "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
							}`}
						>
							<span className="truncate">{project.repo}</span>
						</button>
					))}
					<NavLink
						to="/projects"
						className="block px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
					>
						Manage projects
					</NavLink>
				</div>
			)}
		</div>
	);
}
