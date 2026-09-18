<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { startRegistration } from '@simplewebauthn/browser'

import { ApiError } from '@/shared/api/errors'
import { loQuePasoConLaHuella, sePuedeUsarHuella } from '@/shared/huella'
import AstraLogo from '@/shared/ui/AstraLogo.vue'
import { credencialApi, type InvitacionCanjeada } from '../api'

/**
 * REGISTRAR CON QUÉ VOY A PROBAR QUE SOY YO AL CHECAR EN LA PUERTA.
 *
 * ══ QUÉ VIENE A ARREGLAR ══
 *
 * El cartel de la puerta dejaba fichar con solo el número de empleado, y ese
 * número va escrito en el gafete. La geocerca prueba DÓNDE está el teléfono,
 * nunca QUIÉN lo sostiene: quien ya estaba dentro fichaba por el compañero que
 * no llegó. Aquí cada persona deja puesta su mitad.
 *
 * ══ LAS DOS COSAS, NO UNA ══
 *
 * Antes se elegía: o el código, o la cara. Ahora se registran las dos, en este
 * orden, y por una razón práctica: los lectores fallan —un dedo mojado, una
 * funda, el frío— y el día que la cara no lee, quien solo tenga cara se queda
 * fuera de su propio trabajo. El código es la red de abajo; la cara es lo que
 * usará todos los días porque no hay nada que teclear.
 *
 * ══ SIN ARMAZÓN, COMO EL CARTEL ══
 *
 * Quien abre esto es personal de planta que no tiene cuenta en Clocc. Colgarla
 * del layout de la aplicación le enseñaría una barra lateral con trece
 * pantallas a las que no puede entrar.
 *
 * ══ EL NOMBRE NO APARECE HASTA QUE EL CÓDIGO DEL CORREO CUADRA ══
 *
 * La pantalla podría saludar en cuanto se abre el enlace. No lo hace, y es la
 * misma regla que la puerta aplica después: un identificador suelto no debe
 * servir para ponerle cara a nadie.
 */
const route = useRoute()
const entityId = String(route.params.entityId ?? '')
/** Del enlace del correo. El código NO viene ahí: se teclea. */
const nonce = String(route.query.alta ?? '')

/**
 * Los cuatro pasos. `invitacion` es el código que llegó por correo; `miCodigo`
 * es el que la persona inventa y va a teclear en la puerta. Son dos cosas
 * distintas y por eso nunca se piden en la misma pantalla.
 */
type Paso = 'invitacion' | 'miCodigo' | 'miCara' | 'listo'
const paso = ref<Paso>('invitacion')

const codigoDelCorreo = ref('')
const invitacion = computed(() => ({ nonce, codigo: codigoDelCorreo.value }))

/** De quién es la invitación. Llega al canjear, nunca antes. */
const quien = ref<InvitacionCanjeada | null>(null)

/** Si este aparato PUEDE tener cara o huella. Sin esto no se ofrece. */
const puedeHuella = ref(false)

const miCodigo = ref('')
const miCodigoOtraVez = ref('')
const etiqueta = ref('')

const enviando = ref(false)
const error = ref<string | null>(null)

/** Lo que quedó registrado, para el resumen final. */
const conCodigo = ref(false)
const conCara = ref(false)
const venceEl = ref<string | null>(null)

onMounted(async () => {
  puedeHuella.value = await sePuedeUsarHuella()
})

const puedeCanjear = computed(() => /^\d{6}$/.test(codigoDelCorreo.value) && !enviando.value)

/**
 * Los dos códigos tienen que coincidir, y se comprueba AQUÍ.
 *
 * El servidor no puede hacerlo —le llega uno solo— y es el error más común de
 * todos: quien teclea mal el segundo no se entera hasta el día que llega a la
 * puerta y su código no es el que recuerda.
 */
const miCodigoCuadra = computed(
  () => /^\d{4,6}$/.test(miCodigo.value) && miCodigo.value === miCodigoOtraVez.value,
)

const venceEnPalabras = computed(() => {
  if (venceEl.value === null) return ''
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(venceEl.value))
})

function loQuePaso(e: unknown, siNo: string): string {
  return e instanceof ApiError ? e.message : siNo
}

async function canjear(): Promise<void> {
  if (!puedeCanjear.value) return
  enviando.value = true
  error.value = null
  try {
    quien.value = await credencialApi.canjear(entityId, invitacion.value)
    paso.value = 'miCodigo'
  } catch (e) {
    error.value = loQuePaso(e, 'No pudimos comprobar ese código. Inténtalo otra vez.')
  } finally {
    enviando.value = false
  }
}

async function guardarMiCodigo(): Promise<void> {
  if (!miCodigoCuadra.value) return
  enviando.value = true
  error.value = null
  try {
    const r = await credencialApi.ponerPin(entityId, invitacion.value, miCodigo.value)
    conCodigo.value = true
    venceEl.value = r.venceEl
    /* Nunca se queda en memoria más de lo necesario. */
    miCodigo.value = ''
    miCodigoOtraVez.value = ''
    /*
     * Con cara, se sigue; sin ella, ya está. Al aparato que no puede firmar no
     * se le enseña un paso que solo puede saltarse.
     */
    paso.value = puedeHuella.value && !quien.value?.tienePasskey ? 'miCara' : 'listo'
  } catch (e) {
    error.value = loQuePaso(e, 'No pudimos guardar tu código. Inténtalo otra vez.')
  } finally {
    enviando.value = false
  }
}

/**
 * ACTIVAR LA CARA O LA HUELLA.
 *
 * El servidor deja terminar el registro durante diez minutos después de haber
 * usado la invitación, justo para esto: quien acaba de poner su código no debe
 * encontrarse con que su invitación ya se gastó.
 */
async function activarMiCara(): Promise<void> {
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
    conCara.value = true
    venceEl.value = r.venceEl
    paso.value = 'listo'
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : loQuePasoConLaHuella(e)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="bg-default text-default flex min-h-dvh flex-col justify-center px-4 py-8">
    <div class="mx-auto flex w-full max-w-sm flex-col space-y-6">
      <header class="space-y-2 text-center">
        <div class="flex items-center justify-center gap-1.5">
          <AstraLogo class="size-8 shrink-0" />
          <span class="marca-astra text-[2rem] leading-none font-semibold tracking-tight">
            CLOCC
          </span>
        </div>
        <h1 class="text-highlighted text-lg font-semibold">Registra tu credencial</h1>
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

      <!-- Paso 1: el código que llegó por correo. -->
      <template v-else-if="paso === 'invitacion'">
        <form class="space-y-4" @submit.prevent="canjear">
          <UFormField
            label="El código de tu correo"
            help="Las seis cifras que vienen en el mismo correo que este enlace."
          >
            <UInput
              v-model="codigoDelCorreo"
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
          Esto se hace una sola vez. Después, en la puerta, solo pones tu cara o tecleas tu código.
        </p>
      </template>

      <!-- Paso 2: el código que inventa la persona. -->
      <template v-else-if="paso === 'miCodigo' && quien">
        <div class="space-y-1 text-center">
          <p class="text-highlighted text-lg font-semibold">Hola, {{ quien.nombre }}</p>
          <p v-if="quien.vencida" class="text-warning text-sm">
            Se te venció lo que tenías registrado. Vuelve a ponerlo y sigues igual que antes.
          </p>
          <p v-else class="text-muted text-sm">
            Vamos a dejar dos formas de identificarte. Primero, tu código.
          </p>
        </div>

        <form class="space-y-4" @submit.prevent="guardarMiCodigo">
          <!--
            «INVÉNTALO TÚ» Y «NO ES EL DEL CORREO» EN EL MISMO SITIO.

            Acaba de teclear un código de seis cifras y ahora le pedimos otro de
            seis cifras. Sin decirlo, la mitad de la gente vuelve a escribir el
            del correo y se queda sin entender por qué no le sirve en la puerta.
          -->
          <UFormField
            label="Inventa tu código"
            help="De 4 a 6 números que elijas tú. NO es el del correo: este es el que vas a teclear en la puerta."
          >
            <UInput
              v-model="miCodigo"
              type="password"
              placeholder="······"
              inputmode="numeric"
              autocomplete="new-password"
              maxlength="6"
              size="xl"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Otra vez, para estar seguros">
            <UInput
              v-model="miCodigoOtraVez"
              type="password"
              placeholder="······"
              inputmode="numeric"
              autocomplete="new-password"
              maxlength="6"
              size="xl"
              class="w-full"
            />
          </UFormField>

          <p
            v-if="miCodigoOtraVez !== '' && miCodigo !== miCodigoOtraVez"
            class="text-warning text-sm"
          >
            Los dos códigos no son iguales.
          </p>

          <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

          <UButton
            type="submit"
            label="Guardar mi código"
            icon="i-lucide-arrow-right"
            size="xl"
            block
            :disabled="!miCodigoCuadra || enviando"
            :loading="enviando"
          />
        </form>

        <p class="text-dimmed text-center text-xs">
          No se lo digas a nadie. Nadie de la empresa te lo va a pedir nunca.
        </p>
      </template>

      <!-- Paso 3: la cara o la huella del propio teléfono. -->
      <template v-else-if="paso === 'miCara'">
        <div class="space-y-1 text-center">
          <UIcon name="i-lucide-circle-check-big" class="text-success size-8" />
          <p class="text-highlighted font-semibold">Tu código quedó guardado</p>
          <p class="text-muted text-sm">Ahora lo que vas a usar todos los días.</p>
        </div>

        <div class="border-default bg-elevated/50 space-y-3 border p-5">
          <p class="text-highlighted text-sm font-semibold">
            <UIcon name="i-lucide-scan-face" class="size-4 align-[-3px]" />
            Como desbloqueas este teléfono
          </p>
          <!--
            NI «HUELLA» A SECAS NI «CLOCC NUNCA LA VE».

            Decía «con la huella de este teléfono» y no se entendía DÓNDE se
            pone el dedo: la gente lleva años poniéndolo en el lector del reloj
            de la pared. Y en un iPhone no hay huella que poner: hay Face ID.
          -->
          <p class="text-muted text-sm">
            Es lo mismo con lo que desbloqueas este teléfono —tu cara, tu huella o la clave del
            aparato— y lo confirmas <strong>en tu teléfono</strong>, no en el reloj de la pared. En
            la puerta no tendrás que teclear nada.
          </p>
          <p class="text-dimmed text-xs">
            Tu cara y tu huella no salen de este teléfono: ni Clocc ni la empresa las reciben nunca.
          </p>

          <UFormField label="¿Cómo se llama este teléfono?" help="Opcional.">
            <UInput v-model="etiqueta" placeholder="Mi celular" class="w-full" />
          </UFormField>

          <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

          <UButton
            label="Usar mi cara o mi huella"
            icon="i-lucide-scan-face"
            size="xl"
            block
            :loading="enviando"
            @click="activarMiCara"
          />
        </div>

        <!--
          SE PUEDE SALTAR, y se dice que se puede volver. Obligar aquí dejaría
          plantado a quien abrió el enlace en un aparato prestado, y ese ya tiene
          su código: puede checar igual.
        -->
        <UButton label="Ahora no" size="lg" block @click="paso = 'listo'" />
      </template>

      <!-- Listo. -->
      <template v-else>
        <div class="border-success/40 bg-success/10 space-y-2 border p-6 text-center">
          <UIcon name="i-lucide-circle-check-big" class="text-success size-12" />
          <p class="text-highlighted text-lg font-semibold">Ya quedó</p>
          <p class="text-default text-sm">
            <span v-if="conCara && conCodigo">Tu cara y tu código están registrados.</span>
            <span v-else-if="conCara">Tu cara quedó registrada.</span>
            <span v-else>Tu código quedó registrado.</span>
          </p>
          <p class="text-muted text-xs">
            En la puerta, escanea el cartel y
            {{
              conCara ? 'pon tu cara. Si algún día no lee, teclea tu código.' : 'teclea tu código.'
            }}
          </p>
          <!--
            La vigencia se dice AQUÍ y no en un correo que nadie guarda. Quien
            no lo sepa se encontrará un día con que no puede checar y pensará
            que se rompió algo.
          -->
          <p v-if="venceEnPalabras" class="text-dimmed text-xs">
            Vale hasta el {{ venceEnPalabras }}.
          </p>
        </div>

        <!-- Se registró el código y se saltó la cara: se puede volver. -->
        <UButton
          v-if="!conCara && puedeHuella && quien && !quien.tienePasskey"
          label="Activar también mi cara"
          icon="i-lucide-scan-face"
          size="lg"
          block
          @click="
            () => {
              error = null
              paso = 'miCara'
            }
          "
        />

        <p class="text-dimmed text-center text-xs">
          Ya puedes cerrar esta pantalla. Nadie de la empresa te va a pedir tu código: si alguien te
          lo pide, no se lo des y avisa.
        </p>
      </template>
    </div>
  </div>
</template>
