<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAsync } from '@/shared/composables/useAsync'
import { mergeQuery, type QueryChanges } from '@/shared/router/query'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { punchesApi } from '../api'
import { useUnmatchedCount } from '../store'

const route = useRoute()
const router = useRouter()
const counter = useUnmatchedCount()

const deviceId = computed(() =>
  typeof route.query.deviceId === 'string' ? route.query.deviceId : undefined,
)

const list = useAsync((signal) => punchesApi.unmatched(deviceId.value, signal))
const summary = useAsync((signal) => punchesApi.unmatchedCount(signal))

const rows = computed(() => list.data.value ?? [])
const byDevice = computed(() => summary.data.value?.byDevice ?? [])

const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const when = (iso: string): string => formatter.format(new Date(iso))

function apply(changes: QueryChanges): void {
  void router.replace({ query: mergeQuery(route.query, changes) })
}

void summary.run().then(() => counter.refresh())
watch(deviceId, () => void list.run(), { immediate: true })
</script>

<template>
  <section class="space-y-4">
    <PageHeader
      title="Marcajes sin dueño"
      description="Checadas que llegaron con un número de empleado que no corresponde a nadie enrolado. Si esta cifra sube, alguien está trabajando sin quedar registrado."
      :count="list.loaded.value ? `${rows.length}` : undefined"
    />

    <ApiErrorAlert :error="list.error.value ?? summary.error.value" />

    <div v-if="byDevice.length > 0" class="flex flex-wrap gap-2">
      <UButton
        label="Todos los relojes"
        :active="deviceId === undefined"
        size="sm"
        @click="apply({ deviceId: undefined })"
      />
      <UButton
        v-for="device in byDevice"
        :key="device.deviceId"
        :label="`${device.serialNumber} · ${device.count}`"
        :active="deviceId === device.deviceId"
        size="sm"
        @click="apply({ deviceId: device.deviceId })"
      />
    </div>

    <UTable
      :data="rows"
      :columns="[
        { accessorKey: 'externalUserId', header: 'Número en el reloj' },
        { accessorKey: 'deviceReportedName', header: 'Nombre que reporta el equipo' },
        { accessorKey: 'punchTime', header: 'Momento' },
        { accessorKey: 'serialNumber', header: 'Reloj' },
      ]"
      :loading="list.pending.value"
      empty="No hay marcajes sin dueño. Todo el mundo está enrolado."
    >
      <template #externalUserId-cell="{ row }">
        <!-- Con los ceros a la izquierda TAL CUAL: es la llave del padrón. -->
        <span class="font-mono">{{ row.original.externalUserId }}</span>
      </template>

      <template #deviceReportedName-cell="{ row }">
        <span v-if="row.original.deviceReportedName">{{ row.original.deviceReportedName }}</span>
        <span v-else class="text-dimmed"> El reloj no guardó nombre · hay que ir al equipo </span>
      </template>

      <template #punchTime-cell="{ row }">{{ when(row.original.punchTime) }}</template>

      <template #serialNumber-cell="{ row }">
        <span class="font-mono text-xs">{{ row.original.serialNumber }}</span>
      </template>
    </UTable>
  </section>
</template>
