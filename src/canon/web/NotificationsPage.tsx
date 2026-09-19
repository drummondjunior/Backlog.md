// Página de Notificações (drummond-canon, nó 1.34.13, spec §6.1): UMA área com as notificações de
// TODOS os projetos do computador. O tipo de notificação é o grupo (como um marco na página de
// Marcos deles — MilestonesPage.tsx/MilestoneTaskRow.tsx — cujo layout e classes este componente
// espelha: page-shell, cartão de grupo com cabeçalho recolhível, tabela com cabeçalho em grade e
// linhas divide-y). Hoje o único tipo é Exceção de rótulo (label-exception.js do plugin); outros
// tipos entram como grupos novos, sem tela nova. Substitui a página `/exceptions` e a seção "Canon"
// injetada por fora do React (apply.js) — feitas à mão, fora do padrão.
import { useCallback, useEffect, useState } from "react";
import {
	answerCanonNotification,
	canonNotificationNodeLink,
	type CanonNotification,
	fetchCanonNotifications,
} from "./canon-api";

const STATUS_LABEL: Record<CanonNotification["status"], string> = {
	pending: "Waiting for you",
	fixed: "Fixed, waiting for you",
	approved: "Looks good",
	rejected: "Revalidation requested",
};

const STATUS_BADGE_CLASS: Record<CanonNotification["status"], string> = {
	pending: "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300",
	fixed: "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300",
	approved: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300",
	rejected: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
};

const STATUS_ORDER: CanonNotification["status"][] = ["pending", "fixed", "rejected", "approved"];
const OPEN_STATUSES = new Set<CanonNotification["status"]>(["pending", "fixed"]);

interface NotificationGroup {
	type: string;
	label: string;
	items: CanonNotification[];
}

// Hoje o serviço do canon só devolve exceções de rótulo — um grupo só. Outro tipo chega como outro
// grupo aqui, sem mudar o resto da página (spec §6.1: "outros tipos entram como grupos novos").
function groupNotifications(items: CanonNotification[]): NotificationGroup[] {
	if (items.length === 0) return [];
	return [{ type: "label-exception", label: "Label exception", items }];
}

function NotificationRow({
	item,
	onAnswer,
	isAnswering,
}: {
	item: CanonNotification;
	onAnswer: (id: string, status: "approved" | "rejected") => void;
	isAnswering: boolean;
}) {
	const project = item.project || item.repo || "(project not recorded)";
	const waiting = OPEN_STATUSES.has(item.status);

	return (
		<div className="px-3 py-3">
			<div className="grid grid-cols-[auto_1fr_auto] gap-3 items-start">
				<div className="w-32">
					<span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
						{project}
					</span>
					<div className="mt-1 flex flex-wrap gap-1">
						{(item.nodes ?? []).length > 0 ? (
							(item.nodes ?? []).map((nodeId) => (
								<a
									key={nodeId}
									href={canonNotificationNodeLink(project, nodeId)}
									className="text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline"
								>
									{nodeId}
								</a>
							))
						) : (
							<span className="text-xs text-gray-400 dark:text-gray-500">(node not recorded)</span>
						)}
					</div>
				</div>

				<div className="min-w-0">
					<div className="text-sm font-semibold text-gray-900 dark:text-gray-100">“{item.match}”</div>
					<div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{item.reason}</div>
					{item.context?.excerpt ? (
						<pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-gray-50 dark:bg-gray-900/40 px-2 py-1.5 text-xs text-gray-600 dark:text-gray-300">
							{item.context.excerpt}
						</pre>
					) : (
						<div className="mt-1 text-xs text-gray-400 dark:text-gray-500">(no block record)</div>
					)}
				</div>

				<div className="flex flex-col items-end gap-2">
					<span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE_CLASS[item.status]}`}>
						{STATUS_LABEL[item.status]}
					</span>
					{waiting && (
						<div className="flex gap-2">
							<button
								type="button"
								disabled={isAnswering}
								onClick={() => onAnswer(item.id, "approved")}
								className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-60"
							>
								Looks good
							</button>
							<button
								type="button"
								disabled={isAnswering}
								onClick={() => onAnswer(item.id, "rejected")}
								className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 dark:border-red-700 text-red-600 dark:text-red-300 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-60"
							>
								Request revalidation
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export default function NotificationsPage() {
	const [items, setItems] = useState<CanonNotification[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [answeringId, setAnsweringId] = useState<string | null>(null);
	const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

	const reload = useCallback(() => {
		fetchCanonNotifications()
			.then((next) => {
				const sorted = [...next].sort(
					(a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.createdAt.localeCompare(a.createdAt),
				);
				setItems(sorted);
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load notifications"))
			.finally(() => setIsLoading(false));
	}, []);

	useEffect(() => {
		reload();
		let source: EventSource | null = null;
		try {
			source = new EventSource("/events");
			source.onmessage = reload;
		} catch {
			/* sem tempo real, a página segue com o que carregou */
		}
		return () => source?.close();
	}, [reload]);

	const handleAnswer = async (id: string, status: "approved" | "rejected") => {
		setAnsweringId(id);
		try {
			await answerCanonNotification(id, status);
			reload();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to answer notification");
		} finally {
			setAnsweringId(null);
		}
	};

	const groups = groupNotifications(items);
	const openCount = items.filter((item) => OPEN_STATUSES.has(item.status)).length;

	return (
		<div className="page-shell transition-colors duration-200">
			<div className="flex flex-wrap items-center justify-between gap-4 mb-6">
				<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
					Notifications <span className="text-base font-normal text-gray-500 dark:text-gray-400">({openCount} open)</span>
				</h1>
			</div>

			{error && (
				<div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
					<p className="text-sm text-red-700 dark:text-red-400">{error}</p>
				</div>
			)}

			{isLoading ? (
				<div className="text-gray-600 dark:text-gray-300">Loading...</div>
			) : groups.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 text-center">
					<p className="text-gray-500 dark:text-gray-400">No notifications.</p>
				</div>
			) : (
				<div className="space-y-4">
					{groups.map((group) => {
						const isExpanded = expandedGroups[group.type] ?? true;
						const groupOpen = group.items.filter((item) => OPEN_STATUSES.has(item.status)).length;
						return (
							<div
								key={group.type}
								className="rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
							>
								<div className="px-5 py-4 flex items-center justify-between gap-4">
									<div className="min-w-0">
										<h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{group.label}</h3>
										<span className="text-sm text-gray-500 dark:text-gray-400">
											{group.items.length} item{group.items.length === 1 ? "" : "s"} · {groupOpen} open
										</span>
									</div>
									<button
										type="button"
										onClick={() => setExpandedGroups((c) => ({ ...c, [group.type]: !isExpanded }))}
										className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
									>
										{isExpanded ? "Hide" : "Show"} items
										<svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
										</svg>
									</button>
								</div>
								{isExpanded && (
									<div className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
										{group.items.map((item) => (
											<NotificationRow
												key={item.id}
												item={item}
												onAnswer={handleAnswer}
												isAnswering={answeringId === item.id}
											/>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
