<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAviso } from '@/shared/ui/aviso'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { todayLocal } from '@/shared/date'
import { useAsync } from '@/shared/composables/useAsync'
import { orgApi } from '@/modules/org/api'
import { devicesApi } from '@/modules/devices/api'
import { padronApi } from '@/modules/padron/api'
import { useAuthStore } from '@/modules/auth/store'
import PhotoPicker from './PhotoPicker.vue'
import { E164, aE164 } from '../telefono'
import {
  CURP_OFICIAL,
  ENTIDADES,
  RFC_OFICIAL,
  curpHasta16,
  digitoVerificadorCurp,
  rfcSinHomoclave,
} from '../identidad'
import { NINGUNO, sinNinguno } from '@/shared/ui/select-none'
import type { LegalEntity } from '@/modules/org/types'
import { employeesApi } from '../api'
import { summarizeShift } from '../shift-summary'
import { ASSIGNMENT_REASONS, ASSIGNMENT_REASON_LABEL, type AssignmentReason } from '../types'

const props = defineProps<{ legalEntities: LegalEntity[] }>()
const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })

const PERSON_FIELDS = [
  'legalEntityId',
  'firstName',
  'lastName',
  'secondLastName',
  'curp',
  'rfc',
  'nss',
  'birthDate',
  'whatsappNumber',
  'email',
] as const

const ASSIGNMENT_FIELDS = [
  'installationId',
  'shiftPolicyId',
  'departmentId',
  'positionId',
  'validFrom',
  'cycleStartDate',
  'reason',
] as const

const hoy = todayLocal()

const legalEntityId = ref('')
const firstName = ref('')
const lastName = ref('')
const secondLastName = ref('')
const curp = ref('')
const rfc = ref('')
const nss = ref('')
const birthDate = ref('')
const whatsappNumber = ref('')
const email = ref('')

const installationId = ref('')
const shiftPolicyId = ref('')
const departmentId = ref(NINGUNO)
const positionId = ref(NINGUNO)
const validFrom = ref(hoy)
const reason = ref<AssignmentReason>('HIRED')

const submitting = ref(false)
const error = ref<Error | null>(null)

/**
 * LA FOTO. Opcional y sin uso en el reloj de la nave, que no tiene rostro. Se
 * guarda para el día que entre uno que sí. Ver `PhotoPicker`.
 */
const foto = ref<string | null>(null)

/**
 * CURP Y RFC ARMADOS DESDE EL NOMBRE.
 *
 * Se proponen mientras se escribe y SE DEJAN DE PROPONER en cuanto alguien los
 * toca: quien corrige un CURP lo está copiando del documento, y volver a
 * pisárselo con el calculado sería discutir con la única fuente que manda.
 *
 * Sexo y entidad no se guardan en el expediente: están aquí solo para poder
 * llegar a la posición 16. Sin ellos la propuesta llega a la 10, que es lo que
 * sale del nombre y la fecha.
 */
const curpTocado = ref(false)
const rfcTocado = ref(false)

/*
 * `NINGUNO` y no la cadena vacía: el desplegable de Nuxt UI reserva el vacío
 * para «nada seleccionado» y revienta si además es el valor de una opción.
 * Está explicado en `select-none.ts`, y es justo la trampa en la que caí: el
 * selector se pintaba bien y no dejaba elegir.
 */
const sexo = ref(NINGUNO)
const entidad = ref(NINGUNO)

const sexoParaCurp = computed(() => {
  const v = sinNinguno(sexo.value)
  return v === 'H' || v === 'M' ? v : ''
})

const datosDeIdentidad = computed(() => ({
  firstName: firstName.value,
  lastName: lastName.value,
  secondLastName: secondLastName.value,
  birthDate: birthDate.value,
}))

watch(
  [datosDeIdentidad, sexo, entidad],
  () => {
    if (!curpTocado.value) {
      curp.value = curpHasta16(
        datosDeIdentidad.value,
        sexoParaCurp.value,
        sinNinguno(entidad.value),
      )
    }
    if (!rfcTocado.value) rfc.value = rfcSinHomoclave(datosDeIdentidad.value)
  },
  { deep: true },
)

/**
 * El dígito verificador se calcula solo en cuanto hay 17 posiciones.
 *
 * Es la única del CURP que SÍ sale de las demás, así que quien copia del
 * documento solo teclea la 17 —la de homonimia, que asigna RENAPO— y la última
 * se pone sola. Se calcula también sobre lo que alguien pegue a mano.
 */
watch(curp, (valor) => {
  if (valor.length !== 17) return
  const digito = digitoVerificadorCurp(valor)
  if (digito !== '') curp.value = valor + digito
})

/**
 * El teléfono tal como se va a guardar.
 *
 * El servidor exige E.164 y nadie escribe su número así, con la clave del país
 * delante. Se convierte solo, PERO SE ENSEÑA: un número corregido en silencio
 * es un mensaje que algún día le llega a otra persona.
 */
const telefonoNormalizado = computed(() => aE164(whatsappNumber.value))
const telefonoValido = computed(() => E164.test(telefonoNormalizado.value))

const curpCompleto = computed(() => CURP_OFICIAL.test(curp.value))
const rfcCompleto = computed(() => RFC_OFICIAL.test(rfc.value))

/** Qué le falta, en palabras. Vacío cuando está bien o cuando no hay nada. */
const faltaEnCurp = computed(() => {
  if (curp.value === '' || curpCompleto.value) return ''
  if (curp.value.length < 11) {
    return 'Elige sexo y entidad para llegar a la 16, o cópialo del documento.'
  }
  if (curp.value.length === 16) {
    return 'Falta la posición 17, la de homonimia: cópiala del documento y la 18 se calcula sola.'
  }
  return 'No tiene el formato oficial de 18 posiciones.'
})

/**
 * EL ALTA EN EL RELOJ, en el mismo formulario.
 *
 * Antes había que teclear a la persona en el aparato y luego conciliarla: dos
 * sitios y dos oportunidades de escribir mal el nombre. Va aquí, apagado por
 * omisión, porque escribir en un control de acceso se decide a propósito.
 *
 * PIDE EL RELOJ ENCENDIDO: para asignar el número hay que preguntarle cuáles
 * tiene. Si está apagado, esto falla —y la persona queda dada de alta en Astra
 * igual, que es lo que importa; el reloj se resuelve luego desde su ficha—.
 */
const auth = useAuthStore()
const puedeEnrolar = computed(() => auth.can('assignEmployee'))

const enElReloj = ref(false)
const deviceId = ref('')
const clockUser = ref('admin')
const clockPass = ref('')
const conClave = ref(true)

/**
 * CUÁNTOS DÍGITOS TIENE LA CLAVE DE PUERTA.
 *
 * Lo fija la empresa y tiene que ser igual para todo el mundo: si unos entran
 * con cuatro y otros con ocho en la misma puerta, nadie sabe cuántos teclear.
 * Se recuerda entre altas —es una política, no una decisión por persona— y por
 * eso vive en el navegador y no se reinicia al cerrar el formulario.
 */
const LONGITUDES = [
  { label: '4 dígitos', value: 4 },
  { label: '6 dígitos', value: 6 },
  { label: '8 dígitos', value: 8 },
]
const CLAVE_GUARDADA = 'astra.longitudDeClave'

function longitudRecordada(): number {
  try {
    const guardada = Number(localStorage.getItem(CLAVE_GUARDADA))
    return LONGITUDES.some((l) => l.value === guardada) ? guardada : 6
  } catch {
    // Navegador con el almacenamiento cerrado: seis, que es lo más común.
    return 6
  }
}

const claveLongitud = ref(longitudRecordada())

watch(claveLongitud, (valor) => {
  try {
    localStorage.setItem(CLAVE_GUARDADA, String(valor))
  } catch {
    // Que no se pueda recordar no es motivo para no dar de alta a nadie.
  }
})

const devices = useAsync((signal) => devicesApi.list(installationId.value || undefined, signal))

/** Lo que salió del alta y solo se enseña una vez: el número y la clave. */
const resultado = ref<{ externalUserId: string; pin: string | null } | null>(null)
/** El alta salió bien pero el reloj no: se dice, no se traga. */
const aviso = useAviso()
const avisoDelReloj = ref('')
/** Qué pasó con su correo de alta. Se enseña junto al número y la clave. */
const correoDeAlta = ref('')

const installations = useAsync((signal) => orgApi.installations({}, signal))
const shifts = useAsync((signal) => employeesApi.shiftPolicies(legalEntityId.value, signal))
const departments = useAsync((signal) => employeesApi.departments(signal))
const positions = useAsync((signal) => orgApi.positions(legalEntityId.value, signal))

const entityItems = computed(() =>
  props.legalEntities.map((e) => ({ label: e.businessName, value: e.id })),
)

/** Solo las bases de la empresa elegida: adscribir a otra sería un error mudo. */
const installationItems = computed(() =>
  (installations.data.value ?? [])
    .filter((i) => i.legalEntityId === legalEntityId.value)
    .map((i) => ({ label: `${i.code} · ${i.name}`, value: i.id })),
)

const shiftItems = computed(() =>
  (shifts.data.value ?? []).map((s) => ({
    label: `${s.code} · ${s.name}`,
    value: s.id,
  })),
)

const departmentItems = computed(() => [
  { label: 'Sin departamento', value: NINGUNO },
  ...(departments.data.value ?? [])
    .filter((d) => d.legalEntityId === legalEntityId.value)
    .map((d) => ({ label: `${d.code} · ${d.name}`, value: d.id })),
])

// Del catálogo y solo los activos de esa empresa: con texto libre «Operador» y
// «operador» eran dos puestos distintos.
const positionItems = computed(() => [
  { label: 'Sin puesto', value: NINGUNO },
  ...(positions.data.value ?? [])
    .filter((p) => p.legalEntityId === legalEntityId.value && p.isActive)
    .map((p) => ({ label: `${p.code} · ${p.name}`, value: p.id })),
])

const reasonItems = ASSIGNMENT_REASONS.map((r) => ({
  label: ASSIGNMENT_REASON_LABEL[r],
  value: r,
}))

/** El horario elegido, en palabras: es la respuesta a «¿a qué hora entra?». */
const chosenShift = computed(() => {
  const policy = (shifts.data.value ?? []).find((s) => s.id === shiftPolicyId.value)
  return policy ? { policy, summary: summarizeShift(policy) } : null
})

/**
 * Con forma de correo, sin más.
 *
 * Deliberadamente laxa: las expresiones «estrictas» de correo rechazan
 * direcciones perfectamente válidas —guiones, subdominios, dominios largos— y
 * el que decide de verdad es el servidor de correo al entregarlo. Aquí solo se
 * atrapa el error de dedo: el que falta la arroba o el punto.
 */
const correoValido = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()))

const valid = computed(
  () =>
    legalEntityId.value !== '' &&
    correoValido.value &&
    firstName.value.trim() !== '' &&
    lastName.value.trim() !== '' &&
    installationId.value !== '' &&
    shiftPolicyId.value !== '' &&
    validFrom.value !== '' &&
    (whatsappNumber.value.trim() === '' || telefonoValido.value) &&
    (!enElReloj.value ||
      (deviceId.value !== '' && clockUser.value.trim() !== '' && clockPass.value !== '')),
)

watch(open, (isOpen) => {
  if (!isOpen) return
  legalEntityId.value = props.legalEntities[0]?.id ?? ''
  firstName.value = ''
  lastName.value = ''
  secondLastName.value = ''
  curp.value = ''
  rfc.value = ''
  nss.value = ''
  birthDate.value = ''
  whatsappNumber.value = ''
  email.value = ''
  installationId.value = ''
  shiftPolicyId.value = ''
  departmentId.value = NINGUNO
  positionId.value = NINGUNO
  validFrom.value = hoy
  reason.value = 'HIRED'
  error.value = null
  foto.value = null
  curpTocado.value = false
  rfcTocado.value = false
  sexo.value = NINGUNO
  entidad.value = NINGUNO
  enElReloj.value = false
  deviceId.value = ''
  clockPass.value = ''
  conClave.value = true
  resultado.value = null
  avisoDelReloj.value = ''
  correoDeAlta.value = ''
  void installations.run()
  void departments.run()
  if (legalEntityId.value !== '') void positions.run()
})

/*
 * Los relojes son de la BASE, no de la empresa: cambiar de base cambia la lista
 * y deja sin sentido el que estuviera elegido.
 */
watch(installationId, (id) => {
  deviceId.value = ''
  if (id !== '') void devices.run()
})

const deviceItems = computed(() =>
  (devices.data.value ?? [])
    .filter((d) => d.isActive)
    .map((d) => ({
      label: `${[d.brand, d.model].filter(Boolean).join(' ') || d.serialNumber} · ${d.serialNumber}`,
      value: d.id,
    })),
)

// Cambiar de empresa invalida base, turno, departamento y puesto: son suyos.
watch(legalEntityId, (id) => {
  installationId.value = ''
  shiftPolicyId.value = ''
  departmentId.value = NINGUNO
  positionId.value = NINGUNO
  if (id !== '') {
    void shifts.run()
    void positions.run()
  }
})

/**
 * Dos llamadas, en orden: primero la persona, después su adscripción.
 *
 * Si la segunda falla, el empleado queda dado de alta pero SIN turno, y el
 * motor lo marcaría sin horario. Por eso el error lo dice con esas palabras en
 * vez de un «no se pudo guardar» que dejaría a alguien pensando que no se creó.
 */
async function submit(): Promise<void> {
  if (!valid.value || submitting.value) return
  submitting.value = true
  error.value = null

  try {
    /*
     * LA CONTRASEÑA DEL RELOJ SE COMPRUEBA ANTES DE CREAR NADA.
     *
     * Es el filtro definitivo: si el equipo no acepta esas credenciales, no se
     * crea el expediente, ni la adscripción, ni la foto. Con la comprobación
     * detrás, una contraseña mal tecleada dejaba a media persona dada de alta
     * —expediente sí, reloj no— y había que ir a borrarla a mano. Pasó, y por
     * eso está aquí.
     *
     * No lee ni escribe en el equipo: solo le pregunta si le sirven. Lo que sí
     * escribe viene después, y ya con la certeza de que va a poder terminar.
     */
    if (enElReloj.value) {
      await devicesApi.check(deviceId.value, clockUser.value.trim(), clockPass.value)
    }

    const empleado = await employeesApi.create({
      legalEntityId: legalEntityId.value,
      firstName: firstName.value,
      lastName: lastName.value,
      secondLastName: secondLastName.value,
      curp: curp.value,
      rfc: rfc.value,
      nss: nss.value,
      birthDate: birthDate.value,
      sex: sexoParaCurp.value,
      whatsappNumber: whatsappNumber.value,
      email: email.value.trim(),
    })

    try {
      await employeesApi.assign(empleado.id, {
        installationId: installationId.value,
        shiftPolicyId: shiftPolicyId.value,
        departmentId: sinNinguno(departmentId.value),
        positionId: sinNinguno(positionId.value),
        validFrom: validFrom.value,
        cycleStartDate: validFrom.value,
        reason: reason.value,
      })
    } catch (cause) {
      const detalle = cause instanceof Error ? cause.message : String(cause)
      throw new Error(
        `${firstName.value} quedó dado de alta, pero NO se le pudo asignar turno: ${detalle} ` +
          'Asígnaselo desde su ficha; mientras tanto no se le puede calcular asistencia.',
      )
    }

    /*
     * DE AQUÍ EN ADELANTE, LA PERSONA YA EXISTE.
     *
     * Foto y reloj son añadidos: si fallan, no se deshace el alta —eso sería
     * borrar a alguien por una foto— y tampoco se callan. Cada uno deja su
     * aviso y el expediente queda creado.
     */
    if (foto.value) {
      try {
        await employeesApi.savePhoto(empleado.id, foto.value)
      } catch (cause) {
        avisoDelReloj.value =
          'La persona quedó dada de alta, pero la foto no se pudo guardar: ' +
          (cause instanceof Error ? cause.message : String(cause))
      }
    }

    if (enElReloj.value) {
      try {
        resultado.value = await padronApi.enroll(
          deviceId.value,
          clockUser.value.trim(),
          clockPass.value,
          {
            employeeId: empleado.id,
            conClave: conClave.value,
            claveLongitud: claveLongitud.value,
          },
        )
      } catch (cause) {
        // Las credenciales ya se comprobaron arriba, así que llegar aquí es
        // raro: el número se ocupó entre medias, o el equipo se apagó en los
        // segundos que tardó el alta. Se dice y se puede rematar desde la ficha.
        avisoDelReloj.value =
          `${firstName.value} quedó dado de alta en Astra, pero NO en el reloj: ` +
          (cause instanceof Error ? cause.message : String(cause)) +
          ' Puedes darlo de alta después desde su expediente.'
      }
    }

    /*
     * EL CORREO DE ALTA, con la clave que acaba de generarse.
     *
     * Va después del reloj a propósito: si se mandara antes, la persona
     * recibiría su alta sin la clave con la que entra. Y va envuelto en su
     * propio `try` porque **un fallo del correo no puede tumbar un alta que ya
     * está hecha**: la persona existe, está en el reloj, y lo único que falta
     * es avisarle.
     */
    try {
      const r = await employeesApi.welcomeEmail(empleado.id, resultado.value?.pin ?? undefined)
      correoDeAlta.value = r.encolado
        ? `Se le mandó su alta a ${email.value.trim()}.`
        : (r.motivo ?? 'El correo no se pudo escribir.')
    } catch (cause) {
      correoDeAlta.value =
        'La persona quedó dada de alta, pero su correo no se pudo escribir: ' +
        (cause instanceof Error ? cause.message : String(cause))
    }

    aviso.creado(
      `${firstName.value.trim()} ${lastName.value.trim()}`,
      resultado.value?.pin ? 'Apunta su clave antes de cerrar.' : undefined,
    )

    emit('saved')
    clockPass.value = ''

    // Con número o clave que enseñar, la pantalla se queda: son datos que solo
    // se ven una vez. Sin nada que contar, se cierra como siempre.
    if (!resultado.value && !avisoDelReloj.value && !correoDeAlta.value) open.value = false
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Nuevo empleado"
    description="Los datos de la persona y su primera adscripción: dónde trabaja y con qué turno."
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <form class="space-y-5" @submit.prevent="submit">
        <section class="space-y-3">
          <p class="text-muted text-xs font-medium tracking-wide uppercase">La persona</p>

          <PhotoPicker
            v-model="foto"
            :nombre="`${firstName} ${lastName}`"
            :disabled="submitting"
          />

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Razón social" required>
              <USelectMenu
                v-model="legalEntityId"
                :items="entityItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <!--
              La clave la pone el servidor: `EMP-00000045`. Ocho dígitos y esa
              serie porque es el número con el que la persona queda enrolada en
              el reloj; otro formato rompería la conciliación con el equipo.
            -->

            <UFormField label="Nombre" required>
              <UInput v-model="firstName" class="w-full" />
            </UFormField>

            <UFormField label="Apellido paterno" required>
              <UInput v-model="lastName" class="w-full" />
            </UFormField>

            <UFormField label="Apellido materno">
              <UInput v-model="secondLastName" class="w-full" />
            </UFormField>

            <UFormField label="Fecha de nacimiento">
              <UInput v-model="birthDate" type="date" class="w-full" />
            </UFormField>

            <!--
              El sexo SÍ es un dato del expediente: viaja al reloj, que tiene el
              campo y sin él enseña «Desconocido». Además arma la posición 11
              del CURP. La entidad, en cambio, solo sirve para el CURP.
            -->
            <UFormField label="Sexo" help="Va al reloj y arma el CURP.">
              <USelectMenu
                v-model="sexo"
                :items="[
                  { label: 'Sin elegir', value: NINGUNO },
                  { label: 'Hombre', value: 'H' },
                  { label: 'Mujer', value: 'M' },
                ]"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Entidad de nacimiento" help="Solo para armar el CURP.">
              <USelectMenu
                v-model="entidad"
                :items="[{ label: 'Sin elegir', value: NINGUNO }, ...ENTIDADES]"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField label="CURP">
              <UInput
                v-model="curp"
                class="w-full font-mono uppercase"
                :trailing-icon="curpCompleto ? 'i-lucide-check' : undefined"
                @input="curpTocado = true"
              />
              <template #help>
                <span v-if="faltaEnCurp" class="text-warning">
                  {{ faltaEnCurp }} Mientras esté incompleto se guarda vacío.
                </span>
                <span v-else-if="curpCompleto" class="text-success">
                  Formato oficial correcto.
                </span>
                <span v-else>Se propone desde el nombre; el del documento manda.</span>
              </template>
            </UFormField>

            <UFormField label="RFC">
              <UInput
                v-model="rfc"
                class="w-full font-mono uppercase"
                :trailing-icon="rfcCompleto ? 'i-lucide-check' : undefined"
                @input="rfcTocado = true"
              />
              <template #help>
                <span v-if="rfc !== '' && !rfcCompleto" class="text-warning">
                  Faltan los 3 de la homoclave, que asigna el SAT. Mientras falten se guarda vacío.
                </span>
                <span v-else-if="rfcCompleto" class="text-success">
                  Formato oficial correcto.
                </span>
                <span v-else>Se propone sin homoclave desde el nombre.</span>
              </template>
            </UFormField>

            <UFormField label="NSS">
              <UInput v-model="nss" class="w-full font-mono" />
            </UFormField>

            <!--
              El correo es OPCIONAL y casi nadie en planta tiene uno. Está aquí
              porque es el que se propone el día que a esa persona se le da
              acceso a Astra: sin él hay que teclearlo a mano en el alta de la
              cuenta y no queda en ninguna parte.
            -->
            <!--
              OBLIGATORIO desde ahora: por aquí se le manda su alta —número,
              clave, base, turno, departamento y puesto—. Sin correo, esa alta
              se queda en el sistema y la persona no se entera de nada.

              NO VIAJA AL RELOJ. El aparato guarda número, nombre, vigencia y
              permiso de puerta, y el padrón compara exactamente esos campos:
              cambiar un correo no pide conciliar nada.
            -->
            <UFormField
              label="Correo"
              required
              :error="
                email.trim() !== '' && !correoValido ? 'Le falta la arroba o el dominio' : undefined
              "
              help="Aquí se le manda su número, su clave y a dónde entra."
            >
              <UInput v-model="email" type="email" placeholder="nombre@empresa.mx" class="w-full" />
            </UFormField>

            <UFormField label="WhatsApp" hint="Para avisos y contingencia">
              <UInput v-model="whatsappNumber" placeholder="938 111 0001" class="w-full font-mono" />
              <template #help>
                <span v-if="whatsappNumber.trim() === ''">
                  Diez dígitos basta: se le pone el +52 solo.
                </span>
                <span v-else-if="telefonoValido" class="text-success">
                  Se guardará como <span class="font-mono">{{ telefonoNormalizado }}</span>
                </span>
                <span v-else class="text-warning">
                  No parece un número completo. Escríbelo con sus diez dígitos, o con la clave del
                  país si es de fuera de México.
                </span>
              </template>
            </UFormField>
          </div>
        </section>

        <section class="space-y-3">
          <p class="text-muted text-xs font-medium tracking-wide uppercase">
            Adscripción · dónde y con qué horario
          </p>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Base" required>
              <USelectMenu
                v-model="installationId"
                :items="installationItems"
                value-key="value"
                placeholder="¿Dónde trabaja?"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Turno" required>
              <USelectMenu
                v-model="shiftPolicyId"
                :items="shiftItems"
                value-key="value"
                :loading="shifts.pending.value"
                placeholder="¿Qué horario?"
                searchable
                class="w-full"
              />
            </UFormField>

            <!--
              Un desplegable con una sola opción no explica por qué está así.
              La ayuda va como PROPIEDAD, no por slot: ver AssignmentModal.
            -->
            <UFormField
              label="Departamento"
              :help="
                departmentItems.length === 1
                  ? 'Esta razón social no tiene departamentos. Es opcional.'
                  : undefined
              "
            >
              <USelectMenu
                v-model="departmentId"
                :items="departmentItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Puesto"
              :help="
                positionItems.length === 1
                  ? 'Esta razón social no tiene puestos. Es opcional.'
                  : undefined
              "
            >
              <USelectMenu
                v-model="positionId"
                :items="positionItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Vigente desde" required>
              <UInput v-model="validFrom" type="date" class="w-full" />
            </UFormField>

            <UFormField label="Motivo" required>
              <USelectMenu
                v-model="reason"
                :items="reasonItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>

          <!--
            El horario elegido, en palabras. Es la respuesta directa a «¿cómo sé
            que llegó tarde?»: la tolerancia de entrada es la que define eso.
          -->
          <div v-if="chosenShift" class="bg-elevated/50 rounded-lg p-3 text-sm">
            <p class="text-highlighted font-medium">{{ chosenShift.summary.schedule }}</p>
            <p class="text-muted mt-0.5 text-xs">
              Ciclo de {{ chosenShift.policy.cycleLengthDays }} días ·
              {{ chosenShift.summary.workDays }} de trabajo · {{ chosenShift.summary.restDays }} de
              descanso
              <template v-if="chosenShift.summary.graceInMinutes !== null">
                · se considera retardo pasados
                {{ chosenShift.summary.graceInMinutes }} min
              </template>
            </p>
          </div>
        </section>

        <!--
          EL RELOJ. Apagado por omisión: escribir en un control de acceso se
          decide a propósito, no de rebote al guardar un formulario.
        -->
        <section v-if="puedeEnrolar && !resultado" class="space-y-3">
          <p class="text-muted text-xs font-medium tracking-wide uppercase">El reloj</p>

          <UCheckbox
            v-model="enElReloj"
            label="Darlo de alta también en el reloj"
            :disabled="installationId === ''"
          />
          <p v-if="installationId === ''" class="text-dimmed text-xs">
            Elige antes la base: los relojes son de ella.
          </p>

          <template v-else-if="enElReloj">
            <p class="text-dimmed text-xs">
              Se le asigna el siguiente número libre —preguntándole al equipo cuáles tiene— y se
              encola su alta. El reloj tiene que estar encendido: reutilizar un número le pondría a
              esta persona el nombre de otra.
            </p>
            <!--
              Que quede claro antes de pulsar: esta contraseña manda sobre todo
              el formulario, no solo sobre el paso del reloj.
            -->
            <p class="text-muted text-xs">
              La contraseña del equipo se comprueba <strong>antes</strong> de crear nada. Si no
              sirve, no se da de alta a nadie: ni expediente, ni adscripción, ni foto.
            </p>

            <UFormField label="En qué reloj" required>
              <USelectMenu
                v-model="deviceId"
                :items="deviceItems"
                value-key="value"
                :loading="devices.pending.value"
                class="w-full"
              />
            </UFormField>

            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Usuario del reloj" required>
                <UInput v-model="clockUser" autocomplete="off" class="w-full" />
              </UFormField>
              <UFormField label="Contraseña del reloj" required>
                <UInput v-model="clockPass" type="password" autocomplete="off" class="w-full" />
              </UFormField>
            </div>
            <p class="text-dimmed text-xs">
              Son las credenciales del equipo, no las tuyas. No se guardan.
            </p>

            <UCheckbox
              v-model="conClave"
              label="Generarle una clave de puerta"
              :description="`Es lo único con lo que puede checar HOY: la huella solo se da de alta con el dedo delante del aparato. La clave se enseña UNA vez y no se guarda.`"
            />

            <UFormField
              v-if="conClave"
              label="Dígitos de la clave"
              help="La misma para toda la empresa. Se recuerda para las próximas altas."
            >
              <USelectMenu
                v-model="claveLongitud"
                :items="LONGITUDES"
                value-key="value"
                class="w-full sm:w-48"
              />
            </UFormField>
          </template>
        </section>

        <!--
          El número y la clave se ven UNA vez. Si esta caja se cierra sin
          apuntarlos, la clave no se puede volver a consultar: hay que generar
          otra. Se dice, para que nadie cierre creyendo que la tiene guardada.
        -->
        <UAlert
          v-if="resultado"
          icon="i-lucide-badge-check"
          color="success"
          title="Dado de alta en el reloj"
        >
          <template #description>
            <p>
              Su número en el equipo es
              <span class="font-mono font-semibold">{{ resultado.externalUserId }}</span
              >. El agente aplicará el alta en su siguiente ciclo.
            </p>
            <p v-if="resultado.pin" class="mt-2">
              Clave de puerta:
              <span class="font-mono text-lg font-semibold">{{ resultado.pin }}</span>
              <span class="block text-xs"
                >Apúntala ahora: no se guarda en ninguna parte y no se puede volver a
                consultar.</span
              >
            </p>
            <p class="mt-2 text-xs">
              La huella hay que darla de alta en el propio aparato, con el dedo delante: este modelo
              no admite hacerlo desde aquí.
            </p>
          </template>
        </UAlert>

        <UAlert
          v-if="avisoDelReloj"
          icon="i-lucide-triangle-alert"
          color="warning"
          title="La persona sí quedó dada de alta"
          :description="avisoDelReloj"
        />

        <!--
          Se dice qué pasó con su correo, salga bien o mal. Callarlo dejaría a
          quien da el alta creyendo que la persona ya sabe su clave, y esa
          suposición se descubre el lunes en la puerta.
        -->
        <UAlert
          v-if="correoDeAlta"
          :icon="correoDeAlta.startsWith('Se le mandó') ? 'i-lucide-mail-check' : 'i-lucide-mail-x'"
          :color="correoDeAlta.startsWith('Se le mandó') ? 'success' : 'warning'"
          :description="correoDeAlta"
        />

        <!--
          `username` y `password` van en la lista para que un fallo de las
          credenciales del equipo se lea junto a su campo y no como un error
          suelto del formulario entero.
        -->
        <ApiErrorAlert
          :error="error"
          :fields="[...PERSON_FIELDS, ...ASSIGNMENT_FIELDS, 'username', 'password']"
        />

        <div class="flex justify-end gap-2">
          <UButton
            :label="resultado || avisoDelReloj ? 'Cerrar' : 'Cancelar'"
            @click="open = false"
          />
          <UButton
            v-if="!resultado && !avisoDelReloj"
            type="submit"
            label="Dar de alta"
            icon="i-lucide-check"
            :loading="submitting"
            :disabled="!valid"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
