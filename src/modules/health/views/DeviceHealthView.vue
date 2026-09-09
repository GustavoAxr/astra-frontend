<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAsync } from '@/shared/composables/useAsync'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { useAuthStore } from '@/modules/auth/store'
import { healthApi } from '../api'
import PasarListaModal from '../components/PasarListaModal.vue'
import { DIAGNOSTICO } from '../types'
import type { DeviceSyncState } from '../types'

/**
 * El diagnóstico de una fila. Va por una función porque las filas de `UTable`
 * llegan sin tipo, y sin esto un diagnóstico que el servidor añadiera mañana
 * reventaría en pantalla en vez de en el compilador.
 */
const diag = (estado: string) =>
  DIAGNOSTICO[estado as DeviceSyncState['diagnostico']] ?? DIAGNOSTICO.SIN_ESTRENAR

const auth = useAuthStore()

/**
 * Quién puede pasar lista. Los mismos que en el servidor —el supervisor de la
 * nave incluido, porque es quien está ahí el día que el reloj muere—.
 */
const puedePasarLista = computed(() =>
  auth.roles.some((r) => ['SUPERVISOR', 'RRHH', 'ADMIN_EMPRESA', 'SOPORTE'].includes(r)),
)

/** La base sobre la que se está pasando lista, si hay alguna. */
const pasandoLista = ref<{ id: string; nombre: string } | null>(null)

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
        { id: 'diagnostico', header: 'Qué pasa' },
        { id: 'watermark', header: 'Marca de agua' },
        { accessorKey: 'lastSuccessAt', header: 'Última lectura buena' },
        { accessorKey: 'consecutiveFailures', header: 'Fallos' },
        { id: 'totals', header: 'Checadas' },
        { id: 'acciones', header: '' },
      ]"
      :loading="state.pending.value"
      empty="Todavía no hay lecturas registradas. Aparecerán cuando un agente empiece a leer relojes."
    >
      <template #serialNumber-cell="{ row }">
        <span class="font-mono text-xs">{{ row.original.serialNumber }}</span>
      </template>

      <!--
        La primera pregunta cuando dejan de llegar checadas es «¿qué se rompió?»,
        y hasta ahora la pantalla solo sabía decir «no llegan». Un reloj mudo con
        el agente vivo es una avería del aparato y las horas de ese rato NO
        existen en ninguna parte; un agente mudo es el enlace, y esas checadas
        están guardadas y van a llegar solas. Se atienden de forma opuesta.
      -->
      <!--
        PASAR LISTA SOLO APARECE CON EL RELOJ MUDO.
        Con el enlace caído las checadas están en la cola del agente y van a
        llegar solas: registrarlas a mano ahí duplicaría a todo el mundo. Y con
        todo al día no hay nada que suplir. Ofrecerlo siempre invitaría a usarlo
        el día que no toca.
      -->
      <template #acciones-cell="{ row }">
        <UButton
          v-if="
            puedePasarLista &&
            row.original.diagnostico === 'RELOJ_MUDO' &&
            row.original.installationId
          "
          label="Pasar lista"
          icon="i-lucide-clipboard-list"
          size="xs"
          @click="
            pasandoLista = {
              id: row.original.installationId,
              nombre: row.original.installationName ?? 'esta base',
            }
          "
        />
      </template>

      <template #diagnostico-cell="{ row }">
        <UBadge
          :label="diag(row.original.diagnostico).label"
          :color="diag(row.original.diagnostico).color"
        />
        <p class="text-dimmed mt-1 max-w-sm text-xs">
          {{ diag(row.original.diagnostico).accion }}
        </p>
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

    <PasarListaModal
      v-if="pasandoLista"
      :installation-id="pasandoLista.id"
      :installation-name="pasandoLista.nombre"
      @close="pasandoLista = null"
    />
  </section>
</template>
