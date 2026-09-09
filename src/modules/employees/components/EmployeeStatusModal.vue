<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import { useAuthStore } from '@/modules/auth/store'
import { padronApi } from '@/modules/padron/api'
import type { Divergencia, SyncResult } from '@/modules/padron/types'
import { motivoLabel } from '@/modules/padron/motivo'
import { employeesApi } from '../api'
import type { EmployeeEnrollment } from '../types'

/**
 * DAR DE BAJA Y REACTIVAR, CON EL RELOJ EN LA MISMA PANTALLA.
 *
 * Antes eran dos sitios: se daba la baja aquí y había que acordarse de ir a
 * Equipos → Padrón del reloj a cerrarle el acceso. Nadie se acuerda, y lo que
 * queda abierto es una puerta: alguien que ya no trabaja aquí entrando el lunes
 * con su huella.
 *
 * Así que el segundo paso viene detrás del primero, y solo alcanza a esta
 * persona: no es el padrón entero, que es otra pantalla y otra decisión.
 *
 * LAS CREDENCIALES DEL EQUIPO son para PREGUNTARLE cómo tiene hoy a esa
 * persona —lo que se ha estado dando por supuesto dos veces y era falso—. No
 * son un permiso: la orden se encola aunque el reloj esté apagado, porque para
 * eso existe la cola, y quien escribe es el agente con las suyas.
 *
 * SIGUE SIN ESCRIBIRSE NADA AL PULSAR. La orden se encola y la aplica el agente
 * en su siguiente ciclo; si el reloj está apagado, espera.
 */
const props = defineProps<{
  employeeId: string
  fullName: string
  isActive: boolean
  enrollments: EmployeeEnrollment[]
}>()
/**
 * `changed` — cambió el expediente (baja o alta), hay que recargar.
 * `pushed`  — además se encoló la orden del reloj, así que no queda pendiente.
 */
const emit = defineEmits<{ changed: []; pushed: [] }>()
const aviso = useAviso()

const open = defineModel<boolean>('open', { default: false })

/** Entra en el paso del reloj sin pasar por la confirmación: ya se dio la baja. */
const soloElReloj = defineModel<boolean>('soloElReloj', { default: false })

const auth = useAuthStore()
/** Encolar es de RRHH y del administrador. Regla 6: oculta, no protege. */
const canPush = computed(() => auth.can('assignEmployee'))

type Paso = 'confirmar' | 'reloj'
const paso = ref<Paso>('confirmar')

/**
 * Qué hacer en el equipo.
 *
 * `cerrar` es lo que se quiere casi siempre: la vigencia vencida le cierra la
 * puerta a la huella, a la tarjeta y a la clave por igual, la persona sigue
 * enrolada y reactivarla la devuelve entera. `retirar` destruye: se lleva sus
 * huellas —que en este equipo solo se dan de alta con el dedo delante— y sus
 * checadas futuras caerían en la bandeja de sin dueño.
 */
type Accion = 'cerrar' | 'abrir' | 'retirar' | 'nada'
const accion = ref<Accion>('cerrar')

const deviceId = ref('')
const username = ref('admin')
const password = ref('')

const trabajando = ref(false)
const error = ref<Error | null>(null)
const resultado = ref<SyncResult | null>(null)

/**
 * CÓMO ESTÁ AHORA EN EL RELOJ, preguntado al propio equipo.
 *
 * Es para lo que sirve la contraseña, y hacía falta: dos veces se dio una baja
 * creyendo que cerraba la puerta y el equipo seguía dejando entrar. Aquí se ve
 * antes de mandar nada.
 *
 * Es OPCIONAL a propósito. Si el reloj está apagado no se puede preguntar, y
 * ese es justo el día en que hay que poder encolar la orden igual: para eso
 * existe la cola. `comprobado` distingue «coincide con Astra» de «no se ha
 * mirado», que son cosas muy distintas y se leen igual si no se dicen.
 */
const comprobado = ref(false)
const enElEquipo = ref<Divergencia | null>(null)
const comprobando = ref(false)

/** Lo que hará el botón del primer paso. */
const daráDeBaja = computed(() => props.isActive)

/**
 * Cómo queda la persona cuando se llega al paso del reloj.
 *
 * NO se puede mirar `props.isActive` aquí: para cuando se llega, el cambio ya
 * se guardó y ese dato está a medio camino —el expediente se recarga aparte—.
 * Confiarse en él ofrecía «devolverle el acceso» justo después de darle de
 * baja, que es la orden contraria a la que se acababa de pedir.
 */
const activoAhora = ref(false)

const equipos = computed(() =>
  props.enrollments.map((e) => ({
    label: `${e.deviceLabel} · ${e.externalUserId}`,
    value: e.deviceId,
  })),
)
const enrolamiento = computed(
  () => props.enrollments.find((e) => e.deviceId === deviceId.value) ?? null,
)

const ACCIONES = computed(() =>
  !activoAhora.value
    ? [
        {
          value: 'cerrar' as const,
          label: 'Cerrarle el acceso',
          ayuda:
            'Se le vence la vigencia: deja de abrir con huella, tarjeta y clave. Sigue enrolado, así que reactivarlo lo devuelve entero.',
        },
        {
          value: 'retirar' as const,
          label: 'Quitarlo del reloj',
          ayuda:
            'Se borra del equipo y PIERDE SUS HUELLAS: solo se dan de alta con el dedo delante del aparato. Si vuelve, hay que enrolarlo otra vez.',
        },
        { value: 'nada' as const, label: 'No tocar el reloj ahora', ayuda: '' },
      ]
    : [
        {
          value: 'abrir' as const,
          label: 'Devolverle el acceso',
          ayuda: 'Se le reabre la vigencia y vuelve a entrar con lo que ya tenía enrolado.',
        },
        { value: 'nada' as const, label: 'No tocar el reloj ahora', ayuda: '' },
      ],
)

const ayudaDeLaAccion = computed(
  () => ACCIONES.value.find((a) => a.value === accion.value)?.ayuda ?? '',
)

const credencialesPuestas = computed(
  () => deviceId.value !== '' && username.value.trim() !== '' && password.value !== '',
)

const puedeEmpujar = computed(() => accion.value === 'nada' || credencialesPuestas.value)

/** Lo que el equipo tiene hoy, dicho en una línea. */
const comoEstaAhora = computed(() => {
  if (!comprobado.value) return null
  const d = enElEquipo.value
  if (!d) return 'Coincide con lo que dice Astra. No hay nada que corregir.'
  return `Difiere en ${d.motivos.map(motivoLabel).join(', ').toLowerCase()}${
    d.bloqueo.enElEquipo === true ? ' — el reloj le está dejando entrar' : ''
  }.`
})

async function comprobar(): Promise<void> {
  if (comprobando.value || !credencialesPuestas.value) return
  comprobando.value = true
  error.value = null
  try {
    const estado = await padronApi.state(deviceId.value, username.value.trim(), password.value)
    const ext = enrolamiento.value?.externalUserId
    enElEquipo.value = estado.divergencias.find((d) => d.externalUserId === ext) ?? null
    comprobado.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    comprobando.value = false
  }
}

watch(
  open,
  (abierto) => {
    if (!abierto) {
      // La contraseña del equipo vive lo justo y se olvida al cerrar.
      password.value = ''
      error.value = null
      resultado.value = null
      soloElReloj.value = false
      return
    }

    paso.value = soloElReloj.value ? 'reloj' : 'confirmar'
    // Al entrar directo al reloj, la persona ya está como está. Al pasar por la
    // confirmación, quedará al revés de como entró.
    activoAhora.value = soloElReloj.value ? props.isActive : !props.isActive
    accion.value = activoAhora.value ? 'abrir' : 'cerrar'
    deviceId.value = props.enrollments[0]?.deviceId ?? ''
    resultado.value = null
    error.value = null
    comprobado.value = false
    enElEquipo.value = null
  },
  { immediate: true },
)

async function confirmar(): Promise<void> {
  if (trabajando.value) return
  trabajando.value = true
  error.value = null

  try {
    if (daráDeBaja.value) await employeesApi.deactivate(props.employeeId)
    else await employeesApi.update(props.employeeId, { isActive: true })

    /*
     * Se avisa del EXPEDIENTE aquí, aunque el modal siga abierto para el paso
     * del reloj: son dos cosas distintas y la primera ya es definitiva. Si el
     * segundo paso falla, tiene que quedar claro que la baja sí quedó.
     */
    aviso.actualizado(
      props.fullName,
      daráDeBaja.value ? 'Dado de baja en el expediente.' : 'Reactivado en el expediente.',
    )
    emit('changed')
    activoAhora.value = !daráDeBaja.value
    accion.value = activoAhora.value ? 'abrir' : 'cerrar'

    // Sin enrolamiento no hay nada que llevar al reloj, y una pantalla que
    // pregunta por un equipo inexistente solo confunde.
    if (props.enrollments.length === 0 || !canPush.value) {
      open.value = false
      return
    }
    paso.value = 'reloj'
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    trabajando.value = false
  }
}

async function empujar(): Promise<void> {
  if (trabajando.value || !puedeEmpujar.value) return

  if (accion.value === 'nada') {
    open.value = false
    return
  }

  const ext = enrolamiento.value?.externalUserId
  if (!ext) return

  trabajando.value = true
  error.value = null

  try {
    const usuario = username.value.trim()
    resultado.value =
      accion.value === 'retirar'
        ? await padronApi.remove(deviceId.value, usuario, password.value, [ext])
        : await padronApi.sync(deviceId.value, usuario, password.value, [ext])
    password.value = ''
    aviso.hecho(
      accion.value === 'retirar' ? 'Retirado del reloj' : 'Enviado al reloj',
      props.fullName,
    )
    emit('changed')
    emit('pushed')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    trabajando.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="
      paso === 'reloj' ? 'Y ahora el reloj' : daráDeBaja ? 'Dar de baja' : 'Reactivar'
    "
    :description="fullName"
  >
    <template #body>
      <div v-if="paso === 'confirmar'" class="space-y-4">
        <p class="text-muted text-sm">
          <template v-if="daráDeBaja">
            {{ fullName }} dejará de aparecer en la plantilla. Su historia —adscripciones, marcajes
            y asistencia— se conserva intacta.
          </template>
          <template v-else>{{ fullName }} volverá a aparecer en la plantilla.</template>
        </p>

        <UAlert
          v-if="daráDeBaja"
          icon="i-lucide-triangle-alert"
          color="warning"
          title="Esto NO registra el motivo de la baja"
          description="Regístralo aparte en Vida laboral, que es lo que queda como constancia."
        />

        <!--
          Se anuncia el segundo paso ANTES de pulsar: quien da la baja tiene que
          saber que va a necesitar la contraseña del reloj, no descubrirlo con
          el diálogo ya abierto.
        -->
        <p v-if="enrollments.length && canPush" class="text-dimmed text-sm">
          Después se te pedirá qué hacer en el reloj, que es otro aparato y no se entera de esto
          solo. Ten a mano las credenciales del equipo.
        </p>
        <p v-else-if="enrollments.length" class="text-warning text-sm">
          Está enrolado en un reloj y tu perfil no puede escribir en los equipos. Pídeselo a
          Recursos Humanos o al administrador: hasta entonces seguirá abriendo la puerta.
        </p>

        <ApiErrorAlert :error="error" />

        <div class="flex justify-end gap-2">
          <UButton label="Cancelar" @click="open = false" />
          <UButton
            :label="daráDeBaja ? 'Dar de baja' : 'Reactivar'"
            :loading="trabajando"
            @click="confirmar"
          />
        </div>
      </div>

      <div v-else class="space-y-4">
        <UAlert
          v-if="resultado"
          icon="i-lucide-check"
          color="success"
          :title="`${resultado.encoladas} ${resultado.encoladas === 1 ? 'orden encolada' : 'órdenes encoladas'}`"
          :description="
            resultado.rechazadas.length
              ? resultado.rechazadas.map((r) => `${r.id}: ${r.motivo}`).join(' · ')
              : 'El agente la aplicará en su siguiente ciclo. Si el reloj está apagado, espera; no se pierde.'
          "
        />

        <template v-else>
          <p class="text-muted text-sm">
            <template v-if="!activoAhora">
              En Astra ya está dado de baja. El reloj es otro aparato y no se entera solo: hasta que
              se le mande la orden, sigue abriendo la puerta con su huella.
            </template>
            <template v-else>
              En Astra ya está activo. Falta devolverle el acceso al reloj.
            </template>
          </p>

          <UFormField v-if="equipos.length > 1" label="En qué reloj">
            <USelectMenu
              v-model="deviceId"
              :items="equipos"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <p v-else-if="enrolamiento" class="text-dimmed text-sm">
            {{ enrolamiento.deviceLabel }} · número
            <span class="font-mono">{{ enrolamiento.externalUserId }}</span>
          </p>

          <UFormField label="Qué hacer">
            <URadioGroup v-model="accion" :items="ACCIONES" value-key="value" />
          </UFormField>
          <p v-if="ayudaDeLaAccion" class="text-dimmed text-sm">{{ ayudaDeLaAccion }}</p>

          <template v-if="accion !== 'nada'">
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Usuario del reloj">
                <UInput v-model="username" autocomplete="off" class="w-full" />
              </UFormField>
              <UFormField label="Contraseña del reloj">
                <UInput v-model="password" type="password" autocomplete="off" class="w-full" />
              </UFormField>
            </div>
            <p class="text-dimmed text-xs">
              Son las credenciales del equipo, no las tuyas. No se guardan. Nada se escribe al
              pulsar: la orden se encola y la aplica el agente con las suyas.
            </p>

            <!--
              Mirar antes de mandar. Es opcional porque con el reloj apagado no
              se puede preguntar, y ese es justo el día en que hay que poder
              dejar la orden en la cola igual.
            -->
            <div class="flex flex-wrap items-center gap-3">
              <UButton
                icon="i-lucide-search"
                label="Ver cómo está en el reloj"
                size="xs"
                :loading="comprobando"
                :disabled="!credencialesPuestas"
                @click="comprobar"
              />
              <p v-if="comoEstaAhora" class="text-muted text-xs">{{ comoEstaAhora }}</p>
              <p v-else class="text-dimmed text-xs">Sin comprobar.</p>
            </div>
          </template>

          <p v-if="equipos.length > 1" class="text-dimmed text-xs">
            Está en {{ equipos.length }} relojes. Cada uno tiene su propia contraseña, así que van
            de uno en uno: al terminar este, vuelve a abrir y elige el siguiente.
          </p>
        </template>

        <ApiErrorAlert :error="error" :fields="['username', 'password']" />

        <div class="flex justify-end gap-2">
          <UButton :label="resultado ? 'Cerrar' : 'Ahora no'" @click="open = false" />
          <UButton
            v-if="!resultado"
            :label="ACCIONES.find((a) => a.value === accion)?.label ?? 'Continuar'"
            :color="accion === 'retirar' ? 'error' : 'primary'"
            :loading="trabajando"
            :disabled="!puedeEmpujar"
            @click="empujar"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
