<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/shared/api/errors'
import { useAviso } from '@/shared/ui/aviso'
import { outboxApi } from '../api'
import { ESTADO, TIPO, type CorreoEnBandeja, type EstadoDeCorreo } from '../types'

/**
 * QUÉ CORREOS SALIERON Y CUÁLES NO.
 *
 * Sin esta pantalla la bandeja existía y nadie la miraba: un correo que se daba
 * por perdido se quedaba en la tabla sin que nadie se enterara, y quien dio el
 * alta seguía creyendo que esa persona ya sabía su clave. Eso se descubre el
 * lunes, en la puerta.
 *
 * EL ORDEN ES EL DE LA URGENCIA, no el cronológico: primero lo que hay que
 * atender —lo perdido—, y el histórico debajo. Una bandeja ordenada por fecha
 * esconde el único renglón que pedía algo.
 */
const aviso = useAviso()

const correos = ref<CorreoEnBandeja[]>([])
const cargando = ref(true)
const error = ref<string | null>(null)
const filtro = ref<EstadoDeCorreo | 'todos'>('todos')
const abierto = ref<string | null>(null)
const reintentando = ref<string | null>(null)

const perdidos = computed(() => correos.value.filter((c) => c.status === 'failed'))
const enCamino = computed(() =>
  correos.value.filter((c) => c.status === 'pending' || c.status === 'sending'),
)

const visibles = computed(() =>
  filtro.value === 'todos'
    ? correos.value
    : correos.value.filter((c) => c.status === filtro.value),
)

const pestañas = computed(() => [
  { label: `Todos · ${correos.value.length}`, value: 'todos' as const },
  { label: `Se dieron por perdidos · ${perdidos.value.length}`, value: 'failed' as const },
  { label: `En camino · ${enCamino.value.length}`, value: 'pending' as const },
  {
    label: `Entregados · ${correos.value.filter((c) => c.status === 'sent').length}`,
    value: 'sent' as const,
  },
])

async function cargar(): Promise<void> {
  cargando.value = true
  error.value = null
  try {
    // Se traen todos y se filtra aquí: son cien como mucho, y así cambiar de
    // pestaña no cuesta una ida al servidor ni parpadea la lista.
    correos.value = await outboxApi.list(undefined)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude traer la bandeja'
  } finally {
    cargando.value = false
  }
}

async function reintentar(c: CorreoEnBandeja): Promise<void> {
  reintentando.value = c.id
  try {
    await outboxApi.reintentar(c.id)
    aviso.hecho('Correo reencolado', `Vuelve a intentarse con ${c.toEmail}.`)
    await cargar()
  } catch (e) {
    aviso.fallo(e, 'reencolar el correo')
  } finally {
    reintentando.value = null
  }
}

const cuando = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

onMounted(cargar)
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1">
        <h1 class="text-highlighted text-xl font-semibold">Correos que manda Astra</h1>
        <p class="text-muted mt-1 text-sm">
          Cada alta manda a la persona su número, su clave y a dónde entra. Aquí se ve cuáles
          salieron y cuáles no.
        </p>
      </div>
      <UButton label="Actualizar" icon="i-lucide-refresh-cw" size="sm" @click="cargar" />
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

    <!--
      El aviso va arriba y solo cuando hay algo perdido. Un panel que siempre
      enseña un número, aunque sea cero, se deja de mirar a la semana.
    -->
    <UAlert
      v-if="perdidos.length > 0"
      color="error"
      icon="i-lucide-mail-x"
      :title="
        perdidos.length === 1
          ? 'Un correo no llegó a su destino'
          : `${perdidos.length} correos no llegaron a su destino`
      "
      :description="ESTADO.failed.accion"
    />

    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="p in pestañas"
        :key="p.value"
        :label="p.label"
        size="xs"
        :active="filtro === p.value"
        @click="filtro = p.value"
      />
    </div>

    <p v-if="cargando" class="text-muted text-sm">Cargando…</p>

    <p v-else-if="visibles.length === 0" class="text-dimmed text-sm">
      {{ correos.length === 0 ? 'Todavía no se ha mandado ningún correo.' : 'Nada aquí.' }}
    </p>

    <div v-else class="space-y-2">
      <div v-for="c in visibles" :key="c.id" class="border-default rounded-lg border">
        <div class="flex flex-wrap items-start gap-3 p-4">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :label="ESTADO[c.status].label" :color="ESTADO[c.status].color" size="sm" />
              <span class="text-highlighted truncate text-sm font-medium">
                {{ c.toName ?? c.toEmail }}
              </span>
              <span class="text-dimmed text-xs">{{ TIPO[c.kind] ?? c.kind }}</span>
            </div>
            <p class="text-muted mt-1 text-xs">{{ c.toEmail }}</p>
            <p class="text-default mt-1 truncate text-sm">{{ c.subject }}</p>

            <p class="text-dimmed mt-1 text-xs">
              Escrito {{ cuando(c.createdAt) }}
              <template v-if="c.sentAt"> · entregado {{ cuando(c.sentAt) }}</template>
              <template v-else-if="c.attempts > 0">
                · {{ c.attempts }} {{ c.attempts === 1 ? 'intento' : 'intentos' }}
              </template>
            </p>

            <!--
              El motivo del fallo, tal cual lo dijo el servidor de correo. No se
              traduce ni se resume: «Mailbox not found» le dice a quien sabe
              exactamente qué corregir, y un «hubo un problema» no le dice nada
              a nadie.
            -->
            <p v-if="c.lastError" class="text-error mt-2 font-mono text-xs break-all">
              {{ c.lastError }}
            </p>
          </div>

          <div class="flex gap-2">
            <UButton
              :label="abierto === c.id ? 'Ocultar' : 'Ver correo'"
              :icon="abierto === c.id ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              size="xs"
              @click="abierto = abierto === c.id ? null : c.id"
            />
            <UButton
              v-if="c.status === 'failed'"
              label="Reenviar"
              icon="i-lucide-send"
              size="xs"
              color="warning"
              :loading="reintentando === c.id"
              @click="reintentar(c)"
            />
          </div>
        </div>

        <!--
          Se enseña el TEXTO PLANO y no el HTML: es lo que se manda de verdad
          para los buzones que no pintan, se lee entero de un vistazo, y evita
          meter en esta pantalla el HTML de otro sistema.
        -->
        <pre
          v-if="abierto === c.id"
          class="border-default bg-elevated/50 text-default overflow-x-auto border-t p-4 text-xs whitespace-pre-wrap"
          >{{ c.bodyText }}</pre
        >
      </div>
    </div>
  </div>
</template>
