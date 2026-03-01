import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite'; // Import the Tailwind Vite plugin

export default defineConfig({
	plugins: [
		tailwindcss(), // Tailwind CSS Vite plugin (ideally first)
		sveltekit()
	]
});
