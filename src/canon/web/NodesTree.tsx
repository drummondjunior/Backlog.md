// Seção recolhível "Nodes" no menu lateral (drummond-canon, nó 1.34.12, spec §6): a árvore Dewey
// completa do projeto aberto, pai → filhos por `parentTaskId`. O nó ESTRUTURAL (nó `1.34.10.5.3`)
// não vira Task pública (some do quadro/lista no conector), mas aqui é o próprio agrupador — por
// isso a árvore lê `/api/canon/nodes` (serviço do canon, que lê o disco direto), não `apiClient.tasks`.
// ~1000 nós (PHC): a árvore se monta 1x por troca de lista (useMemo) e só desce nos ramos abertos —
// nó fechado nunca chega a mapear os filhos dele.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUrlPath } from "../../web/utils/urlHelpers";
import { type CanonNodeSummary, fetchCanonNodes } from "./canon-api";

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
const TreeIcon = () => (
	<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			d="M3 3h6v6H3V3zm0 12h6v6H3v-6zm12-6h6v6h-6V9zM9 6h6m-6 12h3v-9h3"
		/>
	</svg>
);

interface TreeIndex {
	roots: CanonNodeSummary[];
	childrenOf: Map<string, CanonNodeSummary[]>;
}

function buildTreeIndex(nodes: CanonNodeSummary[]): TreeIndex {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const childrenOf = new Map<string, CanonNodeSummary[]>();
	const roots: CanonNodeSummary[] = [];
	for (const node of nodes) {
		if (node.parentId && byId.has(node.parentId)) {
			const siblings = childrenOf.get(node.parentId) ?? [];
			siblings.push(node);
			childrenOf.set(node.parentId, siblings);
		} else {
			roots.push(node);
		}
	}
	return { roots, childrenOf };
}

function NodeRow({
	node,
	depth,
	index,
	expanded,
	onToggle,
}: {
	node: CanonNodeSummary;
	depth: number;
	index: TreeIndex;
	expanded: Record<string, boolean>;
	onToggle: (id: string) => void;
}) {
	const navigate = useNavigate();
	const children = index.childrenOf.get(node.id) ?? [];
	const isOpen = expanded[node.id] ?? depth === 0;
	const isStructural = node.status === "estrutural" || node.tipo === "estrutural";

	const openNode = useCallback(() => {
		if (isStructural) return; // agrupador, não abre detalhe (não é Task)
		navigate(createUrlPath("/board", node.id, node.title));
	}, [isStructural, navigate, node.id, node.title]);

	return (
		<div>
			<div
				className="flex items-center px-3 py-1.5 text-sm rounded-lg transition-colors duration-200 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
				style={{ paddingLeft: `${12 + depth * 14}px` }}
			>
				{children.length > 0 ? (
					<button
						type="button"
						onClick={() => onToggle(node.id)}
						className="shrink-0 text-gray-400 dark:text-gray-500"
						aria-label={isOpen ? "Collapse" : "Expand"}
					>
						{isOpen ? <ChevronDown /> : <ChevronRight />}
					</button>
				) : (
					<span className="inline-block w-4" />
				)}
				<button
					type="button"
					onClick={openNode}
					className={`ml-1 flex-1 truncate text-left ${isStructural ? "font-semibold uppercase tracking-wide text-xs text-gray-500 dark:text-gray-400 cursor-default" : ""}`}
					title={node.title}
				>
					<span className="text-gray-400 dark:text-gray-500 mr-1">{node.id}</span>
					{node.title}
					{isStructural && <span className="ml-2 normal-case font-normal text-gray-400 dark:text-gray-500">(Structural)</span>}
				</button>
			</div>
			{isOpen &&
				children.map((child) => (
					<NodeRow key={child.id} node={child} depth={depth + 1} index={index} expanded={expanded} onToggle={onToggle} />
				))}
		</div>
	);
}

export default function NodesTree() {
	const [nodes, setNodes] = useState<CanonNodeSummary[] | null>(null);
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const [isCollapsed, setIsCollapsed] = useState(() => {
		try {
			const saved = localStorage.getItem("canonNodesTreeCollapsed");
			return saved ? JSON.parse(saved) : true; // recolhido por padrão: árvore grande (PHC ~1000 nós)
		} catch {
			return true;
		}
	});

	useEffect(() => {
		fetchCanonNodes()
			.then(setNodes)
			.catch(() => setNodes([]));
	}, []);

	useEffect(() => {
		try {
			localStorage.setItem("canonNodesTreeCollapsed", JSON.stringify(isCollapsed));
		} catch {
			/* preferência não persiste, sem quebrar a tela */
		}
	}, [isCollapsed]);

	const index = useMemo(() => buildTreeIndex(nodes ?? []), [nodes]);
	const toggle = useCallback((id: string) => setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? false) })), []);

	// Sem o serviço do canon na frente (Backlog.md comum): sem `/api/canon/nodes`, a seção some.
	if (!nodes || nodes.length === 0) return null;

	return (
		<div className="px-4 py-4">
			<div className="flex items-center space-x-3 mb-4">
				<button
					type="button"
					onClick={() => setIsCollapsed(!isCollapsed)}
					className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors duration-200"
					title={isCollapsed ? "Expand node tree" : "Collapse node tree"}
				>
					{isCollapsed ? <ChevronRight /> : <ChevronDown />}
				</button>
				<span className="text-gray-500 dark:text-gray-400">
					<TreeIcon />
				</span>
				<span className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 whitespace-nowrap">
					Node tree ({nodes.length})
				</span>
			</div>
			{!isCollapsed && (
				<div className="space-y-0.5 max-h-96 overflow-y-auto">
					{index.roots.map((root) => (
						<NodeRow key={root.id} node={root} depth={0} index={index} expanded={expanded} onToggle={toggle} />
					))}
				</div>
			)}
		</div>
	);
}
