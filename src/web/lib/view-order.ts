/**
 * Shows `tasks` in the order a column sort chose (drummond-canon 1.34.13.1). Sorting is a view choice: nothing is written,
 * so it works the same whether the project can persist order or not. Tasks unknown to the order keep their place at the end.
 */
export function applyViewOrder<T extends { id: string }>(tasks: T[], viewOrder: string[] | null): T[] {
	if (!viewOrder) return tasks;
	const rank = new Map(viewOrder.map((id, index) => [id, index]));
	const known = tasks.filter((task) => rank.has(task.id)).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
	return [...known, ...tasks.filter((task) => !rank.has(task.id))];
}
