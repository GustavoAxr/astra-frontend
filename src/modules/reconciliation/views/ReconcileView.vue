<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAsync } from '@/shared/composables/useAsync'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import { devicesApi } from '@/modules/devices/api'
import { reconciliationApi } from '../api'
import EnrollFromDirectoryModal from '../components/EnrollFromDirectoryModal.vue'
import type { ReconcilePending, ReconcileResult } from '../types'

const aviso = useAviso()

const route = useRoute()
const deviceId = String(route.params.deviceId)


const preview = useAsync((signal) =>
  reconciliationApi.preview(deviceId, signal),
)

/**
 * La propuesta del servidor se queda **inmutable** en `preview.data`. Las
 * decisiones de la persona viven aparte, en este mapa. Mezclarlas haría
 * imposible distinguir lo que propuso la máquina de lo que confirmó alguien.
 */
const decisions = reactive(new Map<string, string>())

const applying = ref(false)
const applyError = ref<Error | null>(null)
const result = ref<ReconcileResult | null>(null)

/** Paso de confirmación: las filas exactas que se van a mandar, enumeradas. */
const confirming = ref<{ externalUserId: string; employeeId: string; label: string }[] | null>(null)

const pending = computed<ReconcilePending[]>(() => preview.data.value?.pending ?? [])

/**
 * De qué empresa y en qué base está el reloj: los nuevos expedientes cuelgan de
 * ahí. La propuesta de conciliación no lo trae, así que se lee del propio equipo.
 */
const devices = useAsync((signal) => devicesApi.list(undefined, signal))
void devices.run()
const device = computed(() => (devices.data.value ?? []).find((d) => d.id === deviceId) ?? null)

const enrollOpen = ref(false)

/** Los que no tienen ninguna sugerencia: no están en la plantilla todavía. */
const sinCandidato = computed(() => pending.value.filter((p) => p.suggestions.length === 0))

function choose(externalUserId: string, employeeId: string): void {
  if (decisions.get(externalUserId) === employeeId) decisions.delete(externalUserId)
  else decisions.set(externalUserId, employeeId)
}

function labelFor(item: ReconcilePending, employeeId: string): string {
  const suggestion = item.suggestions.find((s) => s.employeeId === employeeId)
  return suggestion ? `${suggestion.employeeCode} · ${suggestion.fullName}` : employeeId
}

/**
 * «Aplicar todo» alcanza **solo** a los `confident: true`, y no manda nada sin
 * enseñar antes la lista exacta. Nunca existe una llamada de aplicar que el
 * usuario no haya visto enumerada.
 */
function prepareConfidentBatch(): void {
  confirming.value = pending.value
    .filter((item) => item.confident && item.suggestions[0])
    .map((item) => ({
      externalUserId: item.externalUserId,
      employeeId: item.suggestions[0]!.employeeId,
      label: `${item.suggestions[0]!.employeeCode} · ${item.suggestions[0]!.fullName}`,
    }))
}

function prepareManualBatch(): void {
  confirming.value = [...decisions.entries()].map(([externalUserId, employeeId]) => {
    const item = pending.value.find((p) => p.externalUserId === externalUserId)
    return {
      externalUserId,
      employeeId,
      label: item ? labelFor(item, employeeId) : employeeId,
    }
  })
}

async function confirmApply(): Promise<void> {
  if (!confirming.value || applying.value) return
  applying.value = true
  applyError.value = null

  try {
    result.value = await reconciliationApi.apply(
      deviceId,
      confirming.value.map(({ externalUserId, employeeId }) => ({ externalUserId, employeeId })),
    )
    /*
     * Se dice lo EMPAREJADO y, aparte, cuántas checadas huérfanas dejaron de
     * serlo: es la consecuencia que nadie ve al confirmar, y la razón por la
     * que se concilia.
     */
    aviso.hecho(
      `${result.value.enrolled} personas emparejadas`,
      result.value.trayResolved > 0
        ? `${result.value.trayResolved} checadas sueltas ya tienen dueño.`
        : undefined,
    )
    confirming.value = null
    decisions.clear()
    await preview.run()
  } catch (cause) {
    applyError.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <section class="space-y-5">
    <div class="flex items-center gap-3">
      <UButton :to="{ name: 'devices' }" icon="i-lucide-arrow-left" square />
      <div>
        <h1 class="text-xl font-semibold">Conciliar el padrón del reloj</h1>
        <p class="text-muted text-sm">
          Emparejar a cada usuario del equipo con una persona de la plantilla.
        </p>
      </div>
    </div>

    <!--
      SIN CREDENCIALES DEL RELOJ. La propuesta sale de la bandeja de marcajes
      sin dueño, que ya trae el nombre que el equipo reporta en cada checada.
      Preguntarle al aparato exigía que el servidor compartiera red con él, y
      eso dejó de ser cierto al desplegar.
    -->
    <UCard v-if="!preview.data.value">
      <p class="text-default text-sm">
        Se propone a partir de quien ha checado en este reloj y todavía no tiene
        expediente.
      </p>
      <p class="text-dimmed mt-1 text-xs">
        Solo aparece quien haya checado al menos una vez. A quien esté dado de alta
        en el equipo pero no haya pasado el dedo todavía, aquí no se le ve.
      </p>
      <div class="mt-3">
        <UButton
          label="Ver propuestas"
          icon="i-lucide-users"
          :loading="preview.pending.value"
          @click="preview.run"
        />
      </div>
      <ApiErrorAlert :error="preview.error.value" class="mt-3" />
    </UCard>

    <UAlert
      v-if="result"
      icon="i-lucide-circle-check"
      color="success"
      :title="`${result.enrolled} personas enroladas`"
      :description="
        result.trayResolved > 0
          ? `Además se resolvieron solos ${result.trayResolved} marcajes que estaban sin dueño.`
          : 'No había marcajes sin dueño que resolver.'
      "
    />

    <template v-if="preview.data.value">
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-mono text-xs">{{ preview.data.value.serialNumber }}</span>
        <UBadge :label="`${preview.data.value.alreadyMapped} ya emparejados`" color="neutral" />
        <UBadge :label="`${pending.length} pendientes`" color="warning" />
        <UBadge :label="`${preview.data.value.confidentCount} sin dudas`" color="success" />

        <div class="ml-auto flex gap-2">
          <!--
            Cuando nadie del padrón está en la plantilla, emparejar no tiene
            sentido: primero hay que crearlos. El equipo ya tiene sus nombres.
          -->
          <UButton
            v-if="device && sinCandidato.length > 0"
            :label="`Dar de alta ${sinCandidato.length} desde el padrón`"
            icon="i-lucide-user-plus"
            @click="enrollOpen = true"
          />
          <UButton
            v-if="decisions.size > 0"
            :label="`Aplicar ${decisions.size} elegidos a mano`"
            @click="prepareManualBatch"
          />
          <UButton
            v-if="preview.data.value.confidentCount > 0"
            :label="`Aplicar los ${preview.data.value.confidentCount} sin dudas`"
            icon="i-lucide-wand-sparkles"
            @click="prepareConfidentBatch"
          />
        </div>
      </div>

      <ApiErrorAlert :error="applyError" />

      <div
        v-for="item in pending"
        :key="item.externalUserId"
        class="border-default rounded-lg border p-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-mono">{{ item.externalUserId }}</span>
          <span v-if="item.deviceName" class="font-medium">{{ item.deviceName }}</span>
          <span v-else class="text-dimmed text-sm">El reloj no guardó nombre</span>

          <UBadge v-if="item.confident" label="Sin dudas" color="success" class="ml-auto" />
          <UBadge v-else label="Hay que decidir" color="warning" class="ml-auto" />
        </div>

        <p v-if="item.suggestions.length === 0" class="text-dimmed mt-2 text-sm">
          Nadie se le parece. Hay que asignarlo a mano.
        </p>

        <div v-else class="mt-2 grid gap-2">
          <button
            v-for="suggestion in item.suggestions"
            :key="suggestion.employeeId"
            type="button"
            class="hover:bg-elevated flex flex-wrap items-center gap-2 rounded-lg border p-2 text-left"
            :class="
              decisions.get(item.externalUserId) === suggestion.employeeId
                ? 'border-primary bg-elevated'
                : 'border-default'
            "
            @click="choose(item.externalUserId, suggestion.employeeId)"
          >
            <span class="font-mono text-xs">{{ suggestion.employeeCode }}</span>
            <span>{{ suggestion.fullName }}</span>
            <span class="text-muted text-xs">{{ suggestion.reason }}</span>
            <span class="text-dimmed ml-auto text-xs">{{ suggestion.score }}/100</span>
          </button>
        </div>
      </div>
    </template>

    <EnrollFromDirectoryModal
      v-if="device"
      v-model:open="enrollOpen"
      :device-id="deviceId"
      :legal-entity-id="device.legalEntityId"
      :installation-id="device.installationId"
      :pending="sinCandidato"
      @done="preview.run"
    />

    <!-- Nada se manda sin que la persona vea antes la lista exacta. -->
    <UModal
      :open="confirming !== null"
      title="Confirma antes de aplicar"
      @update:open="
        (value: boolean) => {
          if (!value) confirming = null
        }
      "
    >
      <template #body>
        <p class="text-muted mb-3 text-sm">
          Se van a emparejar {{ confirming?.length ?? 0 }} usuarios del reloj:
        </p>
        <ul class="max-h-64 space-y-1 overflow-y-auto">
          <li v-for="row in confirming ?? []" :key="row.externalUserId" class="text-sm">
            <span class="font-mono">{{ row.externalUserId }}</span>
            <span class="text-dimmed"> → </span>
            <span>{{ row.label }}</span>
          </li>
        </ul>
        <div class="mt-4 flex justify-end gap-2">
          <UButton label="Cancelar" @click="confirming = null" />
          <UButton
            label="Aplicar"
            icon="i-lucide-check"
            :loading="applying"
            @click="confirmApply"
          />
        </div>
      </template>
    </UModal>
  </section>
</template>
