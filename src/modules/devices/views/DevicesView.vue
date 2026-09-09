<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAsync } from '@/shared/composables/useAsync'
import { mergeQuery, type QueryChanges } from '@/shared/router/query'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { useAuthStore } from '@/modules/auth/store'
import { ROLE_LABEL } from '@/modules/auth/types'
import { orgApi } from '@/modules/org/api'
import { useLegalEntityFilter } from '@/modules/org/store'
import { agentsApi } from '@/modules/agents/api'
import { devicesApi } from '../api'
import DeviceEnrollModal from '../components/DeviceEnrollModal.vue'
import DeviceSyncModal from '../components/DeviceSyncModal.vue'
import type { Device } from '../types'
import { deviceStatusLook } from '../status'

const aviso = useAviso()

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

/**
 * SI ESTE RELOJ ABRE UNA PUERTA.
 *
 * Se elige al darlo de alta, pero también tiene que poder cambiarse después:
 * un equipo ya enrolado no tenía forma de corregirlo, y la única salida era
 * borrarlo y volver a darlo de alta, perdiendo su marca de lectura.
 *
 * Cambiarlo NO escribe en el equipo: cambia lo que se le manda a partir de la
 * próxima orden y lo que el padrón le reclama al comparar.
 */
/*
 * Los agentes, para poder decir cuál atiende cada reloj y para poder elegir uno
 * al dar de alta. `GET /agents` responde 403 al DIRECTOR_HOLDING, así que un
 * fallo aquí NO puede tumbar la pantalla: se sigue sin la columna.
 */
const agentes = useAsync((signal) => agentsApi.list(signal))
const nombreDelAgente = (id: string | null): string | null =>
  id === null ? null : ((agentes.data.value ?? []).find((a) => a.id === id)?.agentCode ?? '—')

const agentItems = computed(() =>
  (agentes.data.value ?? []).map((a) => ({ label: a.agentCode, value: a.id })),
)

/** Reasignar el agente de un reloj ya dado de alta. */
const cambiandoAgente = ref<string | null>(null)

async function asignarAgente(device: Device, edgeAgentId: string | null): Promise<void> {
  if (cambiandoAgente.value) return
  cambiandoAgente.value = device.id
  errorPuerta.value = null
  try {
    await devicesApi.update(device.id, { edgeAgentId })
    aviso.actualizado(
      device.serialNumber,
      edgeAgentId === null
        ? 'Se quedó sin agente: no va a recibir órdenes.'
        : `Lo atiende ${nombreDelAgente(edgeAgentId) ?? 'el agente elegido'}.`,
    )
    await devices.run()
  } catch (cause) {
    errorPuerta.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    cambiandoAgente.value = null
  }
}

/** Para el botón de copiar el identificador que va en AGENT_DEVICES. */
const copiado = ref<string | null>(null)
async function copiarId(device: Device): Promise<void> {
  try {
    await navigator.clipboard.writeText(device.id)
    copiado.value = device.id
    setTimeout(() => {
      if (copiado.value === device.id) copiado.value = null
    }, 2000)
  } catch (cause) {
    // Sin HTTPS el portapapeles no existe, y fallaba en silencio.
    aviso.fallo(cause, 'copiar el identificador')
  }
}

const cambiandoPuerta = ref<string | null>(null)
const errorPuerta = ref<Error | null>(null)

async function alternarPuertaPorTelefono(device: Device): Promise<void> {
  if (cambiandoPuerta.value) return
  cambiandoPuerta.value = device.id
  errorPuerta.value = null
  try {
    await devicesApi.update(device.id, {
      phonePunchOpensDoor: !device.phonePunchOpensDoor,
    })
    aviso.actualizado(
      device.serialNumber,
      device.phonePunchOpensDoor
        ? 'Una checada por teléfono ya no abre este equipo.'
        : 'Una checada por teléfono abre este equipo.',
    )
    await devices.run()
  } catch (cause) {
    errorPuerta.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    cambiandoPuerta.value = null
  }
}

async function alternarPuerta(device: Device): Promise<void> {
  if (cambiandoPuerta.value) return
  cambiandoPuerta.value = device.id
  errorPuerta.value = null
  try {
    await devicesApi.update(device.id, { opensDoor: !device.opensDoor })
    aviso.actualizado(
      device.serialNumber,
      device.opensDoor ? 'Ya no controla una puerta.' : 'Controla una puerta.',
    )
    await devices.run()
  } catch (cause) {
    errorPuerta.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    cambiandoPuerta.value = null
  }
}
const roleLabels = computed(() => auth.roles.map((role) => ROLE_LABEL[role]).join(' · '))

void installations.run()
// Si falla —DIRECTOR_HOLDING recibe 403— la pantalla sigue, solo sin agentes.
void agentes.run()
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
          :agents="agentes.data.value ?? []"
          @enrolled="() => void devices.run()"
        />
        <p v-else class="text-dimmed text-sm">
          {{ roleLabels }}: solo lectura. Dar de alta un reloj corresponde al administrador de la
          razón social o a soporte.
        </p>
      </template>
    </PageHeader>

    <ApiErrorAlert :error="devices.error.value ?? errorPuerta" />

    <UTable
      :data="rows"
      :columns="[
        { accessorKey: 'serialNumber', header: 'Número de serie' },
        { id: 'equipo', header: 'Equipo' },
        { accessorKey: 'protocol', header: 'Protocolo' },
        { id: 'installation', header: 'Instalación' },
        { id: 'agente', header: 'Agente' },
        { accessorKey: 'status', header: 'Estado' },
        { id: 'puerta', header: 'Abre puerta' },
        { id: 'puertaTelefono', header: 'Abre al checar por teléfono' },
        { id: 'acciones', header: '' },
      ]"
      :loading="devices.pending.value"
      empty="No hay relojes dados de alta."
    >
      <!--
        EL NÚMERO DE SERIE Y, DEBAJO, EL IDENTIFICADOR QUE VA EN `AGENT_DEVICES`.

        No estaba en ningún sitio de la pantalla, y es justo el dato que hay que
        pegar en la configuración del microservidor. Sin él, montar un agente
        obligaba a salir de Astra y buscarlo en la base.
      -->
      <template #serialNumber-cell="{ row }">
        <div class="space-y-0.5">
          <p class="font-mono text-xs">{{ row.original.serialNumber }}</p>
          <button
            type="button"
            class="text-dimmed hover:text-default font-mono text-[10px]"
            :title="`Copiar el identificador para AGENT_DEVICES: ${row.original.id}`"
            @click="copiarId(row.original)"
          >
            <UIcon
              :name="copiado === row.original.id ? 'i-lucide-check' : 'i-lucide-copy'"
              class="size-3 align-middle"
            />
            {{ copiado === row.original.id ? 'copiado' : row.original.id.slice(0, 8) + '…' }}
          </button>
        </div>
      </template>

      <!--
        QUÉ AGENTE LO ATIENDE, y se puede cambiar aquí mismo.

        Un reloj sin agente NO recibe órdenes —el servidor las reparte por
        agente— y hasta ahora se veía exactamente igual que uno bien puesto. El
        aviso en ámbar es la diferencia entre enterarse hoy y enterarse el día
        que alguien pregunte por qué el padrón no llega al equipo.
      -->
      <template #agente-cell="{ row }">
        <USelectMenu
          v-if="canEnroll && agentItems.length > 0"
          :model-value="row.original.edgeAgentId ?? ''"
          :items="[{ label: 'Sin agente', value: '' }, ...agentItems]"
          value-key="value"
          :loading="cambiandoAgente === row.original.id"
          :ui="{ base: 'w-40' }"
          @update:model-value="
            (v: string) => void asignarAgente(row.original, v === '' ? null : v)
          "
        />
        <span v-else-if="row.original.edgeAgentId" class="text-sm">
          {{ nombreDelAgente(row.original.edgeAgentId) }}
        </span>
        <UBadge v-else label="Sin agente" color="warning" variant="subtle" />
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
      <!--
        No todos abren: hay checadores que solo registran horarios. De esto
        depende que se le manden permisos de acceso —sin ellos la credencial se
        reconoce, la checada llega y la puerta no se abre— y que el padrón se
        los reclame al comparar.
      -->
      <template #puerta-cell="{ row }">
        <USwitch
          :model-value="row.original.opensDoor"
          :disabled="!canEnroll || cambiandoPuerta === row.original.id"
          :aria-label="`Este reloj abre una puerta`"
          @update:model-value="() => alternarPuerta(row.original)"
        />
      </template>

      <!--
        UNA CHECADA DESDE EL TELÉFONO NO PASA POR EL RELOJ, así que el imán no
        se entera: la persona queda registrada y sigue afuera. Con esto
        encendido, Astra le pide al aparato que abra.

        VA APAGADO POR OMISIÓN y no es prudencia de más: que una checada abra
        una puerta es una decisión de seguridad de cada sitio, y aparecer
        encendida porque alguien actualizó el sistema sería tomarla por ellos.

        Solo tiene sentido en un reloj que ya gobierna una puerta, por eso se
        apaga junto con la casilla de al lado. Y **necesita que el aparato
        responda**: el imán está cableado a su relé, así que con el reloj
        apagado no hay orden que sirva —que es justo por lo que no sustituye a
        una llave.
      -->
      <template #puertaTelefono-cell="{ row }">
        <USwitch
          :model-value="row.original.phonePunchOpensDoor"
          :disabled="
            !canEnroll || !row.original.opensDoor || cambiandoPuerta === row.original.id
          "
          aria-label="Una checada desde el teléfono abre esta puerta"
          @update:model-value="() => alternarPuertaPorTelefono(row.original)"
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
