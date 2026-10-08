<script>
	// @ts-ignore
	import { onMount } from 'svelte';
	// @ts-ignore
	import { fly } from 'svelte/transition';
	// @ts-ignore
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	export let placeholders = [];
	export let onSubmit;

	let currentPlaceholder = 0;
	let intervalRef;
	let value = '';
	let animating = false;
	let canvasRef, inputRef;
	let newDataRef = [];
	let pausedTime = null;
	let lastChangeTime = Date.now();
	const dispatch = createEventDispatcher();

	const startAnimation = () => {
		if (intervalRef) return; // Already running

		// Calculate remaining time for current placeholder if we were paused
		let nextInterval = 3000;
		if (pausedTime !== null) {
			const elapsedBeforePause = pausedTime - lastChangeTime;
			nextInterval = Math.max(100, 3000 - elapsedBeforePause);
			pausedTime = null;
		}

		// Set up the next change
		intervalRef = setTimeout(() => {
			currentPlaceholder = (currentPlaceholder + 1) % placeholders.length;
			lastChangeTime = Date.now();

			// Continue with regular interval
			intervalRef = setInterval(() => {
				currentPlaceholder = (currentPlaceholder + 1) % placeholders.length;
				lastChangeTime = Date.now();
			}, 3000);
		}, nextInterval);
	};

	const handleVisibilityChange = () => {
		if (document.visibilityState !== 'visible' && intervalRef) {
			clearTimeout(intervalRef);
			clearInterval(intervalRef);
			intervalRef = null;
			pausedTime = Date.now();
		} else if (document.visibilityState === 'visible') {
			startAnimation();
		}
	};

	onMount(() => {
		lastChangeTime = Date.now();
		startAnimation();
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			if (intervalRef) {
				clearTimeout(intervalRef);
				clearInterval(intervalRef);
			}
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	const draw = () => {
		if (!inputRef) return;
		const canvas = canvasRef;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		canvas.width = 800;
		canvas.height = 800;
		ctx.clearRect(0, 0, 800, 800);

		const computedStyles = getComputedStyle(inputRef);
		const fontSize = parseFloat(computedStyles.getPropertyValue('font-size'));
		ctx.font = `${fontSize * 2}px ${computedStyles.fontFamily}`;
		ctx.fillStyle = '#FFF';
		ctx.fillText(value, 16, 40);

		const imageData = ctx.getImageData(0, 0, 800, 800);
		const pixelData = imageData.data;
		const newData = [];

		for (let t = 0; t < 800; t++) {
			let i = 4 * t * 800;
			for (let n = 0; n < 800; n++) {
				let e = i + 4 * n;
				if (pixelData[e] !== 0 && pixelData[e + 1] !== 0 && pixelData[e + 2] !== 0) {
					newData.push({
						x: n,
						y: t,
						color: [pixelData[e], pixelData[e + 1], pixelData[e + 2], pixelData[e + 3]]
					});
				}
			}
		}

		newDataRef = newData.map(({ x, y, color }) => ({
			x,
			y,
			r: 1,
			color: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`
		}));
	};

	const animate = (start) => {
		const animateFrame = (pos = 0) => {
			requestAnimationFrame(() => {
				const newArr = [];
				for (let i = 0; i < newDataRef.length; i++) {
					const current = newDataRef[i];
					if (current.x < pos) {
						newArr.push(current);
					} else {
						if (current.r <= 0) {
							current.r = 0;
							continue;
						}
						current.x += Math.random() > 0.5 ? 1 : -1;
						current.y += Math.random() > 0.5 ? 1 : -1;
						current.r -= 0.05 * Math.random();
						newArr.push(current);
					}
				}
				newDataRef = newArr;
				const ctx = canvasRef?.getContext('2d');
				if (ctx) {
					ctx.clearRect(pos, 0, 800, 800);
					newDataRef.forEach((t) => {
						const { x: n, y: i, r: s, color } = t;
						if (n > pos) {
							ctx.beginPath();
							ctx.rect(n, i, s, s);
							ctx.fillStyle = color;
							ctx.strokeStyle = color;
							ctx.stroke();
						}
					});
				}
				if (newDataRef.length > 0) {
					animateFrame(pos - 8);
				} else {
					value = '';
					animating = false;
				}
			});
		};
		animateFrame(start);
	};

	const vanishAndSubmit = () => {
		animating = true;
		draw();
		const inputValue = inputRef?.value || '';
		console.log(inputValue, 'Input Value');
		if (inputValue) {
			const maxX = newDataRef.reduce((prev, current) => (current.x > prev ? current.x : prev), 0);
			console.log(maxX, 'Max X');
			animate(maxX);
		}
	};

	const handleKeyDown = (e) => {
		if (e.key === 'Enter' && !animating) {
			vanishAndSubmit();
		}
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		vanishAndSubmit();
		onSubmit();
	};
</script>

<!-- on:submit={handleSubmit} -->
<form
	class="relative mx-auto h-12 w-full max-w-xl overflow-hidden rounded-full bg-white shadow transition duration-200 dark:bg-zinc-800 {value
		? 'bg-gray-50'
		: ''}"
	on:submit={handleSubmit}
>
	<canvas
		class="pointer-events-none absolute top-[20%] left-2 origin-top-left scale-50 transform pr-20 text-base invert filter sm:left-8 dark:invert-0"
		bind:this={canvasRef}
	></canvas>

	<input
		bind:this={inputRef}
		bind:value
		on:keydown={handleKeyDown}
		type="text"
		class="z-50 h-full w-full rounded-full border-none bg-transparent pr-20 pl-4 text-sm focus:ring-0 focus:outline-none sm:pl-10 sm:text-base {animating
			? 'text-transparent dark:text-transparent'
			: 'text-black dark:text-white'}"
	/>

	<Button
		disabled={!value}
		type="submit"
		aria-label="Submit"
		size="icon"
		class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 rounded-full"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="h-4 w-4 text-gray-300"
		>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M5 12l14 0" />
			<path d="M13 18l6 -6" />
			<path d="M13 6l6 6" />
		</svg>
	</Button>

	<div class="pointer-events-none absolute inset-0 flex items-center rounded-full">
		{#if !value}
			{#key currentPlaceholder}
				<p
					class="w-[calc(100%-2rem)] truncate pl-4 text-left text-sm font-normal text-neutral-500 sm:pl-12 sm:text-base dark:text-zinc-500"
					in:fly={{ y: 10, delay: 400 }}
					out:fly={{ y: -10 }}
				>
					{placeholders[currentPlaceholder]}
				</p>
			{/key}
		{/if}
	</div>
</form>

<style>
	form {
		max-width: 100%;
	}
</style>
