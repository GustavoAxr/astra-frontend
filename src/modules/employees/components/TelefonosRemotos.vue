<script setup lang="ts">
import { computed, ref } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAsync } from '@/shared/composables/useAsync'
import { useAviso } from '@/shared/ui/aviso'
import ConfirmDialog from '@/shared/ui/ConfirmDialog.vue'
import { remotoApi } from '@/modules/remoto/api'
import type { EmployeeDetail } from '../types'

/**
 * CHECAR DESDE SU EQUIPO: en qué estado está esta persona.
 *
 * TELÉFONO O COMPUTADORA, Y UNO SOLO. Obligar a poner la aplicación de la
 * empresa en el teléfono PERSONAL es donde esto se atascaba: mucha gente no
 * quiere, y quien trabaja desde casa ya tiene una computadora delante ocho
 * horas al día. Vale cualquiera de los dos — pero uno, y lo impone el servidor:
 * dar uno de alta revoca el anterior.
 *
 * ══ ES UNA FILA DE «CÓMO CHECA», NO UNA TARJETA ══
 *
 * Y se pinta solo cuando la adscripción de hoy dice «a distancia»: eso es LO
 * ÚNICO que habilita este camino, y quien lo decide es el expediente. Para el
 * caso contrario, la fila se queda apagada con un «no aplica» que dice dónde
 * está el interruptor.
 *
 * ══ QUÉ SE ENSEÑA Y QUÉ SE QUITÓ ══
 *
 * Con equipo dado de alta: cuándo se dio, cuándo checó por última vez y cuándo
 * vence — y NO el botón de habilitarlo, que seguía ahí ofreciendo mandar otro
 * enlace cuyo uso tira el equipo que esa persona ya tenía funcionando. De los
 * equipos revocados basta cuántos son: sus fechas ya no valen para nada.
 *
 * Se fue también el camino del código por WhatsApp —el enlace común de la
 * empresa y el aviso del número confirmado—: ese código no sale del servidor
 * con WhatsApp apagado, así que era una puerta pintada. Lo que funciona es el
 * enlace por correo, que ya trae el código dentro.
 *
 */
const props = defineProps<{ persona: EmployeeDetail; puedeRevocar: boolean }>()
const aviso = useAviso()

const telefonos = useAsync((signal) => remotoApi.telefonos(props.persona.id, signal))
void telefonos.run()

/** Los que siguen valiendo. Un revocado se queda en la lista, apagado. */
const vigentes = computed(() => (telefonos.data.value ?? []).filter((t) => t.revokedAt === null))

/**
 * UN EQUIPO POR PERSONA, así que el suyo es el único vivo.
 *
 * El servidor revoca el anterior al dar de alta uno nuevo, de modo que aquí hay
 * cero o uno. La tabla de tres columnas que había enseñaba también los
 * revocados, y en una tercera parte del ancho se partía en cuatro renglones por
 * fila para repetir fechas que ya no valen: de los caídos basta cuántos son.
 */
const elSuyo = computed(() => vigentes.value[0] ?? null)
const revocados = computed(
  () => (telefonos.data.value ?? []).filter((t) => t.revokedAt !== null).length,
)

/** El diálogo que pregunta antes de dejar a alguien sin equipo. */
const revocandoAbierto = ref(false)

/** El modal que explica qué va a pasar antes de mandar el correo. */
const invitando = ref(false)
const mandando = ref(false)
const renovando = ref<string | null>(null)

/**
 * A dónde mandar el enlace, si no es el correo del expediente.
 *
 * Vacío = al suyo. Existe por el caso que puso el cliente: «no tengo el correo
 * de la empresa en el teléfono, mándamelo a este otro». Sin esto esa persona se
 * queda sin poder checar, o RRHH le cambia el correo del EXPEDIENTE para
 * resolver un envío — que es peor: mueve un dato permanente por una razón de un
 * día. Queda registrado a dónde fue.
 */
const correoAlterno = ref('')

/**
 * Un equipo que vence dentro de dos semanas ya se puede renovar.
 *
 * El aviso de la una de la mañana lo anuncia con una semana; aquí se ofrece con
 * dos, para que quien entra al expediente por otra cosa pueda resolverlo de
 * paso en vez de esperar el correo.
 */
const DIAS_PARA_OFRECER_RENOVAR = 14
function porVencer(iso: string): boolean {
  return (new Date(iso).getTime() - Date.now()) / 86_400_000 <= DIAS_PARA_OFRECER_RENOVAR
}

async function renovar(id: string): Promise<void> {
  renovando.value = id
  try {
    const r = await remotoApi.renovar(id)
    aviso.hecho('Equipo renovado', `Ahora vence el ${soloDia.format(new Date(r.venceEl))}.`)
    await telefonos.run()
  } catch (e) {
    aviso.fallo(e, 'renovar el equipo')
  } finally {
    renovando.value = null
  }
}

/**
 * LOS TRES PASOS, TAL CUAL LOS VA A LEER LA OTRA PERSONA.
 *
 * Se enseñan aquí ANTES de mandar el correo, y no es adorno: quien lo manda
 * tiene que poder explicárselo por teléfono sin abrir el buzón ajeno —«te va a
 * llegar un enlace, ábrelo en el celular»—. Un botón que manda un correo cuyo
 * contenido nadie de este lado conoce deja a RRHH sin poder ayudar cuando esa
 * persona pregunte.
 */
const PASOS = [
  'Abre el enlace EN EL EQUIPO con el que va a checar todos los días: su teléfono o su computadora, el que prefiera. Queda dado de alta ese, y solo ese.',
  'Confirma con su huella o su cara cuando el equipo se lo pida. Es lo que impide que alguien cheque por él.',
  'Si es un teléfono, lo añade a su pantalla de inicio cuando se lo indiquemos: así entra de un toque y no busca el correo cada día.',
]

async function mandarInvitacion(): Promise<void> {
  if (mandando.value) return
  mandando.value = true
  try {
    const r = await remotoApi.invitarPorCorreo(
      props.persona.id,
      correoAlterno.value.trim() || undefined,
    )
    aviso.hecho(
      `Enlace enviado a ${r.enviadoA}`,
      'Caduca en 48 horas y sirve una sola vez. Si se le pasa, vuelve a mandarlo.',
    )
    invitando.value = false
    correoAlterno.value = ''
  } catch (e) {
    aviso.fallo(e, 'mandar el enlace')
  } finally {
    mandando.value = false
  }
}

/**
 * REVOCAR PREGUNTA ANTES, igual que quitar la credencial de la puerta.
 *
 * Deja a esa persona sin poder checar desde ese segundo y no se deshace
 * pulsando otra vez: hay que mandarle otro enlace y que dé de alta el equipo de
 * nuevo. Un botón así, a un clic, se pulsa por error.
 */
async function revocar(): Promise<void> {
  const suyo = elSuyo.value
  if (suyo === null) return
  await remotoApi.revocar(suyo.id)
  aviso.hecho('Equipo revocado', 'Desde ese aparato ya no se puede checar.')
  await telefonos.run()
}

const sello = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const cuando = (iso: string | null): string => (iso ? sello.format(new Date(iso)) : '—')
const soloDia = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })
</script>

<template>
  <!--
    UNA FILA, NO UNA TARJETA.

    Esto y la credencial de la puerta son dos respuestas a la MISMA pregunta
    —¿con qué registra su jornada?— y viven dentro de «Cómo checa», que pone el
    marco. Un borde y un título propios aquí serían un marco dentro de otro.
  -->
  <div class="flex items-start gap-3">
    <UIcon name="i-lucide-house" class="text-primary mt-0.5 size-4 shrink-0" />

    <div class="min-w-0 flex-1 space-y-2">
      <p class="text-highlighted text-sm">Desde su equipo, a distancia</p>

      <ApiErrorAlert :error="telefonos.error.value" />

      <p v-if="telefonos.pending.value && !telefonos.loaded.value" class="text-muted text-xs">
        Un momento…
      </p>

      <!--
        CON EQUIPO DADO DE ALTA NO SE OFRECE HABILITARLO: ya está. El botón
        seguía ahí mandando otro enlace que, al usarse, tiraba el equipo que esa
        persona ya tenía funcionando — la forma más rápida de dejar sin checar a
        alguien que no había pedido nada.

        Y las fechas caben en dos renglones: alta, último uso y vigencia. La
        tabla de antes gastaba tres columnas y cuatro renglones por fila para
        decir lo mismo, dentro de una tarjeta que ocupa un tercio del ancho.
      -->
      <template v-else-if="elSuyo">
        <p class="text-muted text-xs">
          Dado de alta el {{ soloDia.format(new Date(elSuyo.verifiedAt)) }}
          <template v-if="elSuyo.label"> · {{ elSuyo.label }}</template>
        </p>
        <p class="text-muted text-xs">Última checada: {{ cuando(elSuyo.lastUsedAt) }}</p>
        <p class="text-xs" :class="porVencer(elSuyo.expiresAt) ? 'text-warning' : 'text-muted'">
          Vence el {{ soloDia.format(new Date(elSuyo.expiresAt)) }}
        </p>

        <!--
          DE BAJA: EL ALTA SE PAUSA, NO SE PIERDE. Las dos cosas son ciertas a la
          vez y las dos hay que decirlas — sin la segunda, alguien revoca «porque
          ya no sirve» cuando lo único que hacía falta era reactivar a la persona.
        -->
        <p v-if="!persona.isActive" class="text-warning text-xs">
          Está dado de baja, así que estos días no puede checar desde ningún equipo. Su alta no se
          pierde: al reactivarlo vuelve a funcionar sola.
        </p>

        <div v-if="puedeRevocar" class="flex flex-wrap items-center gap-2">
          <!--
            RENOVAR SOLO CUANDO SE ACERCA. Un botón que está siempre se pulsa por
            costumbre y convierte los noventa días en permanentes, que es lo
            contrario de tener vigencia.
          -->
          <UButton
            v-if="porVencer(elSuyo.expiresAt)"
            label="Renovar"
            icon="i-lucide-refresh-cw"
            size="xs"
            :loading="renovando === elSuyo.id"
            @click="renovar(elSuyo.id)"
          />
          <UButton
            label="Revocar"
            icon="i-lucide-shield-x"
            color="error"
            size="xs"
            @click="revocandoAbierto = true"
          />
        </div>
      </template>

      <!-- Sin equipo: el único camino es mandarle su enlace. -->
      <template v-else>
        <p class="text-muted text-xs">
          Todavía no ha dado de alta ningún equipo. El enlace le llega por correo, caduca en 48
          horas y sirve una vez.
        </p>
        <UButton
          label="Habilitar chequeo remoto"
          icon="i-lucide-mail"
          size="xs"
          :disabled="!puedeRevocar"
          @click="invitando = true"
        />
      </template>

      <!--
        De los equipos caídos basta cuántos son: sus fechas ya no valen para
        nada y en esta anchura solo empujan hacia abajo lo que sí importa.
      -->
      <p v-if="revocados > 0" class="text-dimmed text-xs">
        {{ revocados }} {{ revocados === 1 ? 'equipo revocado' : 'equipos revocados' }} antes.
        Revocar no borra: las checadas que hizo siguen constando con su origen.
      </p>
    </div>

    <ConfirmDialog
      v-model:open="revocandoAbierto"
      title="Revocar su equipo"
      :message="`${persona.firstName} dejará de poder checar desde ese aparato ahora mismo. Las checadas que ya hizo no se tocan.`"
      warning="Para volver a tenerlo hay que mandarle otro enlace y que lo dé de alta de nuevo: esto no se deshace pulsando otra vez."
      confirm-label="Revocar el equipo"
      confirm-icon="i-lucide-shield-x"
      confirm-color="error"
      :action="revocar"
    />

    <UModal v-model:open="invitando" title="Habilitar chequeo remoto">
      <template #body>
        <div class="space-y-4">
          <p class="text-muted text-sm">
            Le vamos a mandar a <strong>{{ persona.firstName }}</strong> un correo con un enlace
            propio. Esto es lo que va a leer:
          </p>

          <ol class="text-default border-default space-y-2 border p-4 text-sm">
            <li v-for="(paso, i) in PASOS" :key="i" class="flex gap-2">
              <span class="text-dimmed font-mono">{{ i + 1 }}.</span>
              <span>{{ paso }}</span>
            </li>
          </ol>

          <!--
            LO QUE MÁS SE MALENTIENDE, DICHO ANTES DE MANDARLO.

            Ya no es «que no lo abra en la computadora» —la computadora vale—,
            sino que el alta se queda EN EL APARATO QUE ABRE EL ENLACE, y que
            ese aparato es UNO. Quien pulsa este botón tiene que poder decírselo
            por teléfono: si lo abre en el equipo equivocado, el enlace se gastó
            y hay que mandarle otro.
          -->
          <UAlert icon="i-lucide-monitor-smartphone" color="warning">
            <template #description>
              El enlace <strong>caduca en 48 horas y sirve una sola vez</strong>, y da de alta
              <strong>el equipo en el que se abra</strong> — su teléfono o su computadora, el que él
              prefiera. Si lo abre en otro, se gastó y habrá que mandarle otro.
            </template>
          </UAlert>

          <!--
            Y LO QUE LE PASA AL ANTERIOR, dicho aquí y no descubierto el lunes.
            Solo se pinta si hay algo que tirar: decírselo a quien no tiene
            ninguno sería inventarle un problema.
          -->
          <UAlert v-if="vigentes.length > 0" icon="i-lucide-replace" color="warning">
            <template #description>
              Ya tiene <strong>{{ vigentes.length }}</strong>
              {{ vigentes.length === 1 ? 'equipo dado de alta' : 'equipos dados de alta' }}. En
              cuanto dé de alta el nuevo, {{ vigentes.length === 1 ? 'ese deja' : 'esos dejan' }}
              de poder checar: es un equipo por persona.
            </template>
          </UAlert>

          <!--
            EL CORREO ALTERNATIVO, para «no tengo el de la empresa en el
            teléfono». NO cambia su expediente: vale para este envío y nada
            más. Se dice, porque si no alguien va a creer que sí lo cambió.
          -->
          <UFormField
            label="Mandarlo a otro correo"
            help="Opcional. Vacío = al correo de su expediente. No cambia su expediente: vale solo para este envío, y queda registrado a dónde fue."
          >
            <UInput
              v-model="correoAlterno"
              type="email"
              :placeholder="persona.email ?? 'fermin.jimenez@gmail.com'"
              class="w-full"
            />
          </UFormField>

          <p v-if="!persona.email && !correoAlterno.trim()" class="text-error text-sm">
            No tiene correo en su expediente. Escribe arriba a dónde mandarlo, o captúraselo con
            «Editar».
          </p>

          <div class="flex justify-end gap-2 pt-2">
            <UButton label="Cancelar" :disabled="mandando" @click="invitando = false" />
            <UButton
              label="Mandar el enlace"
              icon="i-lucide-send"
              :loading="mandando"
              :disabled="!persona.email && !correoAlterno.trim()"
              @click="mandarInvitacion"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UBadge
      :label="
        vigentes.length === 0
          ? 'Sin equipo'
          : `${vigentes.length} ${vigentes.length === 1 ? 'equipo' : 'equipos'}`
      "
      :color="vigentes.length === 0 ? 'neutral' : 'success'"
      size="sm"
      class="shrink-0"
    />
  </div>
</template>
