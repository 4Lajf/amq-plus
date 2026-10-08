export { default as FlexRender } from "./flex-render.svelte";
export { renderComponent, renderSnippet } from "./render-helpers.js";
export { createSvelteTable } from "./data-table.svelte.js";

// Re-export additional TanStack Table functions
export {
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	getPaginationRowModel
} from '@tanstack/table-core';