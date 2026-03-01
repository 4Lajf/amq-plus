<script>
	import Editor2 from '$lib/components/amqplus/editor2/Editor2.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Quiz Builder - AMQ+</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@300;400;500;600&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<Editor2 session={data.session} user={data.user} loadQuizId={data.loadQuizId} shareToken={data.shareToken} />
