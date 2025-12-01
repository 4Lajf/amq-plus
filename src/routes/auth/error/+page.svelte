<script>
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
</script>

<svelte:head>
	<title>Authentication Error - AMQ Plus</title>
	<meta name="description" content="An error occurred during authentication" />
</svelte:head>

<div class="container mx-auto max-w-md py-16">
	<Card class="">
		<CardHeader class="">
			<CardTitle class="text-red-600">Authentication Error</CardTitle>
			<CardDescription class="">
				We encountered an issue while trying to sign you in with Discord.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="rounded-lg bg-red-50 p-4">
				<div class="flex">
					<div class="flex-shrink-0">
						<svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<div class="ml-3">
						<h3 class="text-sm font-medium text-red-800">Sign-in failed</h3>
						<div class="mt-2 text-sm text-red-700">
							<p>This could be due to:</p>
							<ul class="mt-1 list-disc space-y-1 pl-5">
								<li>Network connectivity issues</li>
								<li>Discord OAuth configuration problems</li>
								<li>Temporary service unavailability</li>
							</ul>
						</div>
					</div>
				</div>
			</div>

			<div class="flex space-x-2">
				<form action="/auth?/discord" method="POST" class="flex-1">
					<Button type="submit" variant="default" class="w-full" disabled={false}>Try Again</Button>
				</form>
				<Button href="/" variant="outline" class="flex-1" disabled={false}>Go Home</Button>
			</div>
		</CardContent>
	</Card>
</div>
