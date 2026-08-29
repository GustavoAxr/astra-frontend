<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  /** Cifra que acompaña al título, cuando la hay. */
  count?: string
}>()
</script>

<template>
  <header class="border-default flex flex-wrap items-start gap-4 border-b pb-4">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <h1 class="text-highlighted truncate text-xl font-semibold tracking-tight">{{ title }}</h1>
        <UBadge v-if="count" :label="count" color="neutral" size="sm" />
      </div>
      <p v-if="description" class="text-muted mt-1 max-w-2xl text-sm">{{ description }}</p>
    </div>

    <div class="ml-auto flex shrink-0 flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
