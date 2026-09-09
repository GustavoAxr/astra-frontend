<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '@/shared/api/errors'
import { useAviso } from '@/shared/ui/aviso'
import { orgApi } from '@/modules/org/api'
import type { LegalEntity } from '@/modules/org/types'
import { comoBase64, importsApi } from '../api'
import {
  NOMBRE_DEL_CATALOGO,
  type CatalogoFaltante,
  type ErrorDeFila,
  type ResultadoDeCarga,
  type ResultadoDeCatalogo,
  type ResultadoDeTurnos,
  type RevisionDeCarga,
  type RevisionDeTurnos,
} from '../types'

/**
 * CARGA MASIVA POR EXCEL.
 *
 * La pantalla está partida en dos bloques y **ese orden es el requisito, no una
 * preferencia**: la plantilla de personal no se descarga con los desplegables
 * vacíos, así que los catálogos van primero y se ve por qué.
 *
 * EL PASO DE «REVISAR» NO SE PUEDE SALTAR. Se puede subir el archivo cuantas
 * veces haga falta mientras solo se revisa: nada se escribe hasta que alguien
 * pulsa el botón de cargar, ya sabiendo cuántas filas entran.
 */
const aviso = useAviso()

const empresas = ref<LegalEntity[]>([])
const legalEntityId = ref('')
const cargando = ref(true)
const error = ref<string | null>(null)

const faltan = ref<CatalogoFaltante[]>([])
const revisandoRequisitos = ref(false)

const archivoPersonal = ref<File | null>(null)
const revision = ref<RevisionDeCarga | null>(null)
const resultado = ref<ResultadoDeCarga | null>(null)
const trabajando = ref(false)

const archivoTurnos = ref<File | null>(null)
const revisionTurnos = ref<RevisionDeTurnos | null>(null)
const resultadoTurnos = ref<ResultadoDeTurnos | null>(null)

const hayErroresTurnos = computed(() => (revisionTurnos.value?.errores.length ?? 0) > 0)
const sePuedenCargarTurnos = computed(
  () => revisionTurnos.value !== null && !hayErroresTurnos.value && revisionTurnos.value.listos > 0,
)

const catalogoElegido = ref<'departamentos' | 'puestos'>('departamentos')
const archivoCatalogo = ref<File | null>(null)
const resultadoCatalogo = ref<ResultadoDeCatalogo | null>(null)

const opcionesDeEmpresa = computed(() =>
  empresas.value.map((e) => ({ label: e.businessName, value: e.id })),
)

const sePuedeDescargar = computed(() => faltan.value.length === 0)
const hayErrores = computed(() => (revision.value?.errores.length ?? 0) > 0)
const sePuedeCargar = computed(
  () => revision.value !== null && !hayErrores.value && revision.value.listas > 0,
)

async function mirarRequisitos(): Promise<void> {
  if (legalEntityId.value === '') return
  revisandoRequisitos.value = true
  try {
    faltan.value = await importsApi.requisitos(legalEntityId.value)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude comprobar los catálogos'
  } finally {
    revisandoRequisitos.value = false
  }
}

onMounted(async () => {
  try {
    empresas.value = await orgApi.legalEntities()
    legalEntityId.value = empresas.value[0]?.id ?? ''
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude traer las razones sociales'
  } finally {
    cargando.value = false
  }
})

// Cambiar de empresa invalida TODO lo de la pantalla: los catálogos son suyos,
// y una revisión hecha contra otra empresa no significa nada aquí.
watch(legalEntityId, () => {
  archivoPersonal.value = null
  revision.value = null
  resultado.value = null
  resultadoCatalogo.value = null
  archivoTurnos.value = null
  revisionTurnos.value = null
  resultadoTurnos.value = null
  void mirarRequisitos()
})

function elegir(e: Event, destino: 'personal' | 'catalogo' | 'turnos'): void {
  const archivo = (e.target as HTMLInputElement).files?.[0] ?? null
  if (destino === 'personal') {
    archivoPersonal.value = archivo
    revision.value = null
    resultado.value = null
  } else if (destino === 'turnos') {
    archivoTurnos.value = archivo
    revisionTurnos.value = null
    resultadoTurnos.value = null
  } else {
    archivoCatalogo.value = archivo
    resultadoCatalogo.value = null
  }
}

async function conArchivo<T>(
  archivo: File | null,
  fn: (base64: string) => Promise<T>,
): Promise<T | null> {
  if (!archivo) return null
  trabajando.value = true
  error.value = null
  try {
    return await fn(await comoBase64(archivo))
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude procesar el archivo'
    return null
  } finally {
    trabajando.value = false
  }
}

/**
 * Las descargas van SIEMPRE por aquí.
 *
 * Llamar a la API directamente desde el `@click` deja una promesa suelta: si
 * falla, el navegador se lo traga y la pantalla no hace nada. Eso fue
 * exactamente lo que pasó con la plantilla de catálogos —el botón parecía
 * muerto y el error estaba a la vista de nadie—.
 */
async function descargar(fn: () => Promise<void>): Promise<void> {
  error.value = null
  try {
    await fn()
  } catch (e) {
    error.value =
      e instanceof ApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'No pude generar la plantilla'
  }
}

const revisar = async () => {
  revision.value = await conArchivo(archivoPersonal.value, (b) =>
    importsApi.revisar(legalEntityId.value, b),
  )
}

const cargar = async () => {
  resultado.value = await conArchivo(archivoPersonal.value, (b) =>
    importsApi.cargarPersonal(legalEntityId.value, b),
  )
  if (resultado.value) {
    const { altas, errores } = resultado.value
    if (errores.length > 0) {
      aviso.aviso(`${altas} dados de alta, ${errores.length} no`, 'Corrige esas filas y súbelas otra vez.')
    } else if (altas > 0) {
      aviso.creado(altas === 1 ? '1 expediente' : `${altas} expedientes`, 'A cada uno se le mandó su correo.')
      archivoPersonal.value = null
      revision.value = null
    }
  }
}

const revisarTurnos = async () => {
  revisionTurnos.value = await conArchivo(archivoTurnos.value, (b) =>
    importsApi.revisarTurnos(legalEntityId.value, b),
  )
}

const cargarTurnos = async () => {
  resultadoTurnos.value = await conArchivo(archivoTurnos.value, (b) =>
    importsApi.cargarTurnos(legalEntityId.value, b),
  )
  if (resultadoTurnos.value) {
    const { altas, errores } = resultadoTurnos.value
    if (errores.length > 0) {
      aviso.aviso(`${altas} turnos creados, ${errores.length} no`)
    } else if (altas > 0) {
      aviso.creado(altas === 1 ? '1 turno' : `${altas} turnos`, 'Ya se pueden asignar al personal.')
      archivoTurnos.value = null
      revisionTurnos.value = null
      // Un turno nuevo desbloquea la plantilla de personal.
      await mirarRequisitos()
    }
  }
}

const cargarCatalogo = async () => {
  resultadoCatalogo.value = await conArchivo(archivoCatalogo.value, (b) =>
    importsApi.cargarCatalogo(legalEntityId.value, catalogoElegido.value, b),
  )
  if (resultadoCatalogo.value) {
    const { altas, repetidas } = resultadoCatalogo.value
    aviso.creado(
      altas === 1 ? '1 registro' : `${altas} registros`,
      repetidas > 0 ? `${repetidas} ya existían y se saltaron.` : undefined,
    )
  }
  // Un catálogo nuevo puede desbloquear la plantilla de personal.
  await mirarRequisitos()
}

const porFila = (errores: ErrorDeFila[]) =>
  [...errores].sort((a, b) => a.fila - b.fila || a.columna.localeCompare(b.columna))
</script>

<template>
  <div class="space-y-8">
    <header>
      <h1 class="text-highlighted text-xl font-semibold">Cargar desde Excel</h1>
      <p class="text-muted mt-1 text-sm">
        Se descarga una plantilla con los desplegables ya puestos, se llena, y se sube. Nada se
        da de alta hasta que revises cuántas filas entran.
      </p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />
    <p v-if="cargando" class="text-muted text-sm">Cargando…</p>

    <template v-else>
      <UFormField label="Razón social" help="Todo lo que se cargue entra en esta empresa.">
        <USelectMenu
          v-model="legalEntityId"
          :items="opcionesDeEmpresa"
          value-key="value"
          class="w-full max-w-md"
        />
      </UFormField>

      <!-- 1. Catálogos. Van primero porque sin ellos no hay plantilla. -->
      <section class="border-default space-y-4 rounded-xl border p-5">
        <div>
          <h2 class="text-highlighted text-base font-semibold">1 · Catálogos</h2>
          <p class="text-muted mt-1 text-sm">
            Departamentos y puestos. Son las listas de las que se elige al dar de alta a alguien,
            así que tienen que existir antes.
          </p>
        </div>

        <div class="flex flex-wrap items-end gap-3">
          <UButton
            label="Descargar plantilla de catálogos"
            icon="i-lucide-download"
            size="sm"
            @click="descargar(() => importsApi.plantillaDeCatalogos())"
          />
          <UFormField label="¿Qué hoja subes?">
            <USelectMenu
              v-model="catalogoElegido"
              :items="[
                { label: 'Departamentos', value: 'departamentos' },
                { label: 'Puestos', value: 'puestos' },
              ]"
              value-key="value"
              class="w-52"
            />
          </UFormField>
          <input
            type="file"
            accept=".xlsx"
            class="text-muted file:border-default file:bg-elevated file:text-default text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm"
            @change="elegir($event, 'catalogo')"
          />
          <UButton
            label="Cargar catálogo"
            icon="i-lucide-upload"
            size="sm"
            :disabled="!archivoCatalogo || trabajando"
            :loading="trabajando"
            @click="cargarCatalogo"
          />
        </div>

        <UAlert
          v-if="resultadoCatalogo"
          :color="resultadoCatalogo.errores.length > 0 ? 'warning' : 'success'"
          :icon="
            resultadoCatalogo.errores.length > 0 ? 'i-lucide-triangle-alert' : 'i-lucide-check'
          "
          :title="`${resultadoCatalogo.altas} dados de alta`"
          :description="
            resultadoCatalogo.repetidas > 0
              ? `${resultadoCatalogo.repetidas} ya existían y se saltaron.`
              : undefined
          "
        />
        <ul v-if="resultadoCatalogo?.errores.length" class="space-y-1">
          <li
            v-for="(e, i) in porFila(resultadoCatalogo.errores)"
            :key="i"
            class="text-error text-xs"
          >
            Fila {{ e.fila }} · {{ e.columna }}: {{ e.detalle }}
          </li>
        </ul>
      </section>

      <!--
        2. Turnos. Van entre los catálogos y el personal porque son un requisito
        del personal —sin turno no se puede dar de alta a nadie— pero se llenan
        distinto: dos hojas que se cruzan.
      -->
      <section class="border-default space-y-4 rounded-xl border p-5">
        <div>
          <h2 class="text-highlighted text-base font-semibold">2 · Turnos y horarios</h2>
          <p class="text-muted mt-1 text-sm">
            Son dos hojas: en <strong>Turnos</strong> va una fila por turno, y en
            <strong>Horarios</strong> una fila por cada día de su ciclo — también por los de
            descanso. Se enlazan por la clave que tú les pongas.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <UButton
            label="Descargar plantilla de turnos"
            icon="i-lucide-download"
            size="sm"
            @click="descargar(() => importsApi.plantillaDeTurnos())"
          />
          <input
            type="file"
            accept=".xlsx"
            class="text-muted file:border-default file:bg-elevated file:text-default text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm"
            @change="elegir($event, 'turnos')"
          />
          <UButton
            label="Revisar sin crear"
            icon="i-lucide-scan-eye"
            size="sm"
            :disabled="!archivoTurnos || trabajando"
            :loading="trabajando"
            @click="revisarTurnos"
          />
        </div>

        <template v-if="revisionTurnos">
          <UAlert
            v-if="hayErroresTurnos"
            color="error"
            icon="i-lucide-circle-x"
            :title="`${revisionTurnos.errores.length} ${revisionTurnos.errores.length === 1 ? 'cosa' : 'cosas'} que corregir`"
            description="No se crea ningún turno hasta que el archivo esté limpio."
          />
          <UAlert
            v-else-if="revisionTurnos.listos > 0"
            color="success"
            icon="i-lucide-circle-check-big"
            :title="`${revisionTurnos.listos} ${revisionTurnos.listos === 1 ? 'turno listo' : 'turnos listos'}`"
            description="Todavía no se ha creado nada."
          />
          <UAlert
            v-else
            color="neutral"
            icon="i-lucide-file-question"
            title="El archivo no trae ningún turno"
            description="¿Borraste las filas de ejemplo de las DOS hojas y escribiste debajo?"
          />

          <div
            v-if="hayErroresTurnos"
            class="border-default max-h-80 overflow-y-auto rounded-lg border"
          >
            <div
              v-for="(e, i) in porFila(revisionTurnos.errores)"
              :key="i"
              class="border-default flex gap-3 border-t px-3 py-2 text-sm first:border-t-0"
            >
              <span class="text-dimmed w-20 shrink-0 font-mono text-xs">Fila {{ e.fila }}</span>
              <span class="text-highlighted w-44 shrink-0 truncate text-xs">{{ e.columna }}</span>
              <span class="text-default text-xs">{{ e.detalle }}</span>
            </div>
          </div>

          <!--
            Se enseñan los DÍAS y los DESCANSOS de cada turno, no solo el nombre:
            es lo que delata de un vistazo el error más común de esta plantilla
            —un turno semanal al que le faltan días, o al que se le olvidó marcar
            el domingo como descanso—.
          -->
          <div v-else-if="revisionTurnos.muestra.length > 0" class="space-y-1">
            <p class="text-muted text-xs tracking-wide uppercase">Lo que se va a crear</p>
            <div
              v-for="t in revisionTurnos.muestra"
              :key="t.clave"
              class="text-default flex flex-wrap gap-3 text-xs"
            >
              <span class="text-dimmed w-12 font-mono">{{ t.clave }}</span>
              <span class="font-medium">{{ t.nombre }}</span>
              <span class="text-muted">{{ t.dias }} días</span>
              <span class="text-dimmed">{{ t.descansos }} de descanso</span>
            </div>
          </div>

          <UButton
            label="Crear los turnos"
            icon="i-lucide-calendar-plus"
            :disabled="!sePuedenCargarTurnos || trabajando"
            :loading="trabajando"
            @click="cargarTurnos"
          />
        </template>

        <ul v-if="resultadoTurnos?.errores.length" class="space-y-1">
          <li v-for="(e, i) in porFila(resultadoTurnos.errores)" :key="i" class="text-error text-xs">
            Fila {{ e.fila }} · {{ e.detalle }}
          </li>
        </ul>
      </section>

      <!-- 3. Personal. Bloqueado mientras falte un catálogo. -->
      <section class="border-default space-y-4 rounded-xl border p-5">
        <div>
          <h2 class="text-highlighted text-base font-semibold">3 · Personal</h2>
          <p class="text-muted mt-1 text-sm">
            Cada fila es una persona con su base, su turno y desde cuándo entra.
          </p>
        </div>

        <!--
          NO ES UN «FALTAN CATÁLOGOS» A SECAS: dice cuál falta y dónde se llena.
          Quien descarga la plantilla normalmente no sabe que un puesto se da de
          alta en otra pantalla.
        -->
        <UAlert
          v-if="!sePuedeDescargar"
          color="warning"
          icon="i-lucide-list-x"
          title="Todavía no se puede descargar la plantilla"
        >
          <template #description>
            <p>Sus desplegables saldrían vacíos, y llenarla a mano garantiza el error.</p>
            <ul class="mt-2 space-y-1">
              <li v-for="f in faltan" :key="f.catalogo">
                <strong>{{ NOMBRE_DEL_CATALOGO[f.catalogo] ?? f.catalogo }}</strong>
                — {{ f.comoSeLlena }}
              </li>
            </ul>
          </template>
        </UAlert>

        <div class="flex flex-wrap items-center gap-3">
          <UButton
            label="Descargar plantilla de personal"
            icon="i-lucide-download"
            size="sm"
            :disabled="!sePuedeDescargar || revisandoRequisitos"
            @click="descargar(() => importsApi.plantillaDePersonal(legalEntityId))"
          />
          <input
            type="file"
            accept=".xlsx"
            class="text-muted file:border-default file:bg-elevated file:text-default text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm"
            @change="elegir($event, 'personal')"
          />
          <UButton
            label="Revisar sin cargar"
            icon="i-lucide-scan-eye"
            size="sm"
            :disabled="!archivoPersonal || trabajando"
            :loading="trabajando"
            @click="revisar"
          />
        </div>

        <template v-if="revision">
          <UAlert
            v-if="hayErrores"
            color="error"
            icon="i-lucide-circle-x"
            :title="`${revision.errores.length} ${revision.errores.length === 1 ? 'cosa' : 'cosas'} que corregir`"
            description="No se da de alta a nadie hasta que el archivo esté limpio: así se puede volver a subir corregido sin duplicar a quien ya entró."
          />
          <UAlert
            v-else-if="revision.listas > 0"
            color="success"
            icon="i-lucide-circle-check-big"
            :title="`${revision.listas} ${revision.listas === 1 ? 'persona lista' : 'personas listas'} para darse de alta`"
            description="Todavía no se ha escrito nada."
          />
          <UAlert
            v-else
            color="neutral"
            icon="i-lucide-file-question"
            title="El archivo no trae ninguna fila"
            description="¿Borraste la fila de ejemplo y escribiste debajo?"
          />

          <div
            v-if="hayErrores"
            class="border-default max-h-80 overflow-y-auto rounded-lg border"
          >
            <div
              v-for="(e, i) in porFila(revision.errores)"
              :key="i"
              class="border-default flex gap-3 border-t px-3 py-2 text-sm first:border-t-0"
            >
              <span class="text-dimmed w-20 shrink-0 font-mono text-xs">Fila {{ e.fila }}</span>
              <span class="text-highlighted w-40 shrink-0 truncate text-xs">{{ e.columna }}</span>
              <span class="text-default text-xs">{{ e.detalle }}</span>
            </div>
          </div>

          <div v-else-if="revision.muestra.length > 0" class="space-y-1">
            <p class="text-muted text-xs tracking-wide uppercase">Los primeros</p>
            <div
              v-for="p in revision.muestra"
              :key="p.fila"
              class="text-default flex flex-wrap gap-3 text-xs"
            >
              <span class="text-dimmed w-16 font-mono">Fila {{ p.fila }}</span>
              <span class="font-medium">{{ p.nombre }}</span>
              <span class="text-muted">{{ p.correo }}</span>
              <span class="text-dimmed">{{ p.base }}</span>
            </div>
          </div>

          <UButton
            label="Dar de alta a todos"
            icon="i-lucide-user-round-plus"
            :disabled="!sePuedeCargar || trabajando"
            :loading="trabajando"
            @click="cargar"
          />
        </template>

        <UAlert
          v-if="resultado"
          :color="resultado.errores.length > 0 ? 'warning' : 'success'"
          :icon="resultado.errores.length > 0 ? 'i-lucide-triangle-alert' : 'i-lucide-check'"
          :title="`${resultado.altas} dados de alta`"
          :description="
            resultado.errores.length > 0
              ? 'Algunas filas no pasaron. Corrígelas y vuelve a subir SOLO esas.'
              : 'A cada uno se le mandó su correo con su número y a dónde entra.'
          "
        />
        <ul v-if="resultado?.errores.length" class="space-y-1">
          <li v-for="(e, i) in porFila(resultado.errores)" :key="i" class="text-error text-xs">
            Fila {{ e.fila }} · {{ e.detalle }}
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
