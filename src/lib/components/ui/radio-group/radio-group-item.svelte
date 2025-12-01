<script>
	import { RadioGroup as RadioGroupPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let { ref = $bindable(null), class: className, ...restProps } = $props();
</script>

<RadioGroupPrimitive.Item
	bind:ref
	data-slot="radio-group-item"
	class={cn(
		'border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive text-primary aspect-square h-4 w-4 rounded-full border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...restProps}
>
	<RadioGroupPrimitive.ItemIndicator
		data-slot="radio-group-item-indicator"
		class="flex items-center justify-center"
	>
		<div class="h-2.5 w-2.5 rounded-full bg-current"></div>
	</RadioGroupPrimitive.ItemIndicator>
</RadioGroupPrimitive.Item>
