<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAsync } from '@/shared/composables/useAsync'
import { useLegalEntityFilter } from '@/modules/org/store'
import { mergeQuery, type QueryChanges } from '@/shared/router/query'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import ConfirmDialog from '@/shared/ui/ConfirmDialog.vue'
import { useAviso } from '@/shared/ui/aviso'
import { useAuthStore } from '@/modules/auth/store'
import { employeesApi } from '../api'
import type { Holiday } from '../types'
import HolidayFormModal from '../components/HolidayFormModal.vue'

const auth = useAuthStore()
const aviso = useAviso()

// Oculta lo que no aplica; NO protege. El permiso lo aplican el servidor y RLS.
const puedeEditar = computed(() => auth.can('manageHoliday'))

const route = useRoute()
const router = useRouter()

const year = computed(() => {
  const raw = Number(route.query.year)
  return Number.isInteger(raw) && raw > 2000 ? raw : new Date().getFullYear()
})

/**
 * La razón social elegida arriba acota el calendario, PERO LOS GLOBALES SIEMPRE
 * SALEN: un festivo de ley aplica a todas las empresas, y esconder el 16 de
 * septiembre por estar filtrando por una convertiría el filtro en una trampa.
 * La regla la aplica el servidor; aquí solo se manda el id.
 */
const { selectedId } = storeToRefs(useLegalEntityFilter())

const list = useAsync((signal) =>
  employeesApi.holidays(year.value, selectedId.value ?? undefined, signal),
)

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

/** `null` = alta; con festivo = corrección. */
const editando = ref<Holiday | null>(null)
const formOpen = ref(false)
const borrando = ref<Holiday | null>(null)

function nuevo(): void {
  editando.value = null
  formOpen.value = true
}
function editar(h: Holiday): void {
  editando.value = h
  formOpen.value = true
}

function apply(changes: QueryChanges): void {
  void router.replace({ query: mergeQuery(route.query, changes) })
}

watch([year, selectedId], () => void list.run(), { immediate: true })
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
        <UButton
          v-if="puedeEditar"
          icon="i-lucide-plus"
          label="Nuevo festivo"
          @click="nuevo"
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
      description="Sin festivos, esos días se miden como cualquier otro y trabajarlos no se paga distinto."
    />

    <UTable
      v-else
      :data="rows"
      :columns="[
        { accessorKey: 'holidayDate', header: 'Día' },
        { accessorKey: 'name', header: 'Motivo' },
        { id: 'alcance', header: 'Alcance' },
        { id: 'descanso', header: 'Descanso obligatorio' },
        { id: 'acciones', header: '' },
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

      <!--
        Los de LEY no llevan botones, y no es que estén deshabilitados: no son
        de esta empresa. Enseñar un lápiz que siempre va a contestar que no se
        puede sería prometer algo que no existe.
      -->
      <template #acciones-cell="{ row }">
        <div v-if="puedeEditar && row.original.legalEntityId" class="flex justify-end gap-1">
          <UButton
            icon="i-lucide-pencil"
            label="Editar"
            size="sm"
            @click="editar(row.original)"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            size="sm"
            square
            aria-label="Quitar este día festivo"
            @click="borrando = row.original"
          />
        </div>
      </template>
    </UTable>

    <HolidayFormModal
      v-model:open="formOpen"
      :holiday="editando"
      :legal-entity-id="selectedId"
      :año="year"
      @saved="list.run()"
    />

    <ConfirmDialog
      v-if="borrando"
      :open="true"
      title="Quitar este día festivo"
      :message="`${borrando.name}, del ${borrando.holidayDate}.`"
      warning="Ese día vuelve a medirse como cualquier otro: quien no se presente contará falta, y quien trabaje no cobrará prima."
      confirm-label="Quitar"
      confirm-icon="i-lucide-trash-2"
      confirm-color="error"
      :action="
        async () => {
          const que = borrando!.name
          await employeesApi.borrarFestivo(borrando!.id)
          aviso.borrado('Día festivo', que)
        }
      "
      @update:open="
        (value: boolean) => {
          if (!value) borrando = null
        }
      "
      @confirmed="list.run()"
    />
  </div>
</template>
