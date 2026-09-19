<script setup lang="ts">
import { computed, ref } from 'vue'

import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import ConfirmDialog from '@/shared/ui/ConfirmDialog.vue'
import { useAsync } from '@/shared/composables/useAsync'
import { useAviso } from '@/shared/ui/aviso'
import { credencialApi } from '@/modules/credencial/api'
import type { EmployeeDetail } from '../types'

/**
 * CHECAR CON EL TELÉFONO EN LA PUERTA: qué tiene esta persona.
 *
 * ══ QUÉ SE ESTÁ REPARTIENDO AQUÍ ══
 *
 * El cartel de la puerta dejaba fichar con solo el número de empleado, y ese
 * número va escrito en el gafete. Esta credencial es la mitad que faltaba: algo
 * que solo esa persona puede presentar —la cara o la huella de su propio
 * teléfono, o un código que inventa ella—. Desde que existe, el cartel YA NO
 * acepta el número: quien no la tenga depende del reloj o de que le pasen
 * lista.
 *
 * ══ QUIEN MANDA LA INVITACIÓN NO VE EL CÓDIGO ══
 *
 * Y es a propósito. Si RRHH viera el código de la invitación podría registrarle
 * la credencial a cualquiera y fichar por esa persona el resto del año, que es
 * exactamente lo que esto viene a impedir. El código sale hacia su buzón; de este lado solo
 * queda a dónde salió, enmascarado.
 *
 * ══ ESTO NO ES EL TRABAJO REMOTO ══
 *
 * La tarjeta de arriba habilita un EQUIPO para checar desde casa. Esta registra
 * a la PERSONA para checar EN SU CENTRO DE TRABAJO con el teléfono que traiga
 * ese día. Son dos accesos distintos y se revocan por separado: quitarle el
 * equipo de home office no le quita la credencial de la puerta.
 */
const props = defineProps<{
  persona: EmployeeDetail
  puedeDarAcceso: boolean
}>()
const aviso = useAviso()

const acceso = useAsync((signal) => credencialApi.estado(props.persona.id, signal))
void acceso.run()

/** Solo pedimos una persona, así que solo puede venir una. */
const suyo = computed(() => (acceso.data.value ?? [])[0] ?? null)

const tieneAlgo = computed(() => suyo.value?.tienePasskey === true || suyo.value?.tienePin === true)

const invitando = ref(false)
const mandando = ref(false)
/** El diálogo que pregunta antes de dejar a alguien sin credencial. */
const quitandoAbierto = ref(false)

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
  'Teclea las seis cifras del mismo correo. El enlace por sí solo no basta.',
  'Registra las dos: un código de 4 a 6 números que invente él, y la cara o la huella de su teléfono. El código es la red de abajo para el día que el lector no lea.',
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

/**
 * QUITARLA PREGUNTA ANTES, y no es una formalidad.
 *
 * Deja a esa persona sin poder fichar con el teléfono desde ese mismo segundo,
 * y para volver a tenerla hay que mandarle otra invitación y que se registre de
 * nuevo: no se deshace pulsando otra vez. Un botón así, a un clic y al lado de
 * «Dar acceso», se pulsa por error.
 */
async function quitar(): Promise<void> {
  await credencialApi.revocar(props.persona.id, 'todo')
  aviso.hecho(
    'Credencial revocada',
    'Hasta que registre otra no puede checar con el teléfono en la puerta.',
  )
  await acceso.run()
}

const soloDia = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })
const dia = (iso: string | null): string => (iso ? soloDia.format(new Date(iso)) : '—')
</script>

<template>
  <!--
    UNA FILA, NO UNA TARJETA.

    Esto y el equipo de trabajo remoto son dos respuestas a la MISMA pregunta
    —¿con qué registra su jornada?— y viven dentro de «Cómo checa», que pone el
    marco. Aquí un borde y un título propios serían un marco dentro de otro, y
    tres renglones de aire para decir dos cosas.
  -->
  <div class="flex items-start gap-3">
    <UIcon name="i-lucide-scan-face" class="text-primary mt-0.5 size-4 shrink-0" />

    <div class="min-w-0 flex-1 space-y-2">
      <p class="text-highlighted text-sm">Teléfono en la puerta</p>

      <ApiErrorAlert :error="acceso.error.value" />

      <!-- Lo que tiene, en un renglón: se revocan por separado. -->
      <p v-if="tieneAlgo" class="text-muted text-xs">
        <span :class="suyo?.tienePasskey ? '' : 'text-dimmed'">
          {{ suyo?.tienePasskey ? 'Cara o huella' : 'sin cara ni huella' }}
        </span>
        ·
        <span :class="suyo?.tienePin ? '' : 'text-dimmed'">
          {{ suyo?.tienePin ? 'código' : 'sin código' }}
        </span>
        <template v-if="suyo?.venceEl"> · vale hasta el {{ dia(suyo.venceEl) }}</template>
        <template v-else> · no vence</template>
      </p>

      <!--
        MIENTRAS NO TENGA NADA, NO PUEDE CHECAR CON EL TELÉFONO. Se dice con
        todas las letras: es la razón de existir de este botón, y sin decirla
        parece un ajuste opcional.
      -->
      <p v-else class="text-muted text-xs">
        Sin credencial no puede checar con el teléfono: el cartel ya no acepta el número de
        empleado, que va escrito en el gafete. Depende del reloj o de que le pasen lista.
      </p>

      <p v-if="suyo?.invitacionViva" class="text-dimmed text-xs">
        Invitación enviada a <strong>{{ suyo.invitacionEnviadaA }}</strong> · caduca el
        {{ dia(suyo.invitacionVenceEl) }}. Volver a mandarla invalida esta.
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <!--
          CON CREDENCIAL YA PUESTA, DAR ACCESO NO HACE NADA ÚTIL: esa persona ya
          se registró. Mandarle otra invitación no le cambia nada —lo que tiene
          sigue valiendo— y confunde a quien la manda, que se queda esperando un
          cambio que no llega. El camino para reemplazarla es quitársela y
          volver a invitar, y se dice ahí mismo.
        -->
        <UButton
          v-if="!tieneAlgo"
          :label="suyo?.invitacionViva ? 'Reenviar invitación' : 'Dar acceso'"
          icon="i-lucide-mail"
          size="xs"
          :disabled="!puedeDarAcceso"
          @click="invitando = true"
        />
        <template v-else>
          <UButton
            label="Quitar su credencial"
            icon="i-lucide-shield-off"
            color="error"
            size="xs"
            :disabled="!puedeDarAcceso"
            @click="quitandoAbierto = true"
          />
          <span class="text-dimmed text-xs">
            Para darle otra —perdió el teléfono, olvidó su código— quítasela primero.
          </span>
        </template>
      </div>
    </div>

    <UBadge v-if="tieneAlgo" label="Registrada" color="success" size="sm" class="shrink-0" />
    <UBadge
      v-else-if="suyo?.invitacionViva"
      label="Invitación enviada"
      color="warning"
      size="sm"
      class="shrink-0"
    />
    <UBadge v-else label="Sin credencial" color="neutral" size="sm" class="shrink-0" />

    <ConfirmDialog
      v-model:open="quitandoAbierto"
      title="Quitar su credencial"
      :message="`${persona.firstName} dejará de poder checar con el teléfono en la puerta ahora mismo. Sus checadas anteriores no se tocan.`"
      warning="Para volver a tenerla hay que mandarle otra invitación y que la registre de nuevo: esto no se deshace pulsando otra vez."
      confirm-label="Quitar su credencial"
      confirm-icon="i-lucide-shield-off"
      confirm-color="error"
      :action="quitar"
    />

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
            El código de la invitación no se ve desde aquí, a propósito: si lo viéramos, cualquiera
            de nosotros podría registrarle la credencial y checar por esa persona.
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
  </div>
</template>
