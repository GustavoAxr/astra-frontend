<script setup lang="ts">
defineProps<{ icon: string; title: string; description?: string }>()
</script>

<template>
  <div
    class="border-default flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center"
  >
    <UIcon :name="icon" class="text-dimmed size-8" />
    <p class="text-highlighted mt-3 font-medium">{{ title }}</p>
    <p v-if="description" class="text-muted mt-1 max-w-md text-sm">{{ description }}</p>
    <div class="mt-4"><slot /></div>
  </div>
</template>
