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
import HolidayCopyModal from '../components/HolidayCopyModal.vue'
import HolidayObservanceModal from '../components/HolidayObservanceModal.vue'
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

/**
 * EN QUÉ DÍA SE TOMA ESE FESTIVO, con el filtro de arriba puesto.
 *
 * Con «Todas las empresas» NO HAY UNA RESPUESTA: dos razones sociales del grupo
 * pueden tomar el mismo día de ley en fechas distintas, y enseñar la de una como
 * si fuera la de todas sería mentir en la columna que más se mira. Por eso
 * devuelve `null` y el renglón se queda con la fecha de ley.
 */
function tomadoEl(h: Holiday): string | null {
  if (selectedId.value === null) return null
  return h.observances.find((o) => o.legalEntityId === selectedId.value)?.observedDate ?? null
}

/** La fecha contra la que se mide de verdad. Sin observancia, la de ley. */
const diaEfectivo = (h: Holiday): string => tomadoEl(h) ?? h.holidayDate

/** Movido de sitio. Ponerlo en la misma fecha de ley no es moverlo. */
const movido = (h: Holiday): boolean => {
  const dia = tomadoEl(h)
  return dia !== null && dia !== h.holidayDate
}

/** Cómo quedó la prima de quien trabaje la fecha de ley. */
const primaEnLaLey = (h: Holiday): boolean =>
  h.observances.find((o) => o.legalEntityId === selectedId.value)?.premiumOnLegalDate ?? true

/*
 * Se ordena por el día en que SE TOMA y no por el de ley: esta pantalla es un
 * calendario, y un festivo movido a marzo tiene que aparecer en marzo.
 */
const rows = computed(() =>
  [...(list.data.value ?? [])].sort((a, b) => diaEfectivo(a).localeCompare(diaEfectivo(b))),
)

/**
 * Dos años atrás y tres adelante.
 *
 * ATRÁS, porque la asistencia de un año que ya pasó se sigue consultando y un
 * festivo mal capturado la sigue midiendo mal. ADELANTE, porque el calendario
 * del año que viene se prepara en octubre: con un solo año por delante no había
 * dónde dejarlo hasta enero.
 */
const years = computed(() => {
  const actual = new Date().getFullYear()
  return Array.from({ length: 6 }, (_, i) => actual - 2 + i).map((y) => ({
    label: String(y),
    value: y,
  }))
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
const copiando = ref(false)
/** El festivo de ley al que se le está cambiando el día en que se toma. */
const moviendo = ref<Holiday | null>(null)

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
          icon="i-lucide-copy"
          label="Copiar días festivos"
          @click="copiando = true"
        />
        <UButton v-if="puedeEditar" icon="i-lucide-plus" label="Nuevo festivo" @click="nuevo" />
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
    >
      <UButton
        v-if="puedeEditar"
        icon="i-lucide-copy"
        :label="`Traer los de ${year - 1}`"
        @click="copiando = true"
      />
    </EmptyState>

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
      <!--
        Manda el día en que SE TOMA, y la fecha de ley va debajo. Al revés se
        leería mal: quien abre esta pantalla quiere saber qué día no se trabaja,
        no qué dice el Diario Oficial.
      -->
      <template #holidayDate-cell="{ row }">
        <span class="capitalize">{{ cuando(diaEfectivo(row.original)) }}</span>
        <p v-if="movido(row.original)" class="text-dimmed text-xs">
          De ley: <span class="capitalize">{{ cuando(row.original.holidayDate) }}</span> ·
          {{
            primaEnLaLey(row.original) ? 'la prima se queda ahí' : 'la prima se movió con el día'
          }}
        </p>
        <p v-else-if="row.original.observances.length" class="text-dimmed text-xs">
          {{ row.original.observances.length }}
          {{ row.original.observances.length === 1 ? 'empresa lo toma' : 'empresas lo toman' }}
          en otra fecha
        </p>
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
        Los de LEY siguen sin lápiz ni bote: no son de esta empresa y editarlos
        se lo cambiaría a todos los inquilinos de la nube. Lo que sí tienen ahora
        es lo único que una empresa puede hacer con un día de ley: decir qué día
        lo toma ella. Eso no edita el festivo, crea una fila suya.
      -->
      <template #acciones-cell="{ row }">
        <div v-if="puedeEditar && !row.original.legalEntityId" class="flex justify-end gap-1">
          <UButton
            icon="i-lucide-calendar-cog"
            :label="movido(row.original) ? 'Cambiar el día' : 'Mover el día'"
            size="sm"
            @click="moviendo = row.original"
          />
        </div>
        <div v-else-if="puedeEditar && row.original.legalEntityId" class="flex justify-end gap-1">
          <UButton icon="i-lucide-pencil" label="Editar" size="sm" @click="editar(row.original)" />
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

    <HolidayObservanceModal
      v-if="moviendo"
      :open="true"
      :holiday="moviendo"
      :legal-entity-id="selectedId"
      @update:open="
        (value: boolean) => {
          if (!value) moviendo = null
        }
      "
      @saved="list.run()"
    />

    <HolidayCopyModal
      v-model:open="copiando"
      :destino="year"
      :legal-entity-id="selectedId"
      @saved="list.run()"
    />

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
