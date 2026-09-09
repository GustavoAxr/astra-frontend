<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAsync } from '@/shared/composables/useAsync'
import { useLegalEntityFilter } from '@/modules/org/store'
import { mergeQuery, type QueryChanges } from '@/shared/router/query'
import { todayLocal } from '@/shared/date'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import ConfirmDialog from '@/shared/ui/ConfirmDialog.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { useAuthStore } from '@/modules/auth/store'
import { employeesApi } from '../api'
import type { EmployeeException } from '../types'

const aviso = useAviso()

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const canWrite = computed(() => auth.can('assignEmployee'))

const q = (key: string): string | undefined =>
  typeof route.query[key] === 'string' && route.query[key] !== ''
    ? (route.query[key] as string)
    : undefined

const from = computed(() => q('from'))
const to = computed(() => q('to'))

/** La razón social de la barra superior. Filtro de comodidad, no alcance. */
const { selectedId } = storeToRefs(useLegalEntityFilter())

const list = useAsync((signal) =>
  employeesApi.exceptions(
    { from: from.value, to: to.value, legalEntityId: selectedId.value ?? undefined },
    signal,
  ),
)
const types = useAsync((signal) => employeesApi.exceptionTypes(signal))
// Hasta cien: son cuarenta personas, no dos mil. Si algún día crece, se cambia
// por un buscador contra el servidor.
const staff = useAsync((signal) => employeesApi.list({ limit: 100 }, signal))

const rows = computed(() =>
  [...(list.data.value ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)),
)

const typeItems = computed(() =>
  (types.data.value ?? []).map((t) => ({ label: t.name, value: t.id })),
)
const staffItems = computed(() =>
  (staff.data.value?.data ?? []).map((e) => ({
    label: `${e.employeeCode} · ${e.firstName} ${e.lastName}`,
    value: e.id,
  })),
)

const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })
const cuando = (iso: string): string => {
  // Fecha suelta: `new Date('2026-01-01')` es UTC y en México retrocede un día.
  const [y, m, d] = iso.split('-').map(Number)
  return fecha.format(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1))
}

/** «3 días» o «del 20 al 27». Un permiso de horas se dice con sus horas. */
function periodo(x: EmployeeException): string {
  if (x.startTime && x.endTime) return `${x.startTime} a ${x.endTime}`
  if (x.startDate === x.endDate) return 'un día'
  const dias =
    Math.round(
      (Date.parse(`${x.endDate}T00:00:00`) - Date.parse(`${x.startDate}T00:00:00`)) / 86_400_000,
    ) + 1
  return `${dias} días`
}

// ── Alta ──────────────────────────────────────────────────────────────────
const creating = ref(false)
const employeeId = ref('')
const exceptionTypeId = ref('')
const startDate = ref(todayLocal())
const endDate = ref(todayLocal())
const documentRef = ref('')
const submitting = ref(false)
const formError = ref<Error | null>(null)

const tipoElegido = computed(
  () => (types.data.value ?? []).find((t) => t.id === exceptionTypeId.value) ?? null,
)
const valid = computed(
  () => employeeId.value !== '' && exceptionTypeId.value !== '' && startDate.value <= endDate.value,
)

watch(creating, (abierto) => {
  if (abierto) return
  employeeId.value = ''
  exceptionTypeId.value = ''
  startDate.value = todayLocal()
  endDate.value = todayLocal()
  documentRef.value = ''
  formError.value = null
})

async function submit(): Promise<void> {
  if (!valid.value || submitting.value) return
  submitting.value = true
  formError.value = null
  try {
    await employeesApi.addException({
      employeeId: employeeId.value,
      exceptionTypeId: exceptionTypeId.value,
      startDate: startDate.value,
      endDate: endDate.value,
      ...(documentRef.value.trim() ? { documentRef: documentRef.value.trim() } : {}),
    })
    creating.value = false
    aviso.creado('Justificación', `Del ${startDate.value} al ${endDate.value}`)
    await list.run()
  } catch (cause) {
    formError.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    submitting.value = false
  }
}

// ── Baja ──────────────────────────────────────────────────────────────────
const cancelling = ref<EmployeeException | null>(null)

function apply(changes: QueryChanges): void {
  void router.replace({ query: mergeQuery(route.query, changes) })
}

watch([from, to, selectedId], () => void list.run(), { immediate: true })
void types.run()
void staff.run()
</script>

<template>
  <div class="space-y-4">
    <PageHeader
      title="Vacaciones y permisos"
      description="Lo que justifica una ausencia. Sin esto, un día sin marcajes se cuenta como falta."
      :count="list.loaded.value ? `${rows.length}` : undefined"
    >
      <template #actions>
        <UInput
          :model-value="from ?? ''"
          type="date"
          class="w-40"
          @update:model-value="(v: string) => apply({ from: v })"
        />
        <UInput
          :model-value="to ?? ''"
          type="date"
          class="w-40"
          @update:model-value="(v: string) => apply({ to: v })"
        />
        <UButton v-if="canWrite" icon="i-lucide-plus" label="Registrar" @click="creating = true" />
      </template>
    </PageHeader>

    <ApiErrorAlert :error="list.error.value" />

    <EmptyState
      v-if="list.loaded.value && !rows.length"
      icon="i-lucide-plane"
      title="No hay ausencias registradas"
      description="Las vacaciones, incapacidades y permisos que se capturen aquí son lo que impide que un día sin marcajes se cuente como falta."
    />

    <UTable
      v-else
      :data="rows"
      :columns="[
        { id: 'persona', header: 'Persona' },
        { id: 'motivo', header: 'Motivo' },
        { id: 'desde', header: 'Desde' },
        { id: 'hasta', header: 'Hasta' },
        { id: 'duracion', header: 'Duración' },
        { id: 'acciones', header: '' },
      ]"
      :loading="list.pending.value"
      :class="list.loaded.value && list.pending.value ? 'opacity-60 transition-opacity' : ''"
      empty="No hay ausencias en este rango."
    >
      <template #persona-cell="{ row }">
        <span class="font-mono text-xs">{{ row.original.employeeCode }}</span>
        <span class="ml-1">{{ row.original.employeeName }}</span>
      </template>

      <!--
        `isPaid` y «cuenta como jornada» son cosas distintas: unas vacaciones se
        pagan pero no se trabajan. Aquí solo se dice si se paga, que es lo que
        se pregunta al mirar la lista.
      -->
      <template #motivo-cell="{ row }">
        {{ row.original.exceptionName }}
        <UBadge v-if="row.original.isPaid" label="Pagada" color="success" class="ml-1" />
      </template>

      <template #desde-cell="{ row }">{{ cuando(row.original.startDate) }}</template>
      <template #hasta-cell="{ row }">{{ cuando(row.original.endDate) }}</template>
      <template #duracion-cell="{ row }">
        <span class="text-muted text-sm">{{ periodo(row.original) }}</span>
      </template>

      <template #acciones-cell="{ row }">
        <UButton
          v-if="canWrite"
          icon="i-lucide-trash-2"
          square
          aria-label="Cancelar esta justificación"
          @click="cancelling = row.original"
        />
      </template>
    </UTable>

    <!-- Alta -->
    <UModal
      v-model:open="creating"
      title="Registrar una ausencia"
      description="Vacaciones, incapacidad o permiso. Es lo que evita que esos días se cuenten como falta."
    >
      <template #body>
        <form class="space-y-3" @submit.prevent="submit">
          <UFormField label="Persona" required>
            <USelectMenu
              v-model="employeeId"
              :items="staffItems"
              value-key="value"
              placeholder="Busca por clave o nombre"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Motivo" required>
            <USelectMenu
              v-model="exceptionTypeId"
              :items="typeItems"
              value-key="value"
              placeholder="Elige el tipo"
              class="w-full"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Desde" required>
              <UInput v-model="startDate" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Hasta" required help="Inclusive">
              <UInput v-model="endDate" type="date" class="w-full" />
            </UFormField>
          </div>

          <UFormField
            v-if="tipoElegido?.requiresDocument"
            label="Documento que lo respalda"
            help="Este motivo lo exige: número de incapacidad, oficio, lo que aplique."
          >
            <UInput v-model="documentRef" class="w-full" />
          </UFormField>

          <p v-if="startDate > endDate" class="text-error text-sm">
            La fecha de fin no puede ser anterior a la de inicio.
          </p>

          <ApiErrorAlert :error="formError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancelar" @click="creating = false" />
            <UButton
              type="submit"
              icon="i-lucide-check"
              label="Registrar"
              :disabled="!valid"
              :loading="submitting"
            />
          </div>
        </form>
      </template>
    </UModal>

    <!-- Baja: es un dato que ya cuenta para el cálculo, así que se confirma. -->
    <ConfirmDialog
      v-if="cancelling"
      :open="true"
      title="Cancelar esta justificación"
      :message="`${cancelling.exceptionName} de ${cancelling.employeeName}, del ${cuando(cancelling.startDate)} al ${cuando(cancelling.endDate)}.`"
      warning="Esos días vuelven a quedar sin justificar y pasarán a contarse como falta."
      confirm-label="Cancelar la justificación"
      confirm-icon="i-lucide-trash-2"
      confirm-color="error"
      :action="
        async () => {
          const de = cancelling!.employeeName
          await employeesApi.removeException(cancelling!.id)
          aviso.borrado('Justificación', `${de} · esos días vuelven a contarse como falta`)
        }
      "
      @update:open="
        (value: boolean) => {
          if (!value) cancelling = null
        }
      "
      @confirmed="list.run()"
    />
  </div>
</template>
