// See badge.d.svelte.ts - bare `tsc` cannot see `<script module>` exports through
// Svelte's `*.svelte` wildcard ambient module, so this sidecar declares them.
import type { Component } from 'svelte';

export declare const buttonVariants: (props?: Record<string, any>) => string;

declare const Button: Component<Record<string, any>>;
export default Button;
