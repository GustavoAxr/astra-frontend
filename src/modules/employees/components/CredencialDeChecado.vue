<script setup lang="ts">
import { computed, ref } from 'vue'

import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAsync } from '@/shared/composables/useAsync'
import { useAviso } from '@/shared/ui/aviso'
import { credencialApi } from '@/modules/credencial/api'
import type { EmployeeDetail } from '../types'

/**
 * CHECAR CON EL TELÉFONO EN LA PUERTA: qué tiene esta persona.
 *
 * ══ QUÉ SE ESTÁ REPARTIENDO AQUÍ ══
 *
 * El cartel de la contingencia deja fichar con solo el número de empleado, y
 * ese número va escrito en el gafete. Esta credencial es la mitad que faltaba:
 * algo que solo esa persona puede presentar —la huella de su propio teléfono o
 * un PIN que inventa ella—. Mientras no la tenga, en la puerta sigue bastando
 * su número.
 *
 * ══ QUIEN MANDA LA INVITACIÓN NO VE EL CÓDIGO ══
 *
 * Y es a propósito. Si RRHH viera el código podría registrarle el PIN a
 * cualquiera y fichar por esa persona el resto del año, que es exactamente lo
 * que esto viene a impedir. El código sale hacia su buzón; de este lado solo
 * queda a dónde salió, enmascarado.
 *
 * ══ ESTO NO ES EL TRABAJO REMOTO ══
 *
 * La tarjeta de arriba habilita un EQUIPO para checar desde casa. Esta registra
 * a la PERSONA para checar EN SU CENTRO DE TRABAJO con el teléfono que traiga
 * ese día. Son dos accesos distintos y se revocan por separado: quitarle el
 * equipo de home office no le quita el PIN de la puerta.
 */
const props = defineProps<{ persona: EmployeeDetail; puedeDarAcceso: boolean }>()
const aviso = useAviso()

const acceso = useAsync((signal) => credencialApi.estado(props.persona.id, signal))
void acceso.run()

/** Solo pedimos una persona, así que solo puede venir una. */
const suyo = computed(() => (acceso.data.value ?? [])[0] ?? null)

const tieneAlgo = computed(() => suyo.value?.tienePasskey === true || suyo.value?.tienePin === true)

const invitando = ref(false)
const mandando = ref(false)
const quitando = ref(false)

/**
 * A dónde mandar la invitación, si no al correo del expediente.
 *
 * Vacío = al suyo. Vale solo para este envío: cambiar el correo del EXPEDIENTE
 * para resolver un envío mueve un dato permanente por una razón de un día.
 */
const correoAlterno = ref('')

/*
 * LOS TRES PASOS, TAL CUAL LOS VA A LEER LA OTRA PERSONA.
 *
 * Se enseñan ANTES de mandar la invitación para que quien la manda pueda
 * explicárselos por teléfono sin abrir el buzón ajeno. Un botón que manda un
 * correo cuyo contenido nadie de este lado conoce deja a RRHH sin poder ayudar
 * cuando esa persona pregunte.
 */
const PASOS = [
  'Abre el enlace EN EL TELÉFONO que lleva al trabajo. Es con el que va a checar en la puerta.',
  'Teclea el código de seis cifras del mismo correo. El enlace por sí solo no basta.',
  'Elige con qué se identifica: la huella o la cara de su teléfono, o un PIN que invente. Si su teléfono tiene huella, esa.',
]

async function mandarInvitacion(): Promise<void> {
  if (mandando.value) return
  mandando.value = true
  try {
    const r = await credencialApi.invitar(props.persona.id, correoAlterno.value.trim() || undefined)
    aviso.hecho(
      `Invitación enviada a ${r.enviadoA}`,
      'Caduca en 48 horas. Si se le pasa, vuelve a mandarla.',
    )
    invitando.value = false
    correoAlterno.value = ''
    await acceso.run()
  } catch (e) {
    aviso.fallo(e, 'mandar la invitación')
  } finally {
    mandando.value = false
  }
}

async function quitar(): Promise<void> {
  quitando.value = true
  try {
    await credencialApi.revocar(props.persona.id, 'todo')
    aviso.hecho(
      'Credencial revocada',
      'En la puerta vuelve a bastar su número hasta que registre otra.',
    )
    await acceso.run()
  } catch (e) {
    aviso.fallo(e, 'quitar la credencial')
  } finally {
    quitando.value = false
  }
}

const soloDia = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })
const dia = (iso: string | null): string => (iso ? soloDia.format(new Date(iso)) : '—')
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-highlighted font-semibold">Checar con el teléfono en la puerta</h2>
        <UBadge v-if="tieneAlgo" label="Registrada" color="success" size="sm" class="ml-auto" />
        <UBadge
          v-else-if="suyo?.invitacionViva"
          label="Invitación enviada"
          color="warning"
          size="sm"
          class="ml-auto"
        />
        <UBadge v-else label="Sin credencial" color="neutral" size="sm" class="ml-auto" />
      </div>
    </template>

    <div class="space-y-4">
      <ApiErrorAlert :error="acceso.error.value" />

      <!-- Lo que tiene, dicho por partes: se revocan por separado. -->
      <div v-if="suyo" class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span class="flex items-center gap-2">
          <UIcon
            name="i-lucide-fingerprint"
            :class="suyo.tienePasskey ? 'text-success size-4' : 'text-dimmed size-4'"
          />
          <span :class="suyo.tienePasskey ? 'text-default' : 'text-dimmed'">
            {{ suyo.tienePasskey ? 'Huella activada' : 'Sin huella' }}
          </span>
        </span>
        <span class="flex items-center gap-2">
          <UIcon
            name="i-lucide-lock-keyhole"
            :class="suyo.tienePin ? 'text-success size-4' : 'text-dimmed size-4'"
          />
          <span :class="suyo.tienePin ? 'text-default' : 'text-dimmed'">
            {{ suyo.tienePin ? 'PIN puesto' : 'Sin PIN' }}
          </span>
        </span>
        <span v-if="tieneAlgo && suyo.venceEl" class="text-muted">
          Vale hasta el {{ dia(suyo.venceEl) }}
        </span>
        <span v-else-if="tieneAlgo" class="text-muted">No vence</span>
      </div>

      <!--
        MIENTRAS NO TENGA NADA, EN LA PUERTA BASTA SU NÚMERO. Se dice con todas
        las letras: es la razón de existir de este botón, y sin decirla la
        tarjeta parece un ajuste opcional.
      -->
      <p v-if="!tieneAlgo" class="text-muted text-sm">
        Mientras no registre su huella o su PIN, en el cartel de la puerta basta con teclear su
        número de empleado — y ese número lo lleva escrito en el gafete.
      </p>

      <div v-if="suyo?.invitacionViva" class="border-default bg-elevated/50 border p-4 text-sm">
        <p class="text-default">
          Invitación enviada a <strong>{{ suyo.invitacionEnviadaA }}</strong>
        </p>
        <p class="text-muted text-xs">
          Caduca el {{ dia(suyo.invitacionVenceEl) }}. Volver a mandarla invalida esta.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          :label="suyo?.invitacionViva ? 'Volver a mandar la invitación' : 'Dar acceso'"
          icon="i-lucide-mail"
          :disabled="!puedeDarAcceso"
          @click="invitando = true"
        />
        <UButton
          v-if="tieneAlgo"
          label="Quitar su credencial"
          icon="i-lucide-shield-off"
          color="error"
          :disabled="!puedeDarAcceso"
          :loading="quitando"
          @click="quitar"
        />
      </div>
    </div>

    <!--
      QUÉ VA A LEER LA OTRA PERSONA, antes de mandarlo. Y el aviso de que el
      código no se ve de este lado: quien no lo sepa va a buscarlo en la
      pantalla cuando esa persona le diga que no le llegó.
    -->
    <UModal v-model:open="invitando" title="Dar acceso a checar con el teléfono">
      <template #body>
        <div class="space-y-4">
          <p class="text-muted text-sm">
            Le mandamos un correo con un enlace y un código de seis cifras. Esto es lo que va a
            leer:
          </p>
          <ol class="text-default list-decimal space-y-2 pl-5 text-sm">
            <li v-for="paso in PASOS" :key="paso">{{ paso }}</li>
          </ol>

          <UFormField
            label="Mandarlo a otro correo"
            help="Opcional. Si lo dejas vacío va al de su expediente. No cambia el expediente."
          >
            <UInput
              v-model="correoAlterno"
              type="email"
              placeholder="otro@correo.com"
              class="w-full"
            />
          </UFormField>

          <p class="text-dimmed text-xs">
            El código no se ve desde aquí, a propósito: si lo viéramos, cualquiera de nosotros
            podría registrarle el PIN y checar por esa persona.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Cancelar" @click="invitando = false" />
          <UButton
            label="Mandar la invitación"
            icon="i-lucide-mail"
            :loading="mandando"
            @click="mandarInvitacion"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
