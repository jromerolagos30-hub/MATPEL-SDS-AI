# MATPEL SDS AI – V2 Pública

Generador web de señalización MATPEL a partir de Hojas SDS/FDS.

## Características

- Página estática para GitHub Pages.
- Carga de logo de cualquier empresa.
- Carga de PDF SDS/FDS.
- Extracción de texto del PDF en navegador.
- Modo básico sin IA.
- Modo IA usando la API Key de cada usuario.
- Generación de rótulo horizontal tipo A3.
- Descarga en PNG y PDF.
- Estructura NFPA 704 + SGA/GHS.

## Costos

El dueño del repositorio no asume costos de tokens.

Cada usuario ingresa su propia API Key de OpenAI si desea usar el análisis con IA. La clave se usa solo en la sesión del navegador y no se almacena.

## Uso en GitHub Pages

1. Subir todos los archivos al repositorio.
2. Ir a Settings > Pages.
3. Seleccionar Deploy from branch.
4. Seleccionar `main` y `/root`.
5. Guardar.
6. Abrir el enlace generado por GitHub Pages.

## Advertencia

La herramienta genera una propuesta automática. Todo rótulo debe ser revisado y aprobado por un especialista HSE/MATPEL antes de imprimirse o usarse en campo.
