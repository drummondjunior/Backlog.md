// Item "Notifications (N)" no menu lateral (drummond-canon, nó 1.34.13, spec §6.1): mesmo padrão
// visual dos outros itens de nível 1 (Milestones, Statistics — SideNavigation.tsx), expandido e no
// modo rail (sidebar recolhida). N = pendentes de todos os projetos (`pending` + `fixed`, o mesmo
// "open" que o resumo antigo usava). Endpoint ausente (projeto comum, sem o serviço do canon na
// frente): o item nem aparece — nunca um erro na tela (mesmo padrão de ProjectsSection.tsx).
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { fetchCanonNotifications } from "./canon-api";

const OPEN_STATUSES = new Set(["pending", "fixed"]);

const BellIcon = () => (
	<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
		/>
	</svg>
);

interface NotificationsNavLinkProps {
	collapsed: boolean;
}

export default function NotificationsNavLink({ collapsed }: NotificationsNavLinkProps) {
	const [openCount, setOpenCount] = useState<number | null>(null);
	const [available, setAvailable] = useState(true);

	useEffect(() => {
		let active = true;
		const load = () =>
			fetchCanonNotifications()
				.then((items) => {
					if (!active) return;
					setOpenCount(items.filter((item) => OPEN_STATUSES.has(item.status)).length);
					setAvailable(true);
				})
				.catch(() => {
					if (active) setAvailable(false);
				});
		load();
		let source: EventSource | null = null;
		try {
			source = new EventSource("/events");
			source.onmessage = load;
		} catch {
			/* sem tempo real, o contador fica só no que carregou */
		}
		return () => {
			active = false;
			source?.close();
		};
	}, []);

	if (!available) return null;

	const label = openCount === null ? "Notifications" : `Notifications (${openCount})`;

	if (collapsed) {
		return (
			<NavLink
				to="/notifications"
				data-tooltip-id="sidebar-tooltip"
				data-tooltip-content={label}
				className={({ isActive }) =>
					`flex items-center justify-center p-3 rounded-md transition-colors duration-200 ${
						isActive
							? "bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400"
							: "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
					}`
				}
			>
				<div className="w-6 h-6 flex items-center justify-center relative">
					<BellIcon />
					{Boolean(openCount) && (
						<span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
					)}
				</div>
			</NavLink>
		);
	}

	return (
		<NavLink
			to="/notifications"
			className={({ isActive }) =>
				`flex items-center px-3 py-2 rounded-lg transition-colors duration-200 ${
					isActive
						? "bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 font-medium"
						: "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
				}`
			}
		>
			<BellIcon />
			<span className="ml-3 text-sm font-medium">{label}</span>
		</NavLink>
	);
}
