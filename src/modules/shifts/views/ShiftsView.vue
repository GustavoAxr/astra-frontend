<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAsync } from '@/shared/composables/useAsync'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import ConfirmDialog from '@/shared/ui/ConfirmDialog.vue'
import DeleteResourceDialog from '@/shared/ui/DeleteResourceDialog.vue'
import { summarizeShift } from '@/modules/employees/shift-summary'
import type { ShiftPolicy } from '@/modules/employees/types'
import { useAuthStore } from '@/modules/auth/store'
import { useLegalEntityFilter } from '@/modules/org/store'
import { orgApi } from '@/modules/org/api'
import { buildCycle, formatMinutes } from '../cycle'
import { shiftsApi } from '../api'
import ShiftFormModal from '../components/ShiftFormModal.vue'

const auth = useAuthStore()
const { selectedId } = storeToRefs(useLegalEntityFilter())
const showInactive = ref(false)

// Oculta lo que no aplica; NO protege. El permiso lo aplican el servidor y RLS.
const canWrite = computed(() => auth.can('assignEmployee'))
const canDelete = computed(() => auth.can('deleteEmployee'))

const shifts = useAsync((signal) =>
  shiftsApi.list(selectedId.value ?? undefined, showInactive.value, signal),
)

const entities = useAsync((signal) => orgApi.legalEntities(true, signal))
void entities.run()

const entityName = (id: string): string =>
  (entities.data.value ?? []).find((e) => e.id === id)?.businessName ?? '—'

/**
 * Por razón social y luego por código. El servidor ordena solo por código, así
 * que los de tres empresas salían intercalados y no había forma de saber de
 * quién era cada turno — que es justo lo que faltaba en esta pantalla.
 */
const rows = computed(() =>
  [...(shifts.data.value ?? [])].sort(
    (a, b) =>
      entityName(a.legalEntityId).localeCompare(entityName(b.legalEntityId), 'es') ||
      a.code.localeCompare(b.code, 'es'),
  ),
)

/** `null` = alta; con turno = edición. */
const editing = ref<ShiftPolicy | null>(null)
const formOpen = ref(false)
const toggling = ref<ShiftPolicy | null>(null)
const deleting = ref<ShiftPolicy | null>(null)

function nuevo(): void {
  editing.value = null
  formOpen.value = true
}
function editar(policy: ShiftPolicy): void {
  editing.value = policy
  formOpen.value = true
}

watch([selectedId, showInactive], () => void shifts.run(), { immediate: true })

/**
 * Cómo se traduce `cycleType` a algo que alguien pueda leer. Un código que no
 * conozco se pinta tal cual: inventarle nombre sería peor que enseñarlo crudo.
 */
const CICLO: Record<string, string> = {
  WEEKLY: 'Semanal',
  ROTATING: 'Rotativo',
  FIXED: 'Fijo',
  CONTINUOUS: 'Continuo',
}

const JORNADA: Record<string, string> = {
  DAY: 'Diurna',
  NIGHT: 'Nocturna',
  MIXED: 'Mixta',
  FLEXIBLE: 'Flexible',
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      title="Turnos"
      description="Los horarios contra los que se mide la asistencia. Sin turno no hay hora de entrada, y sin hora de entrada no hay retardo."
      :count="shifts.loaded.value ? `${rows.length}` : undefined"
    >
      <template #actions>
        <USwitch v-model="showInactive" label="Ver inactivos" />
        <UButton v-if="canWrite" icon="i-lucide-plus" label="Nuevo turno" @click="nuevo" />
      </template>
    </PageHeader>

    <ApiErrorAlert :error="shifts.error.value" />

    <div v-if="shifts.pending.value && !shifts.loaded.value" class="text-muted text-sm">
      Cargando…
    </div>

    <EmptyState
      v-else-if="rows.length === 0"
      icon="i-lucide-calendar-clock"
      title="No hay turnos"
      description="Los turnos se siembran con el catálogo de la razón social. Sin ninguno, no se puede adscribir a nadie."
    />

    <article
      v-for="policy in rows"
      v-else
      :key="policy.id"
      class="border-default bg-elevated/20 overflow-hidden rounded-xl border"
      :class="policy.isActive ? '' : 'opacity-70'"
    >
      <header class="border-default flex flex-wrap items-center gap-3 border-b px-5 py-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-dimmed font-mono text-xs">{{ policy.code }}</span>
            <h2 class="text-highlighted truncate font-medium">{{ policy.name }}</h2>
            <UBadge v-if="!policy.isActive" label="Inactivo" color="neutral" size="sm" />
          </div>
          <!--
            De quién es el turno. Un turno pertenece a UNA razón social y no se
            puede asignar fuera de ella, así que sin este dato dos turnos con
            código parecido son indistinguibles.
          -->
          <p class="text-dimmed mt-0.5 truncate text-xs">
            {{ entityName(policy.legalEntityId) }}
          </p>
          <p class="text-muted mt-0.5 text-sm">
            {{ summarizeShift(policy).schedule }}
          </p>
        </div>

        <div v-if="canWrite" class="ml-auto flex gap-1">
          <UButton icon="i-lucide-pencil" label="Editar" size="xs" @click="editar(policy)" />
          <UButton
            :icon="policy.isActive ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :label="policy.isActive ? 'Desactivar' : 'Reactivar'"
            size="xs"
            @click="toggling = policy"
          />
          <UButton
            v-if="canDelete"
            icon="i-lucide-trash-2"
            square
            size="xs"
            aria-label="Borrar turno"
            @click="deleting = policy"
          />
        </div>

        <dl class="text-dimmed grid w-full grid-cols-2 gap-x-4 text-xs sm:grid-cols-4">
          <dt>Ciclo</dt>
          <dd class="text-muted">
            {{ CICLO[policy.cycleType] ?? policy.cycleType }} · {{ policy.cycleLengthDays }} días
          </dd>
          <dt>Jornada</dt>
          <dd class="text-muted">{{ JORNADA[policy.journeyType] ?? policy.journeyType }}</dd>
          <dt>Redondeo</dt>
          <dd class="text-muted">{{ policy.roundingMinutes }} min</dd>
          <dt>Extra mínima</dt>
          <dd class="text-muted">
            {{ policy.minOvertimeMinutes }} min
            <template v-if="policy.overtimeRequiresApproval"> · requiere aprobación</template>
          </dd>
        </dl>
      </header>

      <!--
        El ciclo se pinta día a día y NO por días de la semana: un 4x3 dura 7
        días pero un 14x14 dura 28, y llamarles «lunes» sería mentir.
      -->
      <div class="grid gap-2 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <div
          v-for="day in buildCycle(policy)"
          :key="day.day"
          class="border-default rounded-lg border p-3"
          :class="day.rest ? 'bg-elevated/30' : 'bg-default'"
        >
          <p class="text-dimmed text-xs font-medium tracking-wide uppercase">Día {{ day.day }}</p>

          <p v-if="day.rest" class="text-muted mt-2 text-sm">Descanso</p>

          <template v-else>
            <div v-for="(block, i) in day.blocks" :key="i" class="mt-2">
              <p class="text-highlighted font-mono text-sm">
                {{ block.range }}
                <!-- Que termine al día siguiente cambia a qué jornada se imputa. -->
                <span v-if="block.crossesMidnight" class="text-warning text-xs">+1</span>
              </p>
              <p class="text-dimmed text-xs">
                {{ block.label }}
                <template v-if="block.breakMinutes > 0">
                  · {{ block.breakMinutes }} min de descanso
                </template>
              </p>
            </div>

            <p class="text-muted mt-2 text-xs">
              {{ formatMinutes(day.totalMinutes) }}
              <template v-if="day.blocks[0]">
                · retardo tras {{ day.blocks[0].graceIn }} min
              </template>
            </p>
          </template>
        </div>
      </div>
    </article>

    <ShiftFormModal
      v-model:open="formOpen"
      :policy="editing"
      :legal-entity-id="selectedId"
      @saved="shifts.run()"
    />

    <!--
      Desactivar NO es borrar: el turno deja de ofrecerse en adscripciones
      nuevas y todo lo ya calculado con él sigue en pie.
    -->
    <ConfirmDialog
      v-if="toggling"
      :open="true"
      :title="toggling.isActive ? 'Desactivar turno' : 'Reactivar turno'"
      :message="`${toggling.code} · ${toggling.name}`"
      :warning="
        toggling.isActive
          ? 'Deja de ofrecerse en adscripciones nuevas. Quien ya lo tiene puesto sigue con él, y lo calculado no cambia.'
          : undefined
      "
      :confirm-label="toggling.isActive ? 'Desactivar' : 'Reactivar'"
      :confirm-color="toggling.isActive ? 'warning' : 'primary'"
      :action="async () => void (await shiftsApi.setActive(toggling!.id, !toggling!.isActive))"
      @update:open="
        (value: boolean) => {
          if (!value) toggling = null
        }
      "
      @confirmed="shifts.run()"
    />

    <DeleteResourceDialog
      v-if="deleting"
      :open="true"
      title="Borrar turno"
      resource-kind="turno"
      :resource-name="`${deleting.code} · ${deleting.name}`"
      :load-dependencies="() => shiftsApi.dependencies(deleting!.id)"
      :remove="() => shiftsApi.remove(deleting!.id)"
      @update:open="
        (value: boolean) => {
          if (!value) deleting = null
        }
      "
      @deleted="shifts.run()"
    />
  </div>
</template>
