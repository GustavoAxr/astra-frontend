<script setup lang="ts">
import { useRoute } from 'vue-router'

/**
 * Andamio. Cada rebanada de trabajo reemplaza uno de estos por la pantalla de
 * verdad. Si al terminar queda alguno, es que falta una rebanada.
 */
const route = useRoute()
</script>

<template>
  <div class="py-16 text-center">
    <UIcon name="i-lucide-hammer" class="size-8 text-dimmed" />
    <p class="mt-3 font-medium">{{ route.meta.title ?? 'Pendiente' }}</p>
    <p class="text-muted text-sm">Esta pantalla todavía no está construida.</p>
  </div>
</template>
