/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de la API de Artra, sin barra final. Ver .env.example. */
  readonly VITE_API_URL: string

  /**
   * Ficha pública de Mapbox para la foto aérea del editor de geocercas.
   * OPCIONAL: sin ella el mapa cae en Esri y todo lo demás funciona igual.
   */
  readonly VITE_MAPBOX_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
