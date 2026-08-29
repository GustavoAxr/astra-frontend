<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAsync } from '@/shared/composables/useAsync'
import { mergeQuery, type QueryChanges } from '@/shared/router/query'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { employeesApi } from '../api'

const route = useRoute()
const router = useRouter()

const year = computed(() => {
  const raw = Number(route.query.year)
  return Number.isInteger(raw) && raw > 2000 ? raw : new Date().getFullYear()
})

const list = useAsync((signal) => employeesApi.holidays(year.value, signal))

const rows = computed(() =>
  [...(list.data.value ?? [])].sort((a, b) => a.holidayDate.localeCompare(b.holidayDate)),
)

/** Del año en curso hacia atrás y hacia delante: nadie captura a diez años vista. */
const years = computed(() => {
  const actual = new Date().getFullYear()
  return [actual - 1, actual, actual + 1].map((y) => ({ label: String(y), value: y }))
})

const fecha = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const cuando = (iso: string): string => {
  // `iso` es una fecha suelta (`2026-01-01`). Construirla con `new Date(iso)`
  // la interpreta como UTC y en México retrocede un día: el 1 de enero se
  // pintaría como 31 de diciembre.
  const [y, m, d] = iso.split('-').map(Number)
  return fecha.format(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1))
}

const obligatorios = computed(() => rows.value.filter((h) => h.isMandatoryRest).length)

function apply(changes: QueryChanges): void {
  void router.replace({ query: mergeQuery(route.query, changes) })
}

watch(year, () => void list.run(), { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <PageHeader
      title="Días festivos"
      description="El calendario contra el que se mide la asistencia. Trabajar un descanso obligatorio se paga distinto."
      :count="list.loaded.value ? `${rows.length}` : undefined"
    >
      <template #actions>
        <USelectMenu
          :model-value="year"
          :items="years"
          value-key="value"
          class="w-32"
          @update:model-value="(v: number) => apply({ year: String(v) })"
        />
      </template>
    </PageHeader>

    <ApiErrorAlert :error="list.error.value" />

    <p v-if="list.loaded.value && rows.length" class="text-muted text-sm">
      {{ obligatorios }} de {{ rows.length }} son de descanso obligatorio.
    </p>

    <EmptyState
      v-if="list.loaded.value && !rows.length"
      icon="i-lucide-party-popper"
      title="No hay festivos cargados para este año"
      description="El calendario lo siembra el backend. Todavía no hay una pantalla para capturarlos a mano."
    />

    <UTable
      v-else
      :data="rows"
      :columns="[
        { accessorKey: 'holidayDate', header: 'Día' },
        { accessorKey: 'name', header: 'Motivo' },
        { id: 'alcance', header: 'Alcance' },
        { id: 'descanso', header: 'Descanso obligatorio' },
      ]"
      :loading="list.pending.value"
      :class="list.loaded.value && list.pending.value ? 'opacity-60 transition-opacity' : ''"
      empty="No hay festivos en este año."
    >
      <template #holidayDate-cell="{ row }">
        <span class="capitalize">{{ cuando(row.original.holidayDate) }}</span>
      </template>

      <!--
        Un festivo sin razón social es del calendario del país; con ella, lo puso
        una empresa. Decir cuál es cuál evita que alguien intente borrar un
        festivo nacional desde la ficha de su empresa.
      -->
      <template #alcance-cell="{ row }">
        <span v-if="row.original.legalEntityId" class="text-sm">De una razón social</span>
        <span v-else class="text-dimmed text-sm"> Nacional · {{ row.original.countryCode }} </span>
      </template>

      <template #descanso-cell="{ row }">
        <UBadge v-if="row.original.isMandatoryRest" label="Obligatorio" color="warning" />
        <span v-else class="text-dimmed text-sm">No</span>
      </template>
    </UTable>
  </div>
</template>
