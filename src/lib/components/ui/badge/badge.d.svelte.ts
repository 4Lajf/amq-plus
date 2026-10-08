// Bare `tsc` resolves `*.svelte` through Svelte's wildcard ambient module, which
// only carries a default export - so the `<script module>` exports below are
// invisible to it. `allowArbitraryExtensions` picks this sidecar up instead.
// svelte-check still type-checks the component itself from the .svelte source.
import type { Component } from 'svelte';

export declare const badgeVariants: (props?: Record<string, any>) => string;

declare const Badge: Component<Record<string, any>>;
export default Badge;
