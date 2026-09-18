<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { startRegistration } from '@simplewebauthn/browser'

import { ApiError } from '@/shared/api/errors'
import { loQuePasoConLaHuella, sePuedeUsarHuella } from '@/shared/huella'
import { credencialApi, type InvitacionCanjeada } from '../api'
import { recordarQuienSoy } from '@/modules/org/quien-soy'

/**
 * REGISTRAR CON QUÉ VOY A PROBAR QUE SOY YO AL CHECAR EN LA PUERTA.
 *
 * ══ QUÉ VIENE A ARREGLAR ══
 *
 * El cartel de la contingencia deja fichar con solo el número de empleado. La
 * geocerca prueba DÓNDE está el teléfono, nunca QUIÉN lo sostiene: quien ya
 * está dentro ficha por el compañero que no llegó con solo saberse su número.
 * Aquí cada persona deja puesta su mitad —su huella o un PIN que inventa— y a
 * partir de entonces la puerta se la pide.
 *
 * ══ SIN ARMAZÓN, COMO EL CARTEL ══
 *
 * Quien abre esto es personal de planta que no tiene cuenta en Clocc. Colgarla
 * del layout de la aplicación le enseñaría una barra lateral con trece
 * pantallas a las que no puede entrar.
 *
 * ══ EL NOMBRE NO APARECE HASTA QUE EL CÓDIGO CUADRA ══
 *
 * La pantalla podría saludar en cuanto se abre el enlace. No lo hace, y es la
 * misma regla que la puerta va a aplicar después: un identificador suelto no
 * debe servir para ponerle cara a nadie.
 */
const route = useRoute()
const entityId = String(route.params.entityId ?? '')
/** Del enlace del correo. El código NO viene aquí: se teclea. */
const nonce = String(route.query.alta ?? '')

type Paso = 'codigo' | 'elegir' | 'pin' | 'listo'
const paso = ref<Paso>('codigo')

const codigo = ref('')
const invitacion = computed(() => ({ nonce, codigo: codigo.value }))

/** De quién es la invitación. Llega al canjear, nunca antes. */
const quien = ref<InvitacionCanjeada | null>(null)

/** Si este aparato PUEDE tener huella. Sin esto no se ofrece: lleva a un diálogo vacío. */
const puedeHuella = ref(false)

const pin = ref('')
const pinOtraVez = ref('')
const etiqueta = ref('')

const enviando = ref(false)
const error = ref<string | null>(null)

const listo = ref<{ nombre: string; con: 'pin' | 'huella'; venceEl: string } | null>(null)

/**
 * QUE LA PUERTA YA SEPA QUIÉN ERES.
 *
 * El cartel vive en el mismo sitio que esta pantalla, así que lo que se guarda
 * aquí lo lee él. Sin esto, alguien acababa de registrar su huella y al llegar
 * a la puerta el cartel le pedía otra vez su número de empleado, como si no lo
 * conociera de nada.
 */
function dejarloAnotado(r: { nombre: string; employeeCode: string }): void {
  const partes = r.nombre.trim().split(/\s+/)
  recordarQuienSoy(entityId, {
    employeeCode: r.employeeCode,
    /*
     * Nombre y la inicial del apellido — «Fermín M.»— exactamente como lo dice
     * el cartel al final de una checada. Si no coincidiera, la misma persona
     * vería dos formas de llamarse en dos pantallas de la misma aplicación.
     */
    nombreCorto: partes.length > 1 ? `${partes[0]} ${partes[1]?.charAt(0)}.` : (partes[0] ?? ''),
  })
}

onMounted(async () => {
  puedeHuella.value = await sePuedeUsarHuella()
})

const puedeCanjear = computed(() => /^\d{6}$/.test(codigo.value) && !enviando.value)

/**
 * Los dos PIN tienen que coincidir, y se comprueba AQUÍ.
 *
 * El servidor no puede hacerlo —le llega uno solo— y es el error más común de
 * todos: quien teclea mal el segundo no se entera hasta el día que llega a la
 * puerta y su PIN no es el que recuerda.
 */
const pinCuadra = computed(() => /^\d{4,6}$/.test(pin.value) && pin.value === pinOtraVez.value)

const venceEnPalabras = computed(() => {
  if (listo.value === null) return ''
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(listo.value.venceEl))
})

function loQuePaso(e: unknown, siNo: string): string {
  return e instanceof ApiError ? e.message : siNo
}

async function canjear() {
  if (!puedeCanjear.value) return
  enviando.value = true
  error.value = null
  try {
    quien.value = await credencialApi.canjear(entityId, invitacion.value)
    paso.value = 'elegir'
  } catch (e) {
    error.value = loQuePaso(e, 'No pudimos comprobar ese código. Inténtalo otra vez.')
  } finally {
    enviando.value = false
  }
}

async function guardarPin() {
  if (!pinCuadra.value) return
  enviando.value = true
  error.value = null
  try {
    const r = await credencialApi.ponerPin(entityId, invitacion.value, pin.value)
    dejarloAnotado(r)
    listo.value = { nombre: r.nombre, con: 'pin', venceEl: r.venceEl }
    paso.value = 'listo'
    /* Nunca se queda en memoria más de lo necesario. */
    pin.value = ''
    pinOtraVez.value = ''
  } catch (e) {
    error.value = loQuePaso(e, 'No pudimos guardar tu PIN. Inténtalo otra vez.')
  } finally {
    enviando.value = false
  }
}

/**
 * ACTIVAR LA HUELLA. Sirve tanto de estreno como de segundo paso después del PIN.
 *
 * El servidor deja terminar el registro durante diez minutos después de haber
 * usado la invitación, justo para esto: quien pone su PIN y luego pulsa «activa
 * también tu huella» no debe encontrarse con que su código ya se gastó.
 */
async function activarHuella() {
  enviando.value = true
  error.value = null
  try {
    const opciones = await credencialApi.opcionesDeHuella(entityId, invitacion.value)
    const respuesta = await startRegistration({ optionsJSON: opciones })
    const r = await credencialApi.registrarHuella(
      entityId,
      invitacion.value,
      respuesta,
      etiqueta.value.trim() || undefined,
    )
    dejarloAnotado(r)
    listo.value = { nombre: r.nombre, con: 'huella', venceEl: r.venceEl }
    paso.value = 'listo'
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : loQuePasoConLaHuella(e)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="bg-default text-default flex min-h-dvh flex-col px-4 py-8">
    <div class="mx-auto flex w-full max-w-sm flex-1 flex-col space-y-6">
      <header class="space-y-1 text-center">
        <UIcon name="i-lucide-shield-check" class="text-primary size-10" />
        <h1 class="text-highlighted text-xl font-semibold">Registra tu credencial</h1>
        <p v-if="quien" class="text-muted text-sm">{{ quien.empresa }}</p>
      </header>

      <!--
        SIN ENLACE NO HAY NADA QUE HACER, y se dice en vez de enseñar un
        formulario que no va a funcionar. Le pasa a quien teclea la dirección a
        mano o abre un enlace al que se le perdió la parte de después del `?`.
      -->
      <template v-if="nonce === ''">
        <div class="border-default bg-elevated/50 space-y-3 border p-5 text-center">
          <p class="text-highlighted text-sm font-semibold">Te falta tu enlace</p>
          <p class="text-muted text-sm">
            Esta pantalla se abre desde el enlace que te llegó por correo. Búscalo en tu buzón y
            ábrelo en el teléfono con el que vas a checar.
          </p>
          <p class="text-dimmed text-xs">
            Si no te llegó o ya caducó, pídele otro a Recursos Humanos. No gastas nada por pedirlo.
          </p>
        </div>
      </template>

      <!-- Paso 1: el código. -->
      <template v-else-if="paso === 'codigo'">
        <form class="space-y-4" @submit.prevent="canjear">
          <UFormField
            label="Tu código"
            help="Las seis cifras que vienen en el mismo correo que este enlace."
          >
            <UInput
              v-model="codigo"
              placeholder="000000"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              size="xl"
              class="w-full"
            />
          </UFormField>

          <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

          <UButton
            type="submit"
            label="Continuar"
            icon="i-lucide-arrow-right"
            size="xl"
            block
            :disabled="!puedeCanjear"
            :loading="enviando"
          />
        </form>
        <p class="text-dimmed text-center text-xs">
          Esto se hace una sola vez. Después, en la puerta, solo pones tu huella o tecleas tu PIN.
        </p>
      </template>

      <!-- Paso 2: con qué te vas a identificar. -->
      <template v-else-if="paso === 'elegir' && quien">
        <div class="space-y-1 text-center">
          <p class="text-highlighted text-lg font-semibold">Hola, {{ quien.nombre }}</p>
          <p v-if="quien.vencida" class="text-warning text-sm">
            Se te venció lo que tenías registrado. Vuelve a ponerlo y sigues igual que antes.
          </p>
          <p v-else class="text-muted text-sm">¿Cómo quieres identificarte al checar?</p>
        </div>

        <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

        <!--
          LA HUELLA PRIMERO, y solo si el aparato puede. Es más rápida en la
          puerta, no se olvida y no se puede dictar por teléfono — que es
          justamente lo que hace que un PIN sea la segunda opción y no la
          primera.
        -->
        <div
          v-if="puedeHuella && !quien.tienePasskey"
          class="border-default bg-elevated/50 space-y-3 border p-5"
        >
          <p class="text-highlighted text-sm font-semibold">
            <UIcon name="i-lucide-scan-face" class="size-4 align-[-3px]" />
            Como desbloqueas este teléfono
          </p>
          <!--
            NI «HUELLA» A SECAS NI «CLOCC NUNCA LA VE».

            Decía «con la huella de este teléfono» y no se entendía DÓNDE se
            pone el dedo: la gente pensaba en el lector del reloj de la pared,
            que es el aparato en el que llevan años poniéndolo. Y en un iPhone
            no hay huella que poner: hay Face ID.

            Lo que hay que decir son tres cosas, en este orden: es lo MISMO con
            lo que ya desbloquea su teléfono, se hace EN SU TELÉFONO y no en el
            reloj, y no se manda a ninguna parte.
          -->
          <p class="text-muted text-sm">
            Lo recomendado. Es lo mismo con lo que desbloqueas este teléfono —tu cara, tu huella o
            la clave del aparato— y lo confirmas <strong>en tu teléfono</strong>, no en el reloj de
            la pared.
          </p>
          <p class="text-dimmed text-xs">
            Tu cara y tu huella no salen de este teléfono: ni Clocc ni la empresa las reciben nunca.
            Lo único que viaja es que este aparato confirmó que eras tú.
          </p>
          <UFormField label="¿Cómo se llama este teléfono?" help="Opcional.">
            <UInput v-model="etiqueta" placeholder="Mi celular" class="w-full" />
          </UFormField>
          <UButton
            label="Usar mi cara o mi huella"
            icon="i-lucide-scan-face"
            size="xl"
            block
            :loading="enviando"
            @click="activarHuella"
          />
        </div>

        <div
          v-else-if="quien.tienePasskey"
          class="border-success/40 bg-success/10 flex items-center gap-3 border p-4"
        >
          <UIcon name="i-lucide-scan-face" class="text-success size-6 shrink-0" />
          <p class="text-default text-sm">
            Ya tienes activado el desbloqueo de tu teléfono en un aparato.
          </p>
        </div>

        <div class="border-default bg-elevated/50 space-y-3 border p-5">
          <p class="text-highlighted text-sm font-semibold">
            <UIcon name="i-lucide-lock-keyhole" class="size-4 align-[-3px]" />
            {{ quien.tienePin ? 'Cambiar mi PIN' : 'Con un PIN que invento yo' }}
          </p>
          <p class="text-muted text-sm">
            De 4 a 6 números. Lo tecleas en la puerta cada vez que checas, así que elige uno que te
            sepas y no se lo digas a nadie.
          </p>
          <UButton
            :label="quien.tienePin ? 'Cambiar mi PIN' : 'Poner un PIN'"
            icon="i-lucide-lock-keyhole"
            size="xl"
            block
            @click="
              () => {
                error = null
                paso = 'pin'
              }
            "
          />
        </div>

        <!--
          SIN CARA NI HUELLA SE DICE POR QUÉ, Y SOBRE TODO SE DICE LA CAUSA MÁS
          FRECUENTE, que no es el teléfono.

          Pasó en un iPhone que sí tiene Face ID: el enlace se abrió DENTRO de la
          aplicación del correo, y ese navegador de dentro no deja crear
          credenciales. La pantalla decía «este teléfono no puede», que es falso
          y además deja a la persona sin nada que hacer. Ahora dice qué probar.
        -->
        <div v-if="!puedeHuella" class="border-default bg-elevated/50 space-y-2 border p-4 text-sm">
          <p class="text-highlighted font-semibold">
            <UIcon name="i-lucide-info" class="size-4 align-[-3px]" />
            Aquí no puedo ofrecerte tu cara ni tu huella
          </p>
          <p class="text-muted">
            Casi siempre es porque este enlace se abrió dentro de otra aplicación —el correo o
            WhatsApp—. Copia la dirección y ábrela en <strong>Safari</strong> o
            <strong>Chrome</strong>, y vuelve a intentarlo.
          </p>
          <p class="text-dimmed text-xs">
            Si ya estás en Safari o Chrome: en iPhone hace falta tener encendido el
            <strong>Llavero de iCloud</strong> (Ajustes › tu nombre › iCloud), y en Android la
            pantalla de bloqueo. Si no, ponle un PIN y listo — también sirve.
          </p>
        </div>
      </template>

      <!-- Paso 2 · camino del PIN. -->
      <template v-else-if="paso === 'pin'">
        <form class="space-y-4" @submit.prevent="guardarPin">
          <UFormField
            label="Tu PIN"
            help="De 4 a 6 números. No vale 1111, 1234 ni tu número de empleado."
          >
            <UInput
              v-model="pin"
              type="password"
              placeholder="····"
              inputmode="numeric"
              autocomplete="new-password"
              maxlength="6"
              size="xl"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Otra vez, para estar seguros">
            <UInput
              v-model="pinOtraVez"
              type="password"
              placeholder="····"
              inputmode="numeric"
              autocomplete="new-password"
              maxlength="6"
              size="xl"
              class="w-full"
            />
          </UFormField>

          <p v-if="pinOtraVez !== '' && pin !== pinOtraVez" class="text-warning text-sm">
            Los dos PIN no son iguales.
          </p>

          <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

          <UButton
            type="submit"
            label="Guardar mi PIN"
            icon="i-lucide-check"
            size="xl"
            block
            :disabled="!pinCuadra || enviando"
            :loading="enviando"
          />
        </form>

        <UButton
          label="Volver"
          size="lg"
          block
          @click="
            () => {
              error = null
              paso = 'elegir'
            }
          "
        />
      </template>

      <!-- Listo. -->
      <template v-else-if="listo">
        <div class="border-success/40 bg-success/10 space-y-2 border p-6 text-center">
          <UIcon name="i-lucide-circle-check-big" class="text-success size-12" />
          <p class="text-highlighted text-lg font-semibold">Ya quedó</p>
          <p class="text-default text-sm">
            {{ listo.nombre }} ·
            {{ listo.con === 'huella' ? 'tu huella' : 'tu PIN' }}
          </p>
          <p class="text-muted text-xs">
            A partir de ahora, al checar en la puerta te vamos a pedir
            {{ listo.con === 'huella' ? 'tu huella' : 'tu PIN' }}.
          </p>
          <!--
            La vigencia se dice AQUÍ y no en un correo que nadie guarda. Quien
            no lo sepa va a encontrarse un día con que no puede checar y va a
            pensar que se rompió algo.
          -->
          <p class="text-dimmed text-xs">Vale hasta el {{ venceEnPalabras }}.</p>
        </div>

        <!--
          LA HUELLA DESPUÉS DEL PIN, mientras la ventana de diez minutos sigue
          abierta. Es el momento en que la persona ya está dentro y con el
          teléfono en la mano: pedírselo mañana es no pedírselo.
        -->
        <div
          v-if="listo.con === 'pin' && puedeHuella && quien && !quien.tienePasskey"
          class="border-default bg-elevated/50 space-y-3 border p-5"
        >
          <p class="text-highlighted text-sm font-semibold">
            <UIcon name="i-lucide-fingerprint" class="size-4 align-[-3px]" />
            Activa también tu huella
          </p>
          <p class="text-muted text-sm">
            Te ahorra teclear el PIN en la puerta. Puedes hacerlo ahora mismo; después haría falta
            otra invitación.
          </p>
          <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />
          <UButton
            label="Activar mi huella"
            icon="i-lucide-fingerprint"
            size="xl"
            block
            :loading="enviando"
            @click="activarHuella"
          />
        </div>

        <p class="text-dimmed text-center text-xs">
          Ya puedes cerrar esta pantalla. Nadie de la empresa te va a pedir tu PIN: si alguien te lo
          pide, no se lo des y avisa.
        </p>
      </template>
    </div>
  </div>
</template>
