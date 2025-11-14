<script>
	import { goto } from '$app/navigation';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import {
		User,
		LogOut,
		Plus,
		ListChecks,
		Music,
		Home,
		FileText,
		MessageSquare,
		Settings,
		TrendingUp,
		Heart,
		Play,
		ArrowRight,
		Target
	} from 'lucide-svelte';

	// @ts-ignore
	let { data } = $props();
	let { user, session, supabase, stats } = $derived(data || {});

	const displayName = $derived(
		user?.user_metadata?.custom_claims?.global_name ||
			user?.user_metadata?.preferred_username ||
			user?.email?.split('@')[0] ||
			'User'
	);

	const logout = async () => {
		if (supabase) {
			const { error } = await supabase.auth.signOut();
			if (error) {
				console.error('Sign out error:', error);
			} else {
				goto('/');
			}
		}
	};
</script>

<svelte:head>
	<title>Dashboard - AMQ Plus</title>
	<meta name="description" content="Your private AMQ Plus dashboard" />
</svelte:head>

<div class="space-y-6">
	<!-- Welcome Section -->
	<div>
		<h1 class="text-3xl font-bold text-gray-900">Welcome back, {displayName}!</h1>
		<p class="mt-2 text-gray-600">Manage your quizzes, check your stats, and navigate the page.</p>
	</div>

	<!-- User Profile & Stats Row -->
	<div class="grid gap-6 md:grid-cols-3">
		<!-- User Profile Card -->
		<Card class="">
			<CardHeader class="">
				<CardTitle class="">Profile</CardTitle>
				<CardDescription class="">Your account information</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				{#if user}
					<div class="flex items-center space-x-4">
						{#if user.user_metadata?.avatar_url}
							<img
								src={user.user_metadata.avatar_url}
								alt="Avatar"
								class="h-16 w-16 rounded-full ring-2 ring-rose-200"
							/>
						{:else}
							<div
								class="flex h-16 w-16 items-center justify-center rounded-full bg-linear-to-br from-rose-400 to-pink-500 text-xl font-bold text-white"
							>
								{displayName.charAt(0).toUpperCase()}
							</div>
						{/if}
						<div class="flex-1">
							<p class="font-semibold text-gray-900">{displayName}</p>
							<p class="text-sm text-gray-600">{user.email}</p>
						</div>
					</div>
					<div class="border-t pt-4">
						<Button onclick={logout} variant="outline" class="w-full" size="sm" disabled={false}>
							<LogOut size={16} class="mr-2" />
							Sign Out
						</Button>
					</div>
				{/if}
			</CardContent>
		</Card>

		<!-- Statistics Card -->
		<Card class="md:col-span-2">
			<CardHeader class="">
				<CardTitle class="">Your Statistics</CardTitle>
				<CardDescription class="">Overview of your quiz activity</CardDescription>
			</CardHeader>
			<CardContent class="">
				<div class="grid grid-cols-3 gap-4">
					<div
						class="rounded-lg border border-gray-200 bg-linear-to-br from-rose-50 to-pink-50 p-4 text-center"
					>
						<div
							class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100"
						>
							<ListChecks class="h-6 w-6 text-rose-600" />
						</div>
						<p class="text-2xl font-bold text-gray-900">{stats?.quizCount || 0}</p>
						<p class="text-xs text-gray-600">Quizzes Created</p>
					</div>
					<div
						class="rounded-lg border border-gray-200 bg-linear-to-br from-blue-50 to-cyan-50 p-4 text-center"
					>
						<div
							class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100"
						>
							<Play class="h-6 w-6 text-blue-600" />
						</div>
						<p class="text-2xl font-bold text-gray-900">{stats?.totalPlays || 0}</p>
						<p class="text-xs text-gray-600">Total Plays</p>
					</div>
					<div
						class="rounded-lg border border-gray-200 bg-linear-to-br from-pink-50 to-rose-50 p-4 text-center"
					>
						<div
							class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-pink-100"
						>
							<Heart class="h-6 w-6 text-pink-600" />
						</div>
						<p class="text-2xl font-bold text-gray-900">{stats?.totalLikes || 0}</p>
						<p class="text-xs text-gray-600">Total Likes</p>
					</div>
				</div>
			</CardContent>
		</Card>
	</div>

	<!-- Quick Actions Section -->
	<div>
		<h2 class="mb-4 text-xl font-semibold text-gray-900">Quick Actions</h2>
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			<Button
				href="/quizzes/create"
				size="lg"
				class="h-auto flex-col items-start justify-start gap-3 bg-linear-to-br from-rose-500 to-pink-600 p-6 text-left hover:from-rose-600 hover:to-pink-700"
				disabled={false}
				data-sveltekit-preload-data="off"
			>
				<div class="flex w-full items-center justify-between">
					<Plus class="h-6 w-6" />
					<ArrowRight class="h-5 w-5" />
				</div>
				<div>
					<p class="font-semibold">Create Quiz</p>
					<p class="text-sm opacity-90">Build a new quiz configuration</p>
				</div>
			</Button>

			<Button
				href="/songlist/create"
				size="lg"
				class="h-auto flex-col items-start justify-start gap-3 bg-linear-to-br from-blue-500 to-cyan-600 p-6 text-left hover:from-blue-600 hover:to-cyan-700"
				disabled={false}
				data-sveltekit-preload-data="off"
			>
				<div class="flex w-full items-center justify-between">
					<Music class="h-6 w-6" />
					<ArrowRight class="h-5 w-5" />
				</div>
				<div>
					<p class="font-semibold">Create Song List</p>
					<p class="text-sm opacity-90">Add a new song list</p>
				</div>
			</Button>

			<Button
				href="/training"
				size="lg"
				class="h-auto flex-col items-start justify-start gap-3 bg-linear-to-br from-purple-500 to-violet-600 p-6 text-left hover:from-purple-600 hover:to-violet-700"
				disabled={false}
			>
				<div class="flex w-full items-center justify-between">
					<Target class="h-6 w-6" />
					<ArrowRight class="h-5 w-5" />
				</div>
				<div>
					<p class="font-semibold">Training Mode</p>
					<p class="text-sm opacity-90">Practice with spaced repetition</p>
				</div>
			</Button>

			<Button
				href="/quizzes?myQuizzes=true"
				size="lg"
				variant="outline"
				class="h-auto flex-col items-start justify-start gap-3 border-2 p-6 text-left"
				disabled={false}
			>
				<div class="flex w-full items-center justify-between">
					<ListChecks class="h-6 w-6" />
					<ArrowRight class="h-5 w-5" />
				</div>
				<div>
					<p class="font-semibold">My Quizzes</p>
					<p class="text-sm text-gray-600">View and manage your quizzes</p>
				</div>
			</Button>

			<Button
				href="/quizzes"
				size="lg"
				variant="outline"
				class="h-auto flex-col items-start justify-start gap-3 border-2 p-6 text-left"
				disabled={false}
			>
				<div class="flex w-full items-center justify-between">
					<TrendingUp class="h-6 w-6" />
					<ArrowRight class="h-5 w-5" />
				</div>
				<div>
					<p class="font-semibold">Browse Quizzes</p>
					<p class="text-sm text-gray-600">Explore community quizzes</p>
				</div>
			</Button>

			<Button
				href="/songlist"
				size="lg"
				variant="outline"
				class="h-auto flex-col items-start justify-start gap-3 border-2 p-6 text-left"
				disabled={false}
			>
				<div class="flex w-full items-center justify-between">
					<Music class="h-6 w-6" />
					<ArrowRight class="h-5 w-5" />
				</div>
				<div>
					<p class="font-semibold">Browse Song Lists</p>
					<p class="text-sm text-gray-600">Discover song lists</p>
				</div>
			</Button>
		</div>
	</div>

	<!-- Navigation Shortcuts Section -->
	<div>
		<h2 class="mb-4 text-xl font-semibold text-gray-900">Explore</h2>
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			<a href="/">
				<Card class="h-full transition-all hover:border-rose-300 hover:shadow-md">
					<CardHeader class="">
						<div class="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100">
							<Home class="h-5 w-5 text-rose-600" />
						</div>
						<CardTitle class="">Home</CardTitle>
						<CardDescription class="">Go to the homepage</CardDescription>
					</CardHeader>
				</Card>
			</a>

			<a href="/quizzes">
				<Card class="h-full transition-all hover:border-rose-300 hover:shadow-md">
					<CardHeader class="">
						<div class="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
							<ListChecks class="h-5 w-5 text-blue-600" />
						</div>
						<CardTitle class="">Quizzes</CardTitle>
						<CardDescription class="">Browse and play quizzes</CardDescription>
					</CardHeader>
				</Card>
			</a>

			<a href="/songlist">
				<Card class="h-full transition-all hover:border-rose-300 hover:shadow-md">
					<CardHeader class="">
						<div class="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
							<Music class="h-5 w-5 text-purple-600" />
						</div>
						<CardTitle class="">Song Lists</CardTitle>
						<CardDescription class="">Explore song collections</CardDescription>
					</CardHeader>
				</Card>
			</a>

			<a href="/editor">
				<Card class="h-full transition-all hover:border-rose-300 hover:shadow-md">
					<CardHeader class="">
						<div class="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
							<Settings class="h-5 w-5 text-green-600" />
						</div>
						<CardTitle class="">Editor</CardTitle>
						<CardDescription class="">Advanced node-based editor</CardDescription>
					</CardHeader>
				</Card>
			</a>

			<a href="/changelog">
				<Card class="h-full transition-all hover:border-rose-300 hover:shadow-md">
					<CardHeader class="">
						<div class="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100">
							<FileText class="h-5 w-5 text-yellow-600" />
						</div>
						<CardTitle class="">Changelog</CardTitle>
						<CardDescription class="">See what's new</CardDescription>
					</CardHeader>
				</Card>
			</a>

			<a href="/feedback">
				<Card class="h-full transition-all hover:border-rose-300 hover:shadow-md">
					<CardHeader class="">
						<div class="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-pink-100">
							<MessageSquare class="h-5 w-5 text-pink-600" />
						</div>
						<CardTitle class="">Feedback</CardTitle>
						<CardDescription class="">Share your thoughts</CardDescription>
					</CardHeader>
				</Card>
			</a>
		</div>
	</div>
</div>
