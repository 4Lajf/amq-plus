<script>
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';

	let {
		checked = $bindable(false),
		onCheckedChange = (v) => (checked = v),
		indeterminate = false,
		...restProps
	} = $props();
</script>

<Checkbox bind:checked={() => checked, onCheckedChange} {indeterminate} {...restProps} />

