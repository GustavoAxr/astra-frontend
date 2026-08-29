<script setup lang="ts">
import { computed } from 'vue'
import { useAsync } from '@/shared/composables/useAsync'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { useAuthStore } from '@/modules/auth/store'
import { orgApi } from '@/modules/org/api'
import { agentStatusLook } from '@/modules/devices/status'
import { agentsApi } from '../api'
import AgentEnrollModal from '../components/AgentEnrollModal.vue'

const auth = useAuthStore()
const agents = useAsync((signal) => agentsApi.list(signal))
const installations = useAsync((signal) => orgApi.installations({}, signal))

void agents.run()
void installations.run()

const rows = computed(() => agents.data.value ?? [])
const canCreate = computed(() => auth.can('createAgent'))

const installationName = (id: string): string =>
  (installations.data.value ?? []).find((i) => i.id === id)?.code ?? '—'

const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const when = (iso: string | null): string => (iso ? formatter.format(new Date(iso)) : '—')
</script>

<template>
  <section class="space-y-4">
    <PageHeader
      title="Agentes de sitio"
      description="El programa que corre en la instalación y le habla a los relojes."
      :count="agents.loaded.value ? `${rows.length}` : undefined"
    >
      <template #actions>
        <AgentEnrollModal
          v-if="canCreate"
          :installations="installations.data.value ?? []"
          @enrolled="() => void agents.run()"
        />
      </template>
    </PageHeader>

    <ApiErrorAlert :error="agents.error.value" />

    <UTable
      :data="rows"
      :columns="[
        { accessorKey: 'agentCode', header: 'Código' },
        { id: 'installation', header: 'Instalación' },
        { accessorKey: 'status', header: 'Estado' },
        { accessorKey: 'lastHeartbeatAt', header: 'Último latido' },
        { id: 'served', header: 'Atiende' },
        { accessorKey: 'agentVersion', header: 'Versión' },
      ]"
      :loading="agents.pending.value"
      empty="No hay agentes dados de alta."
    >
      <template #agentCode-cell="{ row }">
        <span class="font-mono text-xs">{{ row.original.agentCode }}</span>
      </template>

      <template #installation-cell="{ row }">
        {{ installationName(row.original.installationId) }}
      </template>

      <template #status-cell="{ row }">
        <UBadge
          :label="agentStatusLook(row.original.status).label"
          :color="agentStatusLook(row.original.status).color"
        />
      </template>

      <template #lastHeartbeatAt-cell="{ row }">
        {{ when(row.original.lastHeartbeatAt) }}
        <span v-if="row.original.clockOffsetMs !== null" class="text-dimmed text-xs">
          · desfase {{ row.original.clockOffsetMs }} ms
        </span>
      </template>

      <!-- Más de una razón social significa que alguno de sus relojes es
           compartido o global. Vale la pena que se vea. -->
      <template #served-cell="{ row }">
        <UBadge
          :label="`${row.original.servedEntityIds.length} empresas`"
          :color="row.original.servedEntityIds.length > 1 ? 'warning' : 'neutral'"
        />
        <span class="text-dimmed ml-1 text-xs">
          {{ row.original.servedInstallationIds.length }} instalaciones
        </span>
      </template>

      <template #agentVersion-cell="{ row }">
        <span class="text-muted text-xs">{{ row.original.agentVersion ?? '—' }}</span>
      </template>
    </UTable>
  </section>
</template>
