import { http } from '@/shared/api/http'
import { downloadFile } from '@/shared/api/download'
import type {
  CatalogoFaltante,
  ResultadoDeTurnos,
  RevisionDeTurnos,
  ResultadoDeCarga,
  ResultadoDeCatalogo,
  RevisionDeCarga,
} from './types'

/**
 * El archivo viaja en base64 dentro del JSON, igual que la foto del expediente.
 *
 * Se lee con `FileReader` porque es lo único que da el navegador para convertir
 * lo que alguien eligió con el selector de archivos. El prefijo `data:` se
 * manda tal cual: el servidor lo quita, y quitarlo aquí obligaría a las dos
 * puntas a ponerse de acuerdo en algo que no hace falta.
 */
export function comoBase64(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(String(lector.result))
    lector.onerror = () => rechazar(new Error('No pude leer ese archivo'))
    lector.readAsDataURL(archivo)
  })
}

export const importsApi = {
  /** Lista vacía = ya se puede descargar la plantilla de personal. */
  requisitos: (legalEntityId: string, signal?: AbortSignal) =>
    http.get<CatalogoFaltante[]>('/imports/personal/requisitos', {
      query: { legalEntityId },
      signal,
    }),

  plantillaDePersonal: (legalEntityId: string) =>
    downloadFile('/imports/personal/plantilla', { query: { legalEntityId } }),

  plantillaDeCatalogos: () => downloadFile('/imports/catalogos/plantilla'),

  /** No escribe nada: dice qué pasaría. */
  revisar: (legalEntityId: string, archivo: string) =>
    http.post<RevisionDeCarga>('/imports/personal/revisar', { legalEntityId, archivo }),

  cargarPersonal: (legalEntityId: string, archivo: string) =>
    http.post<ResultadoDeCarga>('/imports/personal', { legalEntityId, archivo }),

  /**
   * Los turnos NO piden razón social para descargar ni para revisar: sus listas
   * —modo, ciclo, jornada— son del dominio, no catálogos de una empresa. La
   * empresa solo hace falta al crearlos.
   */
  plantillaDeTurnos: () => downloadFile('/imports/turnos/plantilla'),

  revisarTurnos: (legalEntityId: string, archivo: string) =>
    http.post<RevisionDeTurnos>('/imports/turnos/revisar', { legalEntityId, archivo }),

  cargarTurnos: (legalEntityId: string, archivo: string) =>
    http.post<ResultadoDeTurnos>('/imports/turnos', { legalEntityId, archivo }),

  cargarCatalogo: (legalEntityId: string, catalogo: 'departamentos' | 'puestos', archivo: string) =>
    http.post<ResultadoDeCatalogo>('/imports/catalogos', {
      legalEntityId,
      catalogo,
      archivo,
    }),
}
