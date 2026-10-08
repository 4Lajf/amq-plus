<script>
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		Home,
		FileText,
		MessageSquare,
		User,
		LogOut,
		Music,
		Edit,
		ListChecks,
		Target
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { getUserDisplayName } from '$lib/utils/user-display.js';

	let { data } = $props();
	let { session, user, supabase } = $derived(data || {});

	let mobileMenuOpen = $state(false);
	let mobileMenuButton = $state(null);

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

	function handleWindowKeydown(event) {
		if (event.key !== 'Escape' || !mobileMenuOpen) return;
		mobileMenuOpen = false;
		queueMicrotask(() => mobileMenuButton?.focus());
	}

	const currentPath = $derived(page.url.pathname);
	const signInAction = $derived(
		`/auth?/discord&next=${encodeURIComponent(page.url.pathname + page.url.search + page.url.hash)}`
	);
	const accountName = $derived(getUserDisplayName(user));

	const logout = async () => {
		if (supabase) {
			const { error } = await supabase.auth.signOut();
			if (error) {
				console.error('Sign out error:', error);
				return;
			}
		}
		closeMobileMenu();
		await goto('/', { invalidateAll: true });
	};
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<a
	href="#main-content"
	class="sr-only fixed top-2 left-2 z-[100] rounded-md bg-gray-950 px-4 py-3 text-sm font-semibold text-white shadow-lg focus:not-sr-only"
>
	Skip to main content
</a>

<nav class="sticky top-0 z-50 border-b border-gray-200/50 bg-white/80 backdrop-blur-md">
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="flex h-16 items-center justify-between">
			<div class="shrink-0">
				<a href="/" class="flex items-center space-x-2" onclick={closeMobileMenu}>
					<div
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-rose-500 to-pink-600"
					>
						<span class="text-sm font-bold text-white">A+</span>
					</div>
					<span class="text-xl font-bold text-gray-900">AMQ PLUS</span>
				</a>
			</div>

			<!-- Desktop Navigation -->
			<div class="hidden items-center space-x-8 xl:flex">
				<div class="flex items-baseline space-x-8">
					<a
						href="/"
						aria-current={currentPath === '/' ? 'page' : undefined}
						class="flex items-center space-x-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 {currentPath ===
						'/'
							? 'bg-rose-50 text-rose-600'
							: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
					>
						<Home size={16} />
						<span>Home</span>
					</a>
					<a
						href="/quizzes"
						aria-current={currentPath.startsWith('/quizzes') ? 'page' : undefined}
						class="flex items-center space-x-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 {currentPath.startsWith(
							'/quizzes'
						)
							? 'bg-rose-50 text-rose-600'
							: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
					>
						<ListChecks size={16} />
						<span>Quizzes</span>
					</a>
					<a
						href="/songlist"
						aria-current={currentPath.startsWith('/songlist') ? 'page' : undefined}
						class="flex items-center space-x-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 {currentPath.startsWith(
							'/songlist'
						)
							? 'bg-rose-50 text-rose-600'
							: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
					>
						<Music size={16} />
						<span>Song Lists</span>
					</a>
					<a
						href="/training"
						aria-current={currentPath.startsWith('/training') ? 'page' : undefined}
						class="flex items-center space-x-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 {currentPath.startsWith(
							'/training'
						)
							? 'bg-rose-50 text-rose-600'
							: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
					>
						<Target size={16} />
						<span>Training</span>
					</a>
					<a
						href="/changelog"
						aria-current={currentPath === '/changelog' ? 'page' : undefined}
						class="flex items-center space-x-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 {currentPath ===
						'/changelog'
							? 'bg-rose-50 text-rose-600'
							: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
					>
						<FileText size={16} />
						<span>Changelog</span>
					</a>
					<a
						href="/feedback"
						aria-current={currentPath === '/feedback' ? 'page' : undefined}
						class="flex items-center space-x-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 {currentPath ===
						'/feedback'
							? 'bg-rose-50 text-rose-600'
							: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
					>
						<MessageSquare size={16} />
						<span>Feedback</span>
					</a>
				</div>

				<!-- Auth Section -->
				{#if session && user}
					<div class="flex items-center space-x-3">
						<a
							href="/private"
							aria-current={currentPath.startsWith('/private') ? 'page' : undefined}
							class="flex items-center space-x-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 {currentPath.startsWith(
								'/private'
							)
								? 'bg-rose-50 text-rose-600'
								: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
						>
							<User size={16} />
							<span>Dashboard</span>
						</a>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger
								class="flex cursor-pointer items-center space-x-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm transition-colors duration-200 hover:border-rose-300"
							>
								{#if user.user_metadata?.avatar_url}
									<img
										src={user.user_metadata.avatar_url}
										alt="Discord Avatar"
										class="h-7 w-7 rounded-full ring-2 ring-rose-200"
									/>
								{/if}
								<span class="text-sm font-medium text-gray-900">
									{accountName}
								</span>
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="w-56" portalProps={{}}>
								<DropdownMenu.Label class="" inset={false}>My Account</DropdownMenu.Label>
								<DropdownMenu.Separator class="" />
								<DropdownMenu.Item
									onclick={logout}
									class="cursor-pointer text-gray-700"
									inset={false}
								>
									<LogOut size={16} class="mr-2" />
									Sign Out
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				{:else}
					<div class="flex items-center space-x-4">
						<form action={signInAction} method="POST">
							<button
								type="submit"
								class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-gray-900 hover:shadow-md focus:ring-2 focus:ring-gray-700 focus:ring-offset-2 focus:outline-none active:bg-black"
							>
								Sign in with Discord
							</button>
						</form>
					</div>
				{/if}
			</div>

			<!-- Mobile menu button -->
			<div class="xl:hidden">
				<Button
					bind:ref={mobileMenuButton}
					onclick={toggleMobileMenu}
					variant="ghost"
					size="icon"
					class="inline-flex items-center justify-center rounded-md p-2 text-gray-700 transition-colors duration-200 hover:bg-rose-50 hover:text-rose-600 focus:ring-2 focus:ring-rose-500 focus:outline-none focus:ring-inset"
					aria-expanded={mobileMenuOpen}
					aria-controls="mobile-main-menu"
					aria-label={mobileMenuOpen ? 'Close main menu' : 'Open main menu'}
					disabled={false}
				>
					<span class="sr-only">{mobileMenuOpen ? 'Close main menu' : 'Open main menu'}</span>
					{#if !mobileMenuOpen}
						<svg
							class="block h-6 w-6"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 6h16M4 12h16M4 18h16"
							/>
						</svg>
					{:else}
						<svg
							class="block h-6 w-6"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					{/if}
				</Button>
			</div>
		</div>
	</div>

	<!-- Mobile menu -->
	{#if mobileMenuOpen}
		<div id="mobile-main-menu" class="xl:hidden">
			<div
				class="space-y-1 border-t border-gray-200/50 bg-white/95 px-2 pt-2 pb-3 backdrop-blur-md sm:px-3"
			>
				<a
					href="/"
					aria-current={currentPath === '/' ? 'page' : undefined}
					onclick={closeMobileMenu}
					class="flex items-center space-x-3 rounded-md px-3 py-2 text-base font-medium transition-colors duration-200 {currentPath ===
					'/'
						? 'bg-rose-50 text-rose-600'
						: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
				>
					<Home size={18} />
					<span>Home</span>
				</a>
				<a
					href="/quizzes"
					aria-current={currentPath.startsWith('/quizzes') ? 'page' : undefined}
					onclick={closeMobileMenu}
					class="flex items-center space-x-3 rounded-md px-3 py-2 text-base font-medium transition-colors duration-200 {currentPath.startsWith(
						'/quizzes'
					)
						? 'bg-rose-50 text-rose-600'
						: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
				>
					<ListChecks size={18} />
					<span>Quizzes</span>
				</a>
				<a
					href="/songlist"
					aria-current={currentPath.startsWith('/songlist') ? 'page' : undefined}
					onclick={closeMobileMenu}
					class="flex items-center space-x-3 rounded-md px-3 py-2 text-base font-medium transition-colors duration-200 {currentPath.startsWith(
						'/songlist'
					)
						? 'bg-rose-50 text-rose-600'
						: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
				>
					<Music size={18} />
					<span>Song Lists</span>
				</a>
				<a
					href="/training"
					aria-current={currentPath.startsWith('/training') ? 'page' : undefined}
					onclick={closeMobileMenu}
					class="flex items-center space-x-3 rounded-md px-3 py-2 text-base font-medium transition-colors duration-200 {currentPath.startsWith(
						'/training'
					)
						? 'bg-rose-50 text-rose-600'
						: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
				>
					<Target size={18} />
					<span>Training</span>
				</a>
				<a
					href="/changelog"
					aria-current={currentPath === '/changelog' ? 'page' : undefined}
					onclick={closeMobileMenu}
					class="flex items-center space-x-3 rounded-md px-3 py-2 text-base font-medium transition-colors duration-200 {currentPath ===
					'/changelog'
						? 'bg-rose-50 text-rose-600'
						: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
				>
					<FileText size={18} />
					<span>Changelog</span>
				</a>
				<a
					href="/feedback"
					aria-current={currentPath === '/feedback' ? 'page' : undefined}
					onclick={closeMobileMenu}
					class="flex items-center space-x-3 rounded-md px-3 py-2 text-base font-medium transition-colors duration-200 {currentPath ===
					'/feedback'
						? 'bg-rose-50 text-rose-600'
						: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
				>
					<MessageSquare size={18} />
					<span>Feedback</span>
				</a>

				<!-- Auth Section for Mobile -->
				{#if session && user}
					<div class="mt-3 border-t border-gray-200 pt-3">
						<a
							href="/private"
							aria-current={currentPath.startsWith('/private') ? 'page' : undefined}
							onclick={closeMobileMenu}
							class="flex items-center space-x-3 rounded-md px-3 py-2 text-base font-medium transition-colors duration-200 {currentPath.startsWith(
								'/private'
							)
								? 'bg-rose-50 text-rose-600'
								: 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'}"
						>
							<User size={18} />
							<span>Dashboard</span>
						</a>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger
								class="mb-2 flex w-full cursor-pointer items-center space-x-3 rounded-lg bg-rose-50 px-3 py-2"
							>
								{#if user.user_metadata?.avatar_url}
									<img
										src={user.user_metadata.avatar_url}
										alt="Discord Avatar"
										class="h-10 w-10 rounded-full ring-2 ring-rose-300"
									/>
								{/if}
								<span class="text-sm font-medium text-gray-900">
									{accountName}
								</span>
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="w-56" portalProps={{}}>
								<DropdownMenu.Label class="" inset={false}>My Account</DropdownMenu.Label>
								<DropdownMenu.Separator class="" />
								<DropdownMenu.Item
									onclick={() => {
										logout();
										closeMobileMenu();
									}}
									class="cursor-pointer text-gray-700"
									inset={false}
								>
									<LogOut size={18} class="mr-2" />
									Sign Out
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				{:else}
					<div class="mt-3 border-t border-gray-200 pt-3">
						<form action={signInAction} method="POST">
							<button
								type="submit"
								class="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-gray-800 px-4 py-3 text-base font-medium text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-gray-900 hover:shadow-md focus:ring-2 focus:ring-gray-700 focus:ring-offset-2 focus:outline-none active:bg-black"
								onclick={closeMobileMenu}
							>
								Sign in with Discord
							</button>
						</form>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</nav>
