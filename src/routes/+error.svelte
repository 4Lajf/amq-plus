<script>
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';

	// Error page receives status and error via page (from load/error boundary)
	// error(403, { message: '...' }) → handle_error_and_jsonify returns { message, ...body }
	const status = $derived(page.status ?? 500);
	const error = $derived(page.error);

	const message = $derived.by(() => {
		if (error && typeof error === 'object' && typeof error.message === 'string') return error.message;
		if (error && typeof error === 'object' && error.body && typeof error.body.message === 'string')
			return error.body.message;
		if (typeof error === 'string') return error;
		return status === 404 ? 'Page not found' : 'Something went wrong';
	});
</script>

<svelte:head>
	<title>{status} - AMQ Plus</title>
</svelte:head>

<div class="container mx-auto max-w-md py-16">
	<Card>
		<CardHeader>
			<CardTitle class="text-red-600">{status}</CardTitle>
			<CardDescription>
				{message}
			</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="flex gap-2">
				<Button href="/" variant="default">Go Home</Button>
				{#if status === 403}
					<Button href="/training" variant="outline">Back to Training</Button>
				{/if}
			</div>
		</CardContent>
	</Card>
</div>
