<script>
	import { Select as SelectPrimitive } from 'bits-ui';

	let {
		value = $bindable(),
		open = $bindable(false),
		children,
		...restProps
	} = $props();
</script>

<SelectPrimitive.Root bind:value bind:open {...restProps}>
	{@render children?.()}
</SelectPrimitive.Root>
