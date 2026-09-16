<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { enPlano } from '@/shared/text'

/**
 * A QUIÉN DEJAR FUERA DEL ARCHIVO.
 *
 * ══ QUÉ RESUELVE ══
 *
 * El caso real: sacar el reporte del periodo sin los dos que se fueron a mitad
 * de mes, o sin el becario que no entra en esa nómina. Hasta ahora eso era
 * exportar el Excel entero y borrar renglones a mano — con lo que el archivo
 * dejaba de poder reproducirse y nadie sabía después qué se había quitado.
 *
 * ══ TRES REGLAS QUE SOSTIENEN ESTA PANTALLA ══
 *
 * 1. SE EXCLUYE DE QUIEN ESTÁ EN EL REPORTE, no del catálogo entero. La lista
 *    que se ofrece es exactamente la gente del periodo: ofrecer a alguien que
 *    no iba a salir sería prometer un filtro que no hace nada.
 *
 * 2. SOLO TOCA EL ARCHIVO. La tabla de la pantalla no cambia, y se dice con
 *    todas las letras: quien excluye a tres personas y ve que la tabla sigue
 *    igual necesita saber que eso es lo esperado y no que no le funcionó.
 *
 * 3. NUNCA EN SILENCIO. El botón dice cuántos hay fuera, el pie dice cuántos
 *    van a salir de cuántos, y el archivo lo imprime. Un reporte de asistencia
 *    al que le faltan personas sin decirlo se firma, se archiva, y meses
 *    después nadie puede saber si faltaban porque no trabajaron o porque
 *    alguien las sacó.
 *
 * ══ POR QUÉ NO ES UN `USelectMenu` MÚLTIPLE ══
 *
 * Porque con ciento cuarenta personas hace falta ver a la vez a quién se está
 * quitando y cuántos quedan, y un desplegable de etiquetas apiladas no deja
 * leer ninguna de las dos cosas. Aquí la decisión se toma con el recuento
 * delante.
 */
export interface PersonaDelReporte {
  employeeId: string
  employeeCode: string
  employeeName: string
  /** Para buscar, no para pintar. Puede no venir. */
  departmentName?: string | null
  positionName?: string | null
}

const props = defineProps<{
  /** Exactamente la gente que saldría en el archivo. */
  personas: PersonaDelReporte[]
}>()

/** Los ids que NO entran. El padre los manda al exportar. */
const excluidos = defineModel<string[]>({ required: true })

const abierto = ref(false)
const busqueda = ref('')

/**
 * Lo elegido se edita en un borrador y solo se confirma al cerrar con
 * «Aplicar». Quien abre el diálogo, se arrepiente y cierra con la equis tiene
 * que encontrar su selección como estaba: cambiar el reporte por abrir una
 * ventana es la clase de sorpresa que hace que nadie se fíe del botón.
 */
const borrador = ref<Set<string>>(new Set())

watch(abierto, (seAbre) => {
  if (!seAbre) return
  borrador.value = new Set(excluidos.value)
  busqueda.value = ''
})

const ordenadas = computed(() =>
  [...props.personas].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode, 'es')),
)

/**
 * Se busca por TODO lo que identifica a alguien: su clave, su nombre, su puesto
 * y su departamento. Quien va a excluir no siempre se acuerda del nombre —«el
 * reporte sin los de mantenimiento»— y obligarle a elegir un campo es obligarle
 * a saber de antemano por cuál va a encontrarlo.
 */
const visibles = computed(() => {
  const q = enPlano(busqueda.value)
  if (!q) return ordenadas.value
  return ordenadas.value.filter((p) =>
    enPlano(
      `${p.employeeCode} ${p.employeeName} ${p.positionName ?? ''} ${p.departmentName ?? ''}`,
    ).includes(q),
  )
})

const cuantosQuedan = computed(() => props.personas.length - borrador.value.size)

function alternar(id: string): void {
  const copia = new Set(borrador.value)
  if (copia.has(id)) copia.delete(id)
  else copia.add(id)
  borrador.value = copia
}

/** Excluir de golpe LO QUE SE ESTÁ VIENDO, que es lo que la búsqueda acotó. */
function excluirVisibles(): void {
  const copia = new Set(borrador.value)
  for (const p of visibles.value) copia.add(p.employeeId)
  borrador.value = copia
}

function aplicar(): void {
  excluidos.value = [...borrador.value]
  abierto.value = false
}

/** Quitar la exclusión entera sin abrir el diálogo: es el arrepentimiento común. */
function limpiar(): void {
  excluidos.value = []
}

const nombreDe = (id: string): string =>
  props.personas.find((p) => p.employeeId === id)?.employeeName ?? id
</script>

<template>
  <div class="flex items-center gap-1">
    <UButton
      icon="i-lucide-user-minus"
      :label="
        excluidos.length === 0
          ? 'Excluir a alguien'
          : excluidos.length === 1
            ? '1 excluido'
            : `${excluidos.length} excluidos`
      "
      :color="excluidos.length ? 'warning' : 'neutral'"
      @click="abierto = true"
    />
    <!--
      La equis solo aparece cuando hay algo que quitar, y quita TODO sin abrir
      el diálogo: deshacer es lo que más se repite y no debería costar dos
      clics y una lectura.
    -->
    <UButton
      v-if="excluidos.length"
      icon="i-lucide-x"
      square
      size="xs"
      aria-label="Dejar de excluir a todos"
      @click="limpiar"
    />
  </div>

  <UModal v-model:open="abierto" title="Excluir del reporte">
    <template #body>
      <div class="space-y-3">
        <p class="text-muted text-sm">
          Quien quede marcado <strong>no sale en el archivo</strong>. La tabla de la pantalla no
          cambia: esto es solo para lo que se exporta, y el propio archivo deja constancia de
          cuántas personas se excluyeron.
        </p>

        <UInput
          v-model="busqueda"
          placeholder="Nombre, clave, puesto o departamento"
          icon="i-lucide-search"
          autofocus
          class="w-full"
        />

        <div class="flex items-center gap-2">
          <UButton
            v-if="busqueda.trim() && visibles.length"
            :label="`Excluir los ${visibles.length} de esta búsqueda`"
            size="xs"
            @click="excluirVisibles"
          />
          <UButton
            v-if="borrador.size"
            label="Desmarcar todos"
            size="xs"
            @click="borrador = new Set()"
          />
        </div>

        <!--
          Alto fijo y con su propio desplazamiento: con ciento cuarenta
          personas, una lista que crece empuja el pie fuera de la pantalla y el
          recuento —que es lo que sostiene la decisión— deja de verse justo
          cuando hace falta.
        -->
        <ul class="border-default max-h-80 divide-y divide-(--ui-border) overflow-y-auto border">
          <li v-if="visibles.length === 0" class="text-muted p-4 text-center text-sm">
            Nadie del periodo coincide con esa búsqueda.
          </li>
          <li
            v-for="p in visibles"
            :key="p.employeeId"
            class="hover:bg-elevated/60 flex cursor-pointer items-center gap-3 px-3 py-2"
            @click="alternar(p.employeeId)"
          >
            <UCheckbox
              :model-value="borrador.has(p.employeeId)"
              @update:model-value="alternar(p.employeeId)"
              @click.stop
            />
            <span class="text-dimmed font-mono text-xs">{{ p.employeeCode }}</span>
            <span :class="borrador.has(p.employeeId) ? 'text-dimmed line-through' : ''">
              {{ p.employeeName }}
            </span>
            <span v-if="p.positionName" class="text-dimmed ml-auto truncate text-xs">
              {{ p.positionName }}
            </span>
          </li>
        </ul>

        <div class="flex flex-wrap items-center gap-2">
          <p class="text-sm" :class="cuantosQuedan === 0 ? 'text-error' : 'text-muted'">
            <template v-if="cuantosQuedan === 0">
              No quedaría nadie: el archivo saldría vacío.
            </template>
            <template v-else>
              Saldrán <strong>{{ cuantosQuedan }}</strong> de {{ personas.length }} personas.
            </template>
          </p>
          <div class="ml-auto flex gap-2">
            <UButton label="Cancelar" @click="abierto = false" />
            <UButton
              label="Aplicar"
              icon="i-lucide-check"
              :disabled="cuantosQuedan === 0"
              @click="aplicar"
            />
          </div>
        </div>

        <!--
          Quiénes quedan fuera, por su nombre y no por un número. «3 excluidos»
          no se puede revisar; tres nombres sí, y es lo último que se lee antes
          de generar un archivo que alguien va a firmar.
        -->
        <p v-if="borrador.size" class="text-dimmed text-xs">
          Fuera: {{ [...borrador].map(nombreDe).join(' · ') }}
        </p>
      </div>
    </template>
  </UModal>
</template>
