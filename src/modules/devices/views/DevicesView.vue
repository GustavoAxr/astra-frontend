<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAsync } from '@/shared/composables/useAsync'
import { mergeQuery, type QueryChanges } from '@/shared/router/query'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { useAuthStore } from '@/modules/auth/store'
import { ROLE_LABEL } from '@/modules/auth/types'
import { orgApi } from '@/modules/org/api'
import { useLegalEntityFilter } from '@/modules/org/store'
import { devicesApi } from '../api'
import DeviceEnrollModal from '../components/DeviceEnrollModal.vue'
import DeviceSyncModal from '../components/DeviceSyncModal.vue'
import type { Device } from '../types'
import { deviceStatusLook } from '../status'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { selectedId: selectedLegalEntityId } = storeToRefs(useLegalEntityFilter())

/**
 * `GET /devices` solo acepta `installationId`; no hay filtro por razón social.
 * Así que aquí el selector de empresa no escribe en la URL: lo que hace es
 * acotar la lista de instalaciones entre las que se elige.
 */
const installationId = computed(() =>
  typeof route.query.installationId === 'string' ? route.query.installationId : undefined,
)

const installations = useAsync((signal) => orgApi.installations({}, signal))
const devices = useAsync((signal) => devicesApi.list(installationId.value, signal))

const visibleInstallations = computed(() =>
  (installations.data.value ?? []).filter(
    (installation) =>
      selectedLegalEntityId.value === null ||
      installation.legalEntityId === selectedLegalEntityId.value,
  ),
)

const installationItems = computed(() => [
  { label: 'Todas las instalaciones', value: undefined as string | undefined },
  ...visibleInstallations.value.map((installation) => ({
    label: `${installation.code} · ${installation.name}`,
    value: installation.id as string | undefined,
  })),
])

const installationName = (id: string): string => {
  const found = (installations.data.value ?? []).find((installation) => installation.id === id)
  return found ? found.code : '—'
}

function apply(changes: QueryChanges): void {
  void router.replace({ query: mergeQuery(route.query, changes) })
}

const rows = computed(() => devices.data.value ?? [])

/**
 * `POST /devices/discover` y `POST /devices` son de ADMIN_EMPRESA y SOPORTE.
 * A DIRECTOR_HOLDING el servidor le responde 403, así que enseñarle el botón
 * solo sirve para que crea que algo está roto. Ocultarlo no le quita permisos
 * —no los tenía— ni se los da a nadie: por URL la llamada falla igual.
 */
const canEnroll = computed(() => auth.can('enrollDevice'))

/** Leer un reloj es cosa de quien lo administra: mismo permiso que darlo de alta. */
const syncing = ref<Device | null>(null)
const roleLabels = computed(() => auth.roles.map((role) => ROLE_LABEL[role]).join(' · '))

void installations.run()
watch(installationId, () => void devices.run(), { immediate: true })
</script>

<template>
  <section class="space-y-4">
    <PageHeader
      title="Relojes"
      description="Los equipos checadores dados de alta y el estado de su enlace."
      :count="devices.loaded.value ? `${rows.length}` : undefined"
    >
      <template #actions>
        <USelectMenu
          :model-value="installationId"
          :items="installationItems"
          value-key="value"
          icon="i-lucide-map-pin"
          class="w-64"
          @update:model-value="(value: string | undefined) => apply({ installationId: value })"
        />

        <DeviceSyncModal
          v-if="syncing"
          :open="true"
          :device="syncing"
          @update:open="
            (value: boolean) => {
              if (!value) syncing = null
            }
          "
          @synced="() => void devices.run()"
        />

        <DeviceEnrollModal
          v-if="canEnroll"
          :installations="visibleInstallations"
          @enrolled="() => void devices.run()"
        />
        <p v-else class="text-dimmed text-sm">
          {{ roleLabels }}: solo lectura. Dar de alta un reloj corresponde al administrador de la
          razón social o a soporte.
        </p>
      </template>
    </PageHeader>

    <ApiErrorAlert :error="devices.error.value" />

    <UTable
      :data="rows"
      :columns="[
        { accessorKey: 'serialNumber', header: 'Número de serie' },
        { id: 'equipo', header: 'Equipo' },
        { accessorKey: 'protocol', header: 'Protocolo' },
        { id: 'installation', header: 'Instalación' },
        { accessorKey: 'status', header: 'Estado' },
        { id: 'acciones', header: '' },
      ]"
      :loading="devices.pending.value"
      empty="No hay relojes dados de alta."
    >
      <template #serialNumber-cell="{ row }">
        <span class="font-mono text-xs">{{ row.original.serialNumber }}</span>
      </template>

      <template #equipo-cell="{ row }">
        {{ row.original.brand }}
        <span class="text-muted">{{ row.original.model ?? '' }}</span>
      </template>

      <template #installation-cell="{ row }">
        {{ installationName(row.original.installationId) }}
      </template>

      <template #status-cell="{ row }">
        <UBadge
          :label="deviceStatusLook(row.original.status).label"
          :color="deviceStatusLook(row.original.status).color"
        />
      </template>
      <template #acciones-cell="{ row }">
        <UButton
          v-if="canEnroll"
          icon="i-lucide-download"
          label="Leer checadas"
          size="sm"
          @click="syncing = row.original"
        />
        <UButton
          :to="{ name: 'reconcile', params: { deviceId: row.original.id } }"
          icon="i-lucide-users"
          label="Conciliar padrón"
          size="sm"
        />
        <!--
          Separado de «Conciliar» a propósito: aquella VINCULA el número del
          reloj con un empleado, y esta corrige el nombre de quien ya está
          vinculado. Son dos decisiones distintas.
        -->
        <UButton
          :to="{ name: 'padron', params: { deviceId: row.original.id } }"
          icon="i-lucide-id-card"
          label="Padrón"
          size="sm"
        />
      </template>
    </UTable>
  </section>
</template>
