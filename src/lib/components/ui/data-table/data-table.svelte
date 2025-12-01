<script>
	import {
		createSvelteTable,
		getCoreRowModel,
		getFilteredRowModel,
		getSortedRowModel,
		getPaginationRowModel,
		FlexRender
	} from '@tanstack/table-core';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-svelte';

	let {
		data = [],
		columns = [],
		sorting = $bindable([]),
		columnFilters = $bindable([]),
		columnVisibility = $bindable({}),
		rowSelection = $bindable({}),
		pagination = $bindable({ pageIndex: 0, pageSize: 100 }),
		onSortingChange = undefined,
		onColumnFiltersChange = undefined,
		onColumnVisibilityChange = undefined,
		onRowSelectionChange = undefined,
		onPaginationChange = undefined
	} = $props();

	const table = createSvelteTable({
		get data() {
			return data;
		},
		columns,
		state: {
			get sorting() {
				return sorting;
			},
			get columnFilters() {
				return columnFilters;
			},
			get columnVisibility() {
				return columnVisibility;
			},
			get rowSelection() {
				return rowSelection;
			},
			get pagination() {
				return pagination;
			}
		},
		onSortingChange: (updater) => {
			if (typeof updater === 'function') {
				sorting = updater(sorting);
			} else {
				sorting = updater;
			}
			if (onSortingChange) onSortingChange(sorting);
		},
		onColumnFiltersChange: (updater) => {
			if (typeof updater === 'function') {
				columnFilters = updater(columnFilters);
			} else {
				columnFilters = updater;
			}
			if (onColumnFiltersChange) onColumnFiltersChange(columnFilters);
		},
		onColumnVisibilityChange: (updater) => {
			if (typeof updater === 'function') {
				columnVisibility = updater(columnVisibility);
			} else {
				columnVisibility = updater;
			}
			if (onColumnVisibilityChange) onColumnVisibilityChange(columnVisibility);
		},
		onRowSelectionChange: (updater) => {
			if (typeof updater === 'function') {
				rowSelection = updater(rowSelection);
			} else {
				rowSelection = updater;
			}
			if (onRowSelectionChange) onRowSelectionChange(rowSelection);
		},
		onPaginationChange: (updater) => {
			if (typeof updater === 'function') {
				pagination = updater(pagination);
			} else {
				pagination = updater;
			}
			if (onPaginationChange) onPaginationChange(pagination);
		},
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel()
	});

	let showPagination = $derived(table.getPageCount() > 1);
</script>

<div class="overflow-x-auto">
	<Table.Root>
		<Table.Header>
			{#each table.getHeaderGroups() as headerGroup}
				<Table.Row>
					{#each headerGroup.headers as header}
						<Table.Head>
							{#if !header.isPlaceholder}
								{#if header.column.getCanSort()}
									<button
										class="flex items-center gap-2 hover:text-gray-900"
										onclick={() => header.column.toggleSorting()}
									>
										<FlexRender
											content={header.column.columnDef.header}
											context={header.getContext()}
										/>
										{#if header.column.getIsSorted() === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else if header.column.getIsSorted() === 'desc'}
											<ChevronDown class="h-4 w-4" />
										{:else}
											<ChevronsUpDown class="h-4 w-4 opacity-50" />
										{/if}
									</button>
								{:else}
									<FlexRender
										content={header.column.columnDef.header}
										context={header.getContext()}
									/>
								{/if}
							{/if}
						</Table.Head>
					{/each}
				</Table.Row>
			{/each}
		</Table.Header>
		<Table.Body>
			{#if table.getRowModel().rows?.length}
				{#each table.getRowModel().rows as row}
					<Table.Row>
						{#each row.getVisibleCells() as cell}
							<Table.Cell>
								<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
							</Table.Cell>
						{/each}
					</Table.Row>
				{/each}
			{:else}
				<Table.Row>
					<Table.Cell colspan={columns.length} class="h-24 text-center">
						No results.
					</Table.Cell>
				</Table.Row>
			{/if}
		</Table.Body>
	</Table.Root>
</div>

{#if showPagination}
	<div class="flex items-center justify-between border-t px-6 py-4">
		<div class="text-sm text-gray-700">
			Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to
			{Math.min(
				(table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
				table.getFilteredRowModel().rows.length
			)} of {table.getFilteredRowModel().rows.length} results
		</div>
		<div class="flex gap-2">
			<Button
				onclick={() => table.previousPage()}
				variant="outline"
				size="sm"
				disabled={!table.getCanPreviousPage()}
			>
				<ChevronLeft class="h-4 w-4" />
				Previous
			</Button>
			<div class="flex items-center gap-1">
				{#each Array.from({ length: Math.min(5, table.getPageCount()) }, (_, i) => {
					const start = Math.max(
						0,
						Math.min(
							table.getState().pagination.pageIndex - 2,
							table.getPageCount() - 5
						)
					);
					return start + i;
				}) as page}
					<Button
						onclick={() => table.setPageIndex(page)}
						variant={table.getState().pagination.pageIndex === page ? 'default' : 'outline'}
						size="sm"
						class="min-w-[2.5rem]"
					>
						{page + 1}
					</Button>
				{/each}
			</div>
			<Button
				onclick={() => table.nextPage()}
				variant="outline"
				size="sm"
				disabled={!table.getCanNextPage()}
			>
				Next
				<ChevronRight class="h-4 w-4" />
			</Button>
		</div>
	</div>
{/if}

