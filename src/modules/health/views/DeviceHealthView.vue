<script setup lang="ts">
import { computed } from 'vue'
import { useAsync } from '@/shared/composables/useAsync'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { healthApi } from '../api'

const state = useAsync((signal) => healthApi.syncState(signal))
void state.run()

const rows = computed(() => state.data.value ?? [])

const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const when = (iso: string | null): string => (iso ? formatter.format(new Date(iso)) : '—')

/** Un fallo es ruido; varios seguidos es que alguien tiene que ir a mirar. */
function failureLook(failures: number): { color: 'success' | 'warning' | 'error'; label: string } {
  if (failures === 0) return { color: 'success', label: 'Sin fallos' }
  if (failures < 5) return { color: 'warning', label: `${failures} seguidos` }
  return { color: 'error', label: `${failures} seguidos` }
}
</script>

<template>
  <section class="space-y-4">
    <PageHeader
      title="Salud de relojes"
      description="Hasta dónde se leyó cada equipo. Una marca de agua que deja de avanzar es un reloj que sigue encendido pero ya no entrega checadas."
      :count="state.loaded.value ? `${rows.length}` : undefined"
    />

    <ApiErrorAlert :error="state.error.value" />

    <UTable
      :data="rows"
      :columns="[
        { accessorKey: 'serialNumber', header: 'Reloj' },
        { id: 'watermark', header: 'Marca de agua' },
        { accessorKey: 'lastSuccessAt', header: 'Última lectura buena' },
        { accessorKey: 'consecutiveFailures', header: 'Fallos' },
        { id: 'totals', header: 'Checadas' },
      ]"
      :loading="state.pending.value"
      empty="Todavía no hay lecturas registradas. Aparecerán cuando un agente empiece a leer relojes."
    >
      <template #serialNumber-cell="{ row }">
        <span class="font-mono text-xs">{{ row.original.serialNumber }}</span>
      </template>

      <template #watermark-cell="{ row }">
        <span v-if="row.original.watermarkLabel">{{ row.original.watermarkLabel }}</span>
        <span v-else-if="row.original.watermark" class="font-mono text-xs">
          {{ row.original.watermark }}
        </span>
        <span v-else class="text-dimmed">Sin marca</span>
      </template>

      <template #lastSuccessAt-cell="{ row }">
        {{ when(row.original.lastSuccessAt) }}
      </template>

      <template #consecutiveFailures-cell="{ row }">
        <UBadge
          :label="failureLook(row.original.consecutiveFailures).label"
          :color="failureLook(row.original.consecutiveFailures).color"
        />
        <p v-if="row.original.lastError" class="text-dimmed mt-1 max-w-xs truncate text-xs">
          {{ row.original.lastError }}
        </p>
      </template>

      <template #totals-cell="{ row }">
        <span>{{ row.original.totalPunches }}</span>
        <span class="text-dimmed text-xs">
          · {{ row.original.totalDuplicates }} repetidas · {{ row.original.totalUnmatched }} sin
          dueño
        </span>
      </template>
    </UTable>
  </section>
</template>
