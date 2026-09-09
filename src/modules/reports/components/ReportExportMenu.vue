<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import { downloadFile } from '@/shared/api/download'
import type { QueryValue } from '@/shared/api/fetch-json'
import { ApiError } from '@/shared/api/errors'

/**
 * El botón de exportar, con sus formatos.
 *
 * POR QUÉ UN MENÚ Y NO DOS BOTONES
 * Excel y PDF no son alternativas del mismo peso: casi siempre se quiere el
 * Excel —se filtra, se suma, se pega en nómina— y el PDF es para entregar o
 * firmar. Dos botones lado a lado los presentan como igual de probables y
 * ocupan el doble de barra. El menú deja el uso común a un clic y el otro a dos.
 *
 * MIENTRAS DESCARGA, EL BOTÓN SE PONE A CARGAR. Un reporte de un mes tarda
 * segundos, y un botón que no acusa recibo se pulsa tres veces —tres reportes
 * calculándose a la vez por un archivo que se quería una sola vez—.
 */
const props = defineProps<{
  /** Ruta de la API, ya con su `/reports/...`. */
  path: string
  /** Lo que define QUÉ se exporta: periodo, alcance, filtros. */
  query: Record<string, QueryValue>
  /** Ofrecer la variante con el detalle día a día. */
  conDetalle?: boolean
  /**
   * Ofrecer el DESGLOSE: un bloque por persona con sus días, sus retardos y
   * sus horas extra uno por uno. Va a otra ruta —`/reports/breakdown`— porque
   * contesta otra pregunta: aquel resume el periodo, este lo enseña.
   */
  rutaDelDesglose?: string
  label?: string
}>()

const descargando = ref<string | null>(null)
const error = ref<string | null>(null)

async function exportar(
  clave: string,
  extra: Record<string, QueryValue>,
  ruta?: string,
): Promise<void> {
  if (descargando.value) return
  descargando.value = clave
  error.value = null

  try {
    await downloadFile(ruta ?? props.path, { query: { ...props.query, ...extra } })
  } catch (fallo) {
    /*
     * El aviso se pinta AQUÍ, junto al botón, y no en la alerta de la página:
     * quien acaba de pulsar «exportar» está mirando este rincón de la pantalla.
     * El `requestId` va incluido porque es lo que se pega en un reporte de
     * incidencia para que alguien pueda buscar qué pasó.
     */
    if (fallo instanceof ApiError) {
      error.value = fallo.requestId ? `${fallo.message} (${fallo.requestId})` : fallo.message
    } else {
      error.value = 'No se pudo descargar el archivo. Revisa tu conexión.'
    }
  } finally {
    descargando.value = null
  }
}

const items = computed<DropdownMenuItem[][]>(() => {
  const excel: DropdownMenuItem[] = [
    {
      label: 'Excel · resumen por persona',
      icon: 'i-lucide-sheet',
      onSelect: () => void exportar('xlsx', { format: 'xlsx' }),
    },
  ]

  if (props.conDetalle) {
    excel.push({
      label: 'Excel · con el día a día',
      icon: 'i-lucide-table-2',
      onSelect: () => void exportar('xlsx-detalle', { format: 'xlsx', daily: true }),
    })
  }

  const grupos: DropdownMenuItem[][] = [
    excel,
    [
      {
        label: 'PDF · para firmar o archivar',
        icon: 'i-lucide-file-text',
        onSelect: () => void exportar('pdf', { format: 'pdf' }),
      },
    ],
  ]

  /*
   * El desglose va en su propio grupo: no es «otro formato» del reporte de
   * arriba, es otro documento. Aquel resume el periodo con una fila por
   * persona; este trae los días de cada quien, sus retardos y sus horas extra
   * uno por uno, con su propio turno.
   */
  if (props.rutaDelDesglose) {
    grupos.push([
      {
        label: 'Desglose · Excel, día a día por persona',
        icon: 'i-lucide-list-tree',
        onSelect: () =>
          void exportar('desglose-xlsx', { format: 'xlsx' }, props.rutaDelDesglose),
      },
      {
        label: 'Desglose · Word, para entregar',
        icon: 'i-lucide-file-type-2',
        onSelect: () =>
          void exportar('desglose-docx', { format: 'docx' }, props.rutaDelDesglose),
      },
    ])
  }

  return grupos
})
</script>

<template>
  <div class="flex flex-col items-end gap-1">
    <UDropdownMenu :items="items">
      <UButton
        icon="i-lucide-download"
        :label="label ?? 'Exportar'"
        :loading="descargando !== null"
        trailing-icon="i-lucide-chevron-down"
      />
    </UDropdownMenu>

    <p v-if="error" class="text-error max-w-xs text-right text-xs">{{ error }}</p>
  </div>
</template>
