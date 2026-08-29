<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAsync } from '@/shared/composables/useAsync'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { useAuthStore } from '@/modules/auth/store'
import { devicesApi } from '@/modules/devices/api'
import { padronApi } from '../api'
import { diaLegible, gravedad, motivoColor, motivoLabel } from '../motivo'
import type { Divergencia, SyncResult } from '../types'

const route = useRoute()
const deviceId = String(route.params.deviceId)
const auth = useAuthStore()

/** Encolar es de RRHH y del administrador. Ver, cualquiera. Regla 6: oculta, no protege. */
const canPush = computed(() => auth.can('assignEmployee'))

const username = ref('')
const password = ref('')

const devices = useAsync((signal) => devicesApi.list(undefined, signal))
void devices.run()
const device = computed(() => (devices.data.value ?? []).find((d) => d.id === deviceId) ?? null)

const difs = useAsync((signal) =>
  padronApi.state(deviceId, username.value, password.value, signal),
)
const ordenes = useAsync((signal) => padronApi.commands(deviceId, signal))
void ordenes.run()

/**
 * Primero lo que abre puertas. Una vigencia mal puesta deja entrar a quien ya
 * no trabaja aquí; un nombre mal escrito solo se ve feo en un listado. Orden
 * alfabético dejaría lo urgente en medio de lo cosmético.
 */
const rows = computed<Divergencia[]>(() =>
  [...(difs.data.value?.divergencias ?? [])].sort(
    (a, b) => gravedad(a) - gravedad(b) || a.externalUserId.localeCompare(b.externalUserId),
  ),
)
const alDia = computed(() => difs.data.value?.alDia ?? 0)

/**
 * Lo elegido vive aparte de lo que respondió el servidor.
 *
 * Mezclarlos haría imposible distinguir lo que encontró la máquina de lo que
 * confirmó una persona — que es justo la distinción que hace falta antes de
 * escribir en una puerta.
 */
const elegidas = ref(new Set<string>())

const pushing = ref(false)
const pushError = ref<Error | null>(null)
const resultado = ref<SyncResult | null>(null)
const confirmando = ref(false)

const puedeBuscar = computed(() => username.value.trim() !== '' && password.value !== '')

function alternar(ext: string): void {
  const s = new Set(elegidas.value)
  if (s.has(ext)) s.delete(ext)
  else s.add(ext)
  elegidas.value = s
}

function todas(): void {
  elegidas.value =
    elegidas.value.size === rows.value.length
      ? new Set()
      : new Set(rows.value.map((r) => r.externalUserId))
}

async function buscar(): Promise<void> {
  resultado.value = null
  elegidas.value = new Set()
  await difs.run()
}

async function empujar(): Promise<void> {
  if (pushing.value || elegidas.value.size === 0) return
  pushing.value = true
  pushError.value = null
  try {
    resultado.value = await padronApi.sync(deviceId, username.value, password.value, [
      ...elegidas.value,
    ])
    confirmando.value = false
    elegidas.value = new Set()
    await Promise.all([difs.run(), ordenes.run()])
  } catch (cause) {
    pushError.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    pushing.value = false
  }
}

const ESTADOS: Record<string, { label: string; color: 'neutral' | 'warning' | 'success' | 'error' }> =
  {
    pending: { label: 'En cola', color: 'warning' },
    sent: { label: 'Entregada al agente', color: 'warning' },
    applied: { label: 'Aplicada', color: 'success' },
    failed: { label: 'Rechazada por el reloj', color: 'error' },
    cancelled: { label: 'Sustituida', color: 'neutral' },
  }
</script>

<template>
  <section class="space-y-4">
    <PageHeader
      title="Padrón del reloj"
      :description="
        device
          ? `Deja el equipo ${device.serialNumber} como Astra dice que debe estar.`
          : 'Deja el equipo como Astra dice que debe estar.'
      "
      :count="difs.loaded.value ? `${rows.length}` : undefined"
    />

    <!--
      Esto NO sustituye a la conciliación. Ella VINCULA el número del reloj con
      un empleado; esto corrige el nombre de quien ya está vinculado. Son dos
      decisiones distintas y se toman en dos pantallas distintas a propósito.
    -->
    <UAlert
      icon="i-lucide-info"
      color="neutral"
      title="Nada se escribe al pulsar el botón"
      description="Las correcciones se encolan y las aplica el agente en su siguiente ciclo. Si el reloj está apagado, esperan; no se pierden."
    />

    <UCard>
      <template #header>
        <h2 class="font-medium">Credenciales del equipo</h2>
      </template>

      <form class="flex flex-wrap items-end gap-3" @submit.prevent="buscar">
        <UFormField label="Usuario">
          <UInput v-model="username" placeholder="admin" autocomplete="off" />
        </UFormField>
        <UFormField label="Contraseña">
          <!-- No se guarda: vive en esta pantalla y se olvida al salir. -->
          <UInput v-model="password" type="password" autocomplete="off" />
        </UFormField>
        <UButton
          type="submit"
          icon="i-lucide-search"
          label="Comparar padrón"
          :disabled="!puedeBuscar"
          :loading="difs.pending.value"
        />
      </form>
    </UCard>

    <ApiErrorAlert :error="difs.error.value" />
    <ApiErrorAlert :error="pushError" />

    <UAlert
      v-if="resultado"
      icon="i-lucide-check"
      color="success"
      :title="`${resultado.encoladas} ${resultado.encoladas === 1 ? 'orden encolada' : 'órdenes encoladas'}`"
      :description="
        resultado.rechazadas.length
          ? resultado.rechazadas.map((r) => `${r.id}: ${r.motivo}`).join(' · ')
          : 'El agente las aplicará en su siguiente ciclo.'
      "
    />

    <EmptyState
      v-if="difs.loaded.value && !rows.length"
      icon="i-lucide-check-check"
      title="El reloj está como Astra dice"
      :description="`Las ${alDia} personas vinculadas coinciden en nombre, vigencia y bloqueo. Los acentos y las mayúsculas no cuentan como diferencia: «Gomez» y «Gómez» son la misma persona.`"
    />

    <UCard v-else-if="rows.length">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="font-medium">
              {{ rows.length }} {{ rows.length === 1 ? 'diferencia' : 'diferencias' }}
            </h2>
            <p class="text-dimmed text-xs">{{ alDia }} al día</p>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              :label="elegidas.size === rows.length ? 'Ninguna' : 'Todas'"
              size="xs"
              @click="todas"
            />
            <UButton
              v-if="canPush"
              icon="i-lucide-upload"
              :label="`Sincronizar ${elegidas.size}`"
              :disabled="elegidas.size === 0"
              @click="confirmando = true"
            />
          </div>
        </div>
      </template>

      <UTable
        :data="rows"
        :columns="[
          { id: 'sel', header: '' },
          { accessorKey: 'externalUserId', header: 'Clave' },
          { id: 'motivos', header: 'Qué difiere' },
          { id: 'equipo', header: 'En el reloj' },
          { id: 'astra', header: 'En Astra' },
        ]"
      >
        <template #sel-cell="{ row }">
          <UCheckbox
            :model-value="elegidas.has(row.original.externalUserId)"
            :aria-label="`Sincronizar ${row.original.nombre.enAstra}`"
            @update:model-value="alternar(row.original.externalUserId)"
          />
        </template>

        <template #motivos-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="m in row.original.motivos"
              :key="m"
              :label="motivoLabel(m)"
              :color="motivoColor(m)"
              size="sm"
            />
          </div>
        </template>

        <template #externalUserId-cell="{ row }">
          <span class="font-mono text-xs">{{ row.original.externalUserId }}</span>
          <span class="text-dimmed ml-2 font-mono text-xs">{{ row.original.employeeCode }}</span>
        </template>

        <!--
          Se enseñan las dos columnas SOLO con lo que difiere. Repetir el nombre
          en una fila cuya diferencia es la vigencia obliga a comparar dos textos
          idénticos para descubrir que no era eso.
        -->
        <template #equipo-cell="{ row }">
          <div class="text-muted space-y-0.5 text-sm">
            <div v-if="row.original.motivos.includes('nombre')">
              <span v-if="row.original.nombre.enElEquipo">
                {{ row.original.nombre.enElEquipo }}
              </span>
              <span v-else class="text-dimmed italic">en blanco</span>
            </div>
            <div v-if="row.original.motivos.includes('vigencia')">
              {{ diaLegible(row.original.vigencia.enElEquipo) }}
            </div>
            <div v-if="row.original.motivos.includes('bloqueo')">
              {{ row.original.bloqueo.enElEquipo ? 'le abre' : 'bloqueado' }}
            </div>
          </div>
        </template>

        <template #astra-cell="{ row }">
          <div class="space-y-0.5 text-sm font-medium">
            <div v-if="row.original.motivos.includes('nombre')">
              {{ row.original.nombre.enAstra }}
            </div>
            <div v-if="row.original.motivos.includes('vigencia')">
              {{ diaLegible(row.original.vigencia.enAstra) }}
            </div>
            <div v-if="row.original.motivos.includes('bloqueo')">
              {{ row.original.bloqueo.enAstra ? 'le abre' : 'bloqueado' }}
            </div>
          </div>
        </template>
      </UTable>
    </UCard>

    <!--
      Se enumeran las filas exactas antes de mandarlas, igual que en la
      conciliación. Escribir en un control de acceso no se hace a ciegas.
    -->
    <UModal v-model:open="confirmando" title="Mandar al reloj">
      <template #body>
        <div class="space-y-3">
          <p class="text-muted text-sm">
            Se manda el estado completo de cada persona —nombre, vigencia y bloqueo—, no solo
            lo que difiere: el equipo sustituye el registro entero en cada escritura. El número
            interno no cambia, así que sus marcajes anteriores siguen asociados.
          </p>
          <ul class="space-y-1 text-sm">
            <li v-for="ext in [...elegidas]" :key="ext" class="font-mono text-xs">
              {{ ext }} · {{ rows.find((r) => r.externalUserId === ext)?.nombre.enAstra }}
              <span class="text-dimmed">
                ({{ rows.find((r) => r.externalUserId === ext)?.motivos.map(motivoLabel).join(', ') }})
              </span>
            </li>
          </ul>
          <div class="flex justify-end gap-2">
            <UButton label="Cancelar" @click="confirmando = false" />
            <UButton
              icon="i-lucide-upload"
              :label="`Encolar ${elegidas.size}`"
              :loading="pushing"
              @click="empujar"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UCard v-if="(ordenes.data.value ?? []).length">
      <template #header>
        <h2 class="font-medium">Órdenes de este equipo</h2>
      </template>

      <UTable
        :data="ordenes.data.value ?? []"
        :columns="[
          { accessorKey: 'externalUserId', header: 'Clave' },
          { id: 'quien', header: 'Persona' },
          { id: 'estado', header: 'Estado' },
          { id: 'detalle', header: 'Qué contestó el reloj' },
          { id: 'quien_pidio', header: 'Pedida por' },
        ]"
        empty="Todavía no se ha pedido nada a este equipo."
      >
        <template #externalUserId-cell="{ row }">
          <span class="font-mono text-xs">{{ row.original.externalUserId }}</span>
        </template>
        <template #quien-cell="{ row }">
          {{ row.original.employeeName ?? '—' }}
        </template>
        <template #estado-cell="{ row }">
          <UBadge
            :label="ESTADOS[row.original.status]?.label ?? row.original.status"
            :color="ESTADOS[row.original.status]?.color ?? 'neutral'"
            size="sm"
          />
          <span v-if="row.original.attempts > 1" class="text-dimmed ml-2 text-xs">
            {{ row.original.attempts }} intentos
          </span>
        </template>
        <template #detalle-cell="{ row }">
          <span v-if="row.original.lastError" class="block max-w-[24rem] truncate text-xs">
            {{ row.original.lastError }}
          </span>
          <span v-else class="text-dimmed">—</span>
        </template>
        <template #quien_pidio-cell="{ row }">
          <span class="text-muted text-sm">{{ row.original.requestedByName ?? '—' }}</span>
        </template>
      </UTable>
    </UCard>
  </section>
</template>
