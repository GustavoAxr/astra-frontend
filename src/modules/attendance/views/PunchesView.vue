<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAsync } from '@/shared/composables/useAsync'
import { useLegalEntityFilter } from '@/modules/org/store'
import { devicesApi } from '@/modules/devices/api'
import { mergeQuery, type QueryChanges } from '@/shared/router/query'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { parseVerificationMethod } from '@/domain/verification'
import { DEVICE_USER_TYPES, deviceUserTypeLook } from '@/domain/device-user-type'
import { conNinguno, NINGUNO, sinNinguno } from '@/shared/ui/select-none'
import { attendanceApi } from '../api'
import PunchEvidenceSlideover from '../components/PunchEvidenceSlideover.vue'
import type { Punch } from '../types'

const route = useRoute()
const router = useRouter()

const q = (key: string): string | undefined =>
  typeof route.query[key] === 'string' && route.query[key] !== ''
    ? (route.query[key] as string)
    : undefined

const from = computed(() => q('from'))
const to = computed(() => q('to'))
const employeeId = computed(() => q('employeeId'))
const deviceUserType = computed(() => q('deviceUserType'))
const page = computed(() => Number(route.query.page ?? 1) || 1)

/** La razón social de la barra superior. Filtro de comodidad, no alcance. */
const { selectedId } = storeToRefs(useLegalEntityFilter())

/**
 * EL RELOJ, cuando hay más de uno.
 *
 * Con un solo equipo el selector sobra y se esconde: un desplegable de una
 * opción solo ocupa sitio. Va en la URL como el resto de los filtros, para que
 * la pantalla se pueda compartir tal cual se está viendo.
 */
const deviceId = computed(() => q('deviceId'))
const devices = useAsync((signal) => devicesApi.list(undefined, signal))
void devices.run()

const deviceItems = computed(() => [
  { label: 'Todos los relojes', value: NINGUNO },
  ...(devices.data.value ?? [])
    .filter((d) => selectedId.value === null || d.legalEntityId === selectedId.value)
    .map((d) => ({
      label: [d.brand, d.model].filter(Boolean).join(' ') || d.serialNumber,
      value: d.id,
    })),
])

/** Un desplegable de una sola opción no ayuda a nadie. */
const hayVariosRelojes = computed(() => deviceItems.value.length > 2)

const LIMIT = 50

const list = useAsync((signal) =>
  attendanceApi.punches(
    {
      from: from.value,
      to: to.value,
      employeeId: employeeId.value,
      deviceUserType: deviceUserType.value,
      legalEntityId: selectedId.value ?? undefined,
      deviceId: deviceId.value,
      page: page.value,
      limit: LIMIT,
    },
    signal,
  ),
)

const rows = computed(() => list.data.value?.data ?? [])
const total = computed(() => list.data.value?.total ?? 0)

/*
 * Los valores van con la grafía exacta del fabricante: el servidor compara el
 * código crudo. «Todos» no dice «todos los estados», porque el filtro tampoco
 * alcanza a los marcajes en los que el equipo no declaró nada.
 */
const tipoItems = [
  { label: 'Cualquier estado en el reloj', value: NINGUNO },
  ...DEVICE_USER_TYPES.map((t) => ({ label: deviceUserTypeLook(t).label, value: t })),
]

/**
 * Cuántos de los marcajes que se están viendo trae el reloj señalados.
 *
 * Es solo de la página actual y así se dice: sumar sobre 50 filas y presentarlo
 * como el total del rango sería un número inventado.
 */
const senalados = computed(
  () => rows.value.filter((p) => deviceUserTypeLook(p.deviceUserType).flagged).length,
)

/** El marcaje cuya evidencia cruda se está mirando. */
const evidencia = ref<Punch | null>(null)

/**
 * Cómo se llama el equipo. `devices` no guarda un nombre propio, así que se usa
 * lo que una persona diría: «Hikvision DS-K1T805MX». El número de serie no
 * desaparece —queda en el título y en el visor de evidencia—, simplemente deja
 * de ocupar una columna que nadie sabe leer.
 */
function nombreDelReloj(p: Punch): string {
  const partes = [p.deviceBrand, p.deviceModel].filter(Boolean)
  if (partes.length) return partes.join(' ')
  // Sin marca ni modelo, la serie es mejor que un guion: al menos identifica.
  return p.serialNumber ?? p.source ?? '—'
}

const stamp = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const when = (iso: string): string => stamp.format(new Date(iso))

function apply(changes: QueryChanges): void {
  void router.replace({ query: mergeQuery(route.query, changes) })
}

watch(
  [from, to, employeeId, deviceUserType, deviceId, selectedId, page],
  () => void list.run(),
  { immediate: true },
)
</script>

<template>
  <div class="space-y-4">
    <PageHeader
      title="Marcajes"
      description="La evidencia tal como llegó del equipo. No se edita ni se borra: es lo que se enseña en una auditoría."
      :count="list.loaded.value ? `${total}` : undefined"
    >
      <template #actions>
        <!--
          Solo cuando hay más de uno: con un equipo el desplegable no ayuda y
          ocupa sitio. La razón social se elige en la barra de arriba, que es
          donde vive para toda la aplicación.
        -->
        <USelectMenu
          v-if="hayVariosRelojes"
          :model-value="conNinguno(deviceId)"
          :items="deviceItems"
          value-key="value"
          icon="i-lucide-alarm-clock"
          class="w-52"
          @update:model-value="(v: string) => apply({ deviceId: sinNinguno(v), page: undefined })"
        />
        <USelectMenu
          :model-value="conNinguno(deviceUserType)"
          :items="tipoItems"
          value-key="value"
          class="w-56"
          @update:model-value="
            (v: string) => apply({ deviceUserType: sinNinguno(v), page: undefined })
          "
        />
        <UInput
          :model-value="from ?? ''"
          type="date"
          class="w-40"
          @update:model-value="(v: string) => apply({ from: v, page: undefined })"
        />
        <UInput
          :model-value="to ?? ''"
          type="date"
          class="w-40"
          @update:model-value="(v: string) => apply({ to: v, page: undefined })"
        />
      </template>
    </PageHeader>

    <ApiErrorAlert :error="list.error.value" />

    <!--
      El reloj sigue registrando —y dejando pasar— a quien tiene en su lista de
      no autorizados. Que el marcaje exista no es un fallo del sistema; que pase
      inadvertido, sí.
    -->
    <UAlert
      v-if="senalados > 0 && !deviceUserType"
      color="error"
      icon="i-lucide-shield-alert"
      :title="
        senalados === 1
          ? 'Un marcaje de esta página es de alguien que el reloj tiene como no autorizado'
          : `${senalados} marcajes de esta página son de personas que el reloj tiene como no autorizadas`
      "
      description="El equipo los registró de todas formas: estar en esa lista no le impide a nadie checar ni pasar."
    >
      <template #actions>
        <UButton
          label="Ver solo esos"
          @click="apply({ deviceUserType: 'blackList', page: undefined })"
        />
      </template>
    </UAlert>

    <UTable
      :data="rows"
      :columns="[
        { accessorKey: 'punchTime', header: 'Momento' },
        { id: 'persona', header: 'Persona' },
        { id: 'enReloj', header: 'Estado en el reloj' },
        { id: 'metodo', header: 'Cómo se identificó' },
        { id: 'reloj', header: 'Reloj' },
        { id: 'evidencia', header: '' },
      ]"
      :loading="list.pending.value"
      empty="No hay marcajes en este rango."
    >
      <template #punchTime-cell="{ row }">
        {{ when(row.original.punchTime) }}
      </template>

      <!-- Sin rama de «sin dueño»: aquí no puede haber ninguno. -->
      <template #persona-cell="{ row }">
        <span class="font-mono text-xs">{{ row.original.employeeCode }}</span>
        <span class="ml-1">{{ row.original.employeeName }}</span>
      </template>

      <!--
        Cómo clasificaba EL EQUIPO a esa persona en ese instante. No es la baja
        en Astra: son dos hechos distintos y pueden discrepar. Se pinta siempre,
        también cuando no consta, porque dejar la celda vacía se leería como
        «normal» y eso el equipo no lo dijo.
      -->
      <template #enReloj-cell="{ row }">
        <UBadge
          v-if="deviceUserTypeLook(row.original.deviceUserType).color !== 'neutral'"
          :label="deviceUserTypeLook(row.original.deviceUserType).label"
          :color="deviceUserTypeLook(row.original.deviceUserType).color"
          :title="deviceUserTypeLook(row.original.deviceUserType).detail"
        />
        <span
          v-else
          class="text-dimmed text-xs"
          :title="deviceUserTypeLook(row.original.deviceUserType).detail"
        >
          {{ deviceUserTypeLook(row.original.deviceUserType).label }}
        </span>
      </template>

      <!--
        La columna «Tipo» ya no está: este equipo no manda `attendanceStatus`,
        así que decía «Sin clasificar» en las ciento cuarenta y siete filas. El
        dato NO se perdió —sigue en el visor de evidencia, con la explicación de
        por qué no consta— y la regla 1 sigue en pie: nadie deduce entrada ni
        salida en ningún sitio.

        Regla 2: un `MULTI:*` significa que el equipo no dejó constancia de cuál
        método se usó. La barra de «Tarjeta/Clave» enseña los dos; el título y
        el visor dicen que no consta cuál.
      -->
      <template #metodo-cell="{ row }">
        <span
          :class="
            parseVerificationMethod(row.original.verificationMethod).ambiguous ? 'text-warning' : ''
          "
          :title="parseVerificationMethod(row.original.verificationMethod).detail"
        >
          {{ parseVerificationMethod(row.original.verificationMethod).label }}
        </span>
      </template>

      <template #reloj-cell="{ row }">
        <span
          class="text-sm"
          :class="row.original.deviceBrand ? '' : 'text-dimmed'"
          :title="row.original.serialNumber ?? undefined"
        >
          {{ nombreDelReloj(row.original) }}
        </span>
      </template>

      <!--
        La carga cruda del equipo, tal como llegó. Es lo único que permite ver
        qué mandó de verdad un reloj que se porta raro, en vez de discutir sobre
        lo que creímos entender.
      -->
      <template #evidencia-cell="{ row }">
        <UButton
          icon="i-lucide-file-search"
          square
          aria-label="Ver la evidencia cruda de este marcaje"
          title="Ver la evidencia cruda de este marcaje"
          @click="evidencia = row.original"
        />
      </template>
    </UTable>

    <PunchEvidenceSlideover
      v-if="evidencia"
      :open="true"
      :punch="evidencia"
      @update:open="
        (value: boolean) => {
          if (!value) evidencia = null
        }
      "
    />

    <div v-if="total > LIMIT" class="flex justify-end">
      <UPagination
        :page="page"
        :items-per-page="LIMIT"
        :total="total"
        @update:page="(v: number) => apply({ page: v === 1 ? undefined : v })"
      />
    </div>
  </div>
</template>
