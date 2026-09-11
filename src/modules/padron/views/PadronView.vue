<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAsync } from '@/shared/composables/useAsync'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { useAviso } from '@/shared/ui/aviso'
import { useAuthStore } from '@/modules/auth/store'
import { devicesApi } from '@/modules/devices/api'
import { padronApi } from '../api'
import { diaLegible, gravedad, motivoColor, motivoLabel } from '../motivo'
import type { Divergencia, SyncResult } from '../types'

const aviso = useAviso()

const route = useRoute()
const deviceId = String(route.params.deviceId)
const auth = useAuthStore()

/** Encolar es de RRHH y del administrador. Ver, cualquiera. Regla 6: oculta, no protege. */
const canPush = computed(() => auth.can('assignEmployee'))

const devices = useAsync((signal) => devicesApi.list(undefined, signal))
void devices.run()
const device = computed(() => (devices.data.value ?? []).find((d) => d.id === deviceId) ?? null)

const difs = useAsync((signal) => padronApi.state(deviceId, signal))
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

/**
 * A QUIÉN SE VIENE A ARREGLAR.
 *
 * El expediente manda aquí con `?destacar=<número del reloj>` justo después de
 * dar de baja o reactivar a alguien. Se marca esa fila sola tras comparar: es
 * exactamente el trabajo que quedaba pendiente y buscarla a ojo en un listado
 * de cien números es cómo se olvida.
 *
 * Se marca, NO se empuja: escribir en la puerta lo sigue decidiendo una
 * persona, fila por fila.
 */
const destacado = computed(() => {
  const q = route.query.destacar
  const valor = Array.isArray(q) ? q[0] : q
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
})

/** Si el reloj ya coincide con Astra, esa persona no sale en la lista. */
const destacadoResuelto = computed(
  () =>
    destacado.value !== null &&
    difs.loaded.value &&
    !rows.value.some((r) => r.externalUserId === destacado.value),
)

const pushing = ref(false)
const pushError = ref<Error | null>(null)
const resultado = ref<SyncResult | null>(null)
const confirmando = ref(false)

/*
 * ESTA PANTALLA YA NO PIDE LA CLAVE DEL RELOJ, ni para comparar ni para
 * aplicar. Se compara contra la foto que trajo el agente, y quien escribe en
 * el equipo es el propio agente con sus credenciales. Pedirlas aquí era pedir
 * algo que ya no servía para nada.
 */
const pidiendoLectura = ref(false)

/** De cuándo es la foto, en palabras. */
const edadDeLaFoto = computed<string | null>(() => {
  const f = difs.data.value?.foto
  if (!f?.readAt) return null
  const minutos = Math.round((Date.now() - new Date(f.readAt).getTime()) / 60000)
  if (minutos < 1) return 'hace un momento'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.round(horas / 24)} d`
})

/** Se pidió una lectura y todavía no ha llegado. */
const lecturaEnVuelo = computed(() => {
  const f = difs.data.value?.foto
  if (!f?.requestedAt) return false
  return f.readAt === null || new Date(f.requestedAt) > new Date(f.readAt)
})

/**
 * Pide al agente que lea el padrón. NO espera: vuelve en el acto y la pantalla
 * se entera al volver a consultar. Atar este botón a que el reloj conteste
 * dejaría la pantalla colgada cada vez que el equipo está ocupado.
 */
async function pedirLectura(): Promise<void> {
  pidiendoLectura.value = true
  pushError.value = null
  try {
    await padronApi.refresh(deviceId)
    // Un respiro para que al agente le dé tiempo a ir y volver, y se vuelve a
    // consultar. Si aún no llegó, el aviso de «en vuelo» lo dice.
    await new Promise((r) => setTimeout(r, 2500))
    await buscar()
  } catch (e) {
    pushError.value = e as Error
  } finally {
    pidiendoLectura.value = false
  }
}

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

  // La marca se pone DESPUÉS de comparar: antes no se sabe si esa persona
  // siquiera difiere del reloj.
  if (destacado.value && rows.value.some((r) => r.externalUserId === destacado.value)) {
    elegidas.value = new Set([destacado.value])
  }
}

async function empujar(): Promise<void> {
  if (pushing.value || elegidas.value.size === 0) return
  pushing.value = true
  pushError.value = null
  try {
    resultado.value = await padronApi.sync(deviceId, [...elegidas.value])
    /*
     * «Encoladas», no «enviadas»: la orden viaja al reloj cuando el agente
     * pase por ella. Decir que ya está en el equipo sería mentir por un rato.
     */
    aviso.hecho(
      `${resultado.value.encoladas} órdenes encoladas`,
      resultado.value.rechazadas.length > 0
        ? `${resultado.value.rechazadas.length} no se pudieron encolar.`
        : 'El agente las llevará al reloj en su próxima vuelta.',
    )
    confirmando.value = false
    elegidas.value = new Set()
    await Promise.all([difs.run(), ordenes.run()])
  } catch (cause) {
    pushError.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    pushing.value = false
  }
}

const ESTADOS: Record<
  string,
  { label: string; color: 'neutral' | 'warning' | 'success' | 'error' }
> = {
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
    <!--
      Se llega aquí desde una baja o una reactivación. Se dice a quién se venía a
      arreglar, y se dice también cuando ya no hace falta: un padrón sin esa
      fila, sin explicación, se lee como que algo salió mal.
    -->
    <UAlert
      v-if="destacado"
      :icon="destacadoResuelto ? 'i-lucide-check' : 'i-lucide-user-round-cog'"
      :color="destacadoResuelto ? 'success' : 'info'"
      :title="
        destacadoResuelto
          ? `El número ${destacado} ya coincide con Astra`
          : `Vienes por el número ${destacado}`
      "
      :description="
        destacadoResuelto
          ? 'No queda nada que empujar para esa persona en este equipo.'
          : 'Compara el padrón y quedará marcado solo. Revisa lo que dice su fila antes de empujar.'
      "
    />

    <UAlert
      icon="i-lucide-info"
      color="neutral"
      title="Nada se escribe al pulsar el botón"
      description="Las correcciones se encolan y las aplica el agente en su siguiente ciclo. Si el reloj está apagado, esperan; no se pierden."
    />

    <!--
      COMPARAR NO PIDE CREDENCIALES. Se compara contra la última foto del
      padrón, que trae el agente: el servidor no ve el reloj y no debe verlo.
      Se dice de cuándo es la foto, porque una comparación sin fecha se lee
      como el estado de ahora mismo.
    -->
    <UCard>
      <template #header>
        <h2 class="font-medium">El padrón del equipo</h2>
      </template>

      <div class="flex flex-wrap items-center gap-3">
        <UButton
          icon="i-lucide-search"
          label="Comparar padrón"
          :loading="difs.pending.value"
          @click="buscar"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="Pedir lectura nueva"
          :loading="pidiendoLectura"
          @click="pedirLectura"
        />

        <p v-if="edadDeLaFoto" class="text-muted text-sm">
          Leído {{ edadDeLaFoto
          }}<span v-if="difs.data.value?.foto.usersCount !== null">
            · {{ difs.data.value?.foto.usersCount }} personas en el equipo</span
          >
        </p>
        <p v-else class="text-warning text-sm">
          Este equipo no se ha leído nunca. Pide una lectura antes de comparar.
        </p>
      </div>

      <p v-if="lecturaEnVuelo" class="text-muted mt-2 text-xs">
        <UIcon name="i-lucide-loader" class="size-3 align-[-2px]" />
        Se pidió una lectura y todavía no llega. El agente la trae en su siguiente ciclo; vuelve a
        comparar en un momento.
      </p>

      <p v-if="difs.data.value?.foto.lastError" class="text-error mt-2 text-xs">
        La última lectura falló: {{ difs.data.value?.foto.lastError }}
      </p>
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
      :description="`Las ${alDia} personas vinculadas coinciden en nombre, vigencia, bloqueo y permiso de puerta. Los acentos y las mayúsculas no cuentan como diferencia: «Gomez» y «Gómez» son la misma persona.`"
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
          <!-- La fila por la que se vino se distingue sin leer los cien números. -->
          <span
            class="font-mono text-xs"
            :class="row.original.externalUserId === destacado ? 'text-primary font-semibold' : ''"
            >{{ row.original.externalUserId }}</span
          >
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
            <div v-if="row.original.motivos.includes('inicio')">
              desde {{ diaLegible(row.original.inicio.enElEquipo) }}
            </div>
            <div v-if="row.original.motivos.includes('bloqueo')">
              {{ row.original.bloqueo.enElEquipo ? 'le abre' : 'bloqueado' }}
            </div>
            <!--
              Se dice qué significa, no el número de plantilla: «sin permiso»
              es la frase que explica por qué esa persona checa y no entra.
            -->
            <div v-if="row.original.motivos.includes('permiso')" class="text-error">
              {{
                row.original.permiso.enElEquipo
                  ? `plantilla ${row.original.permiso.enElEquipo}`
                  : 'sin permiso: checa y no abre'
              }}
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
            <div v-if="row.original.motivos.includes('inicio')">
              desde {{ diaLegible(row.original.inicio.enAstra) }}
            </div>
            <div v-if="row.original.motivos.includes('bloqueo')">
              {{ row.original.bloqueo.enAstra ? 'le abre' : 'bloqueado' }}
            </div>
            <div v-if="row.original.motivos.includes('permiso')">
              plantilla {{ row.original.permiso.enAstra }}
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
            Se manda el estado completo de cada persona —nombre, vigencia, bloqueo y permiso de
            puerta—, no solo lo que difiere: el equipo sustituye el registro entero en cada
            escritura. El número interno no cambia, así que sus marcajes anteriores siguen
            asociados.
          </p>
          <ul class="space-y-1 text-sm">
            <li v-for="ext in [...elegidas]" :key="ext" class="font-mono text-xs">
              {{ ext }} · {{ rows.find((r) => r.externalUserId === ext)?.nombre.enAstra }}
              <span class="text-dimmed">
                ({{
                  rows
                    .find((r) => r.externalUserId === ext)
                    ?.motivos.map(motivoLabel)
                    .join(', ')
                }})
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
