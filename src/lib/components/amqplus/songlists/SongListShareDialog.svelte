<script>
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Copy, RefreshCw, Check, Loader2, AlertTriangle, ExternalLink } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/stores';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';

	/** @type {{ open: boolean, listId: string|null, listName: string }} */
	let { open = $bindable(false), listId, listName } = $props();

	let loading = $state(false);
	let generating = $state(false);
	let viewToken = $state('');
	let editToken = $state('');
	let activeTab = $state('view');
	let copiedView = $state(false);
	let copiedEdit = $state(false);

	// Derived URLs
	let viewUrl = $derived(viewToken ? `${$page.url.origin}/songlist/create?view=${viewToken}` : '');
	let editUrl = $derived(editToken ? `${$page.url.origin}/songlist/create?edit=${editToken}` : '');

	$effect(() => {
		if (open && listId) {
			loadTokens();
		}
	});

	async function loadTokens() {
		if (!listId) return;
		loading = true;
		try {
			const response = await fetch(`/api/song-lists/${listId}/share`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tokenType: 'view' })
			});

			if (!response.ok) {
				throw new Error('Failed to load share tokens');
			}

			const data = await response.json();
			viewToken = data.viewToken;
			editToken = data.editToken;
		} catch (error) {
			console.error('Error loading tokens:', error);
			toast.error('Failed to load share links');
		} finally {
			loading = false;
		}
	}

	async function createEditLink() {
		if (!listId || editToken) return;
		generating = true;
		try {
			const response = await fetch(`/api/song-lists/${listId}/share`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tokenType: 'edit' })
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.message || 'Failed to create edit link');
			editToken = data.editToken;
			toast.success('Edit link created');
		} catch (error) {
			toast.error(error.message || 'Failed to create edit link');
		} finally {
			generating = false;
		}
	}

	let showRegenerateConfirmation = $state(false);
	let pendingTokenType = $state('view');
	/** @type {HTMLElement | null} */
	let regenerateOpener = null;

	function requestRegenerateToken(type, event) {
		pendingTokenType = type;
		regenerateOpener = event.currentTarget;
		showRegenerateConfirmation = true;
	}

	async function regenerateToken(type) {
		showRegenerateConfirmation = false;
		if (!listId || generating) return;

		generating = true;
		try {
			const response = await fetch(`/api/song-lists/${listId}/share`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tokenType: type })
			});

			if (!response.ok) {
				throw new Error('Failed to regenerate token');
			}

			const data = await response.json();
			if (type === 'view' || type === 'both') viewToken = data.viewToken;
			if (type === 'edit' || type === 'both') editToken = data.editToken;

			toast.success(`New ${type} link generated`);
		} catch (error) {
			console.error('Error regenerating token:', error);
			toast.error('Failed to regenerate link');
		} finally {
			generating = false;
			requestAnimationFrame(() => {
				if (regenerateOpener?.isConnected) regenerateOpener.focus();
			});
		}
	}

	function copyToClipboard(text, type) {
		navigator.clipboard.writeText(text);
		if (type === 'view') {
			copiedView = true;
			setTimeout(() => (copiedView = false), 2000);
		} else {
			copiedEdit = true;
			setTimeout(() => (copiedEdit = false), 2000);
		}
		toast.success('Link copied to clipboard');
	}
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-[500px]" portalProps={{}}>
		<DialogHeader class="">
			<DialogTitle class="">Share "{listName}"</DialogTitle>
			<DialogDescription class="">
				Share your song list with others. You can provide read-only access or allow others to edit
				this list.
			</DialogDescription>
		</DialogHeader>

		{#if loading}
			<div class="flex h-40 items-center justify-center">
				<Loader2 class="text-primary h-8 w-8 animate-spin" />
			</div>
		{:else}
			<Tabs bind:value={activeTab} class="w-full">
				<TabsList class="grid h-auto w-full grid-cols-2">
					<TabsTrigger value="view">View Link</TabsTrigger>
					<TabsTrigger value="edit">Edit Link</TabsTrigger>
				</TabsList>

				<TabsContent value="view" class="space-y-4 py-4">
					<div
						class="rounded-md bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
					>
						<div class="flex gap-2">
							<ExternalLink class="h-5 w-5 shrink-0" />
							<p>
								Anyone with this link can view your list and save a copy for themselves. They cannot
								change your original list.
							</p>
						</div>
					</div>

					<div class="space-y-2">
						<Label class="">View Link</Label>
						<div class="flex gap-2">
							<Input class="w-full" aria-label="View Link" type="text" value={viewUrl} readonly />
							<Button
								variant="outline"
								size="icon"
								disabled={false}
								onclick={() => copyToClipboard(viewUrl, 'view')}
								title="Copy link"
								aria-label="Copy view link"
							>
								{#if copiedView}
									<Check class="h-4 w-4" />
								{:else}
									<Copy class="h-4 w-4" />
								{/if}
							</Button>
						</div>
					</div>

					<div class="flex justify-end">
						<Button
							variant="ghost"
							size="sm"
							disabled={generating}
							onclick={(event) => requestRegenerateToken('view', event)}
							class="text-xs text-gray-500 hover:text-gray-900"
						>
							<RefreshCw class={`mr-2 h-3 w-3 ${generating ? 'animate-spin' : ''}`} />
							Regenerate View Link
						</Button>
					</div>
				</TabsContent>

				<TabsContent value="edit" class="space-y-4 py-4">
					<div
						class="rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300"
					>
						<div class="flex gap-2">
							<AlertTriangle class="h-5 w-5 shrink-0" />
							<p class="font-medium">Warning: Anyone with this link can edit your list!</p>
						</div>
						<p class="mt-2 pl-7">
							They can add or remove songs, rename the list, and change settings. Only share this
							with people you trust.
						</p>
					</div>

					{#if !editToken}
						<div class="rounded-md border border-gray-200 p-4 text-sm">
							<p>
								No edit link exists. Creating one gives anyone who has it permission to change this
								list.
							</p>
							<Button class="mt-3" onclick={createEditLink} disabled={generating}
								>Create edit link</Button
							>
						</div>
					{:else}
						<div class="space-y-2">
							<Label class="">Edit Link</Label>
							<div class="flex gap-2">
								<Input class="w-full" aria-label="Edit Link" type="text" value={editUrl} readonly />
								<Button
									variant="outline"
									size="icon"
									disabled={false}
									onclick={() => copyToClipboard(editUrl, 'edit')}
									title="Copy link"
									aria-label="Copy edit link"
								>
									{#if copiedEdit}
										<Check class="h-4 w-4" />
									{:else}
										<Copy class="h-4 w-4" />
									{/if}
								</Button>
							</div>
						</div>

						<div class="flex justify-end">
							<Button
								variant="ghost"
								size="sm"
								disabled={generating}
								onclick={(event) => requestRegenerateToken('edit', event)}
								class="text-xs text-gray-500 hover:text-gray-900"
							>
								<RefreshCw class={`mr-2 h-3 w-3 ${generating ? 'animate-spin' : ''}`} />
								Regenerate Edit Link
							</Button>
						</div>
					{/if}
				</TabsContent>
			</Tabs>
		{/if}

		<DialogFooter class="">
			<Button variant="outline" disabled={false} onclick={() => (open = false)}>
				Close
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<AlertDialog.Root bind:open={showRegenerateConfirmation}>
 <AlertDialog.Content class="" portalProps={{}} onCloseAutoFocus={(event) => {
   event.preventDefault();
   const opener = regenerateOpener;
   requestAnimationFrame(() => {
     if (!showRegenerateConfirmation && opener?.isConnected) opener.focus();
   });
 }}>
  <AlertDialog.Header class="">
   <AlertDialog.Title class="">Replace the {pendingTokenType} link?</AlertDialog.Title>
   <AlertDialog.Description class="">The current {pendingTokenType} link for "{listName}" will stop working. Anyone using it will need the new link.</AlertDialog.Description>
  </AlertDialog.Header>
  <AlertDialog.Footer class="">
   <AlertDialog.Cancel class="">Cancel</AlertDialog.Cancel>
   <AlertDialog.Action class="" onclick={() => regenerateToken(pendingTokenType)}>Replace link</AlertDialog.Action>
  </AlertDialog.Footer>
 </AlertDialog.Content>
</AlertDialog.Root>
