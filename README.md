# Generador de Señalización MATPEL SDS/FDS - Versión 1

Página web para generar rótulos MATPEL en formato A3 horizontal a partir de Hojas de Datos de Seguridad (SDS/FDS).

## Funciones

- Carga de PDF SDS/FDS.
- Carga de logo de cualquier empresa o contratista.
- Análisis de SDS/FDS mediante Google Apps Script.
- Opción de análisis con OpenAI API si se configura una clave.
- Respaldo por reglas técnicas cuando no hay API Key.
- Generación de rótulo con:
  - NFPA 704.
  - SGA/GHS.
  - Pictogramas GHS cuando apliquen.
  - EPP recomendado según la SDS.
  - Riesgos principales.
  - Primeros auxilios.
  - Medio ambiente.
  - Almacenamiento y manejo.
  - Eliminación.
  - Transporte.
- Descarga como PNG.
- Descarga como PDF A3 horizontal.
- Descarga del JSON técnico.

## Archivos

- `index.html`: página principal.
- `styles.css`: diseño visual.
- `app.js`: lógica del navegador, generación del rótulo y descargas.
- `Code.gs`: backend Google Apps Script.
- `logo.png`: logo por defecto.

## Instalación en GitHub Pages

1. Crear un repositorio público en GitHub.
2. Subir estos archivos a la raíz del repositorio.
3. Ir a **Settings > Pages**.
4. En **Build and deployment**, seleccionar:
   - Source: Deploy from a branch.
   - Branch: main / root.
5. Guardar.
6. Abrir la URL generada por GitHub Pages.

## Configuración de Google Apps Script

1. Ir a <https://script.google.com>.
2. Crear proyecto nuevo.
3. Copiar el contenido de `Code.gs`.
4. Activar servicio avanzado:
   - Services / Servicios.
   - Agregar **Drive API**.
5. En Google Cloud del proyecto, confirmar que Drive API esté habilitada.
6. Implementar:
   - Deploy > New deployment.
   - Type: Web app.
   - Execute as: Me.
   - Who has access: Anyone.
7. Copiar la URL del Web App.
8. Pegar esa URL en la página web.

## Para activar análisis con IA

En Apps Script:

1. Ir a **Project Settings**.
2. En **Script Properties**, agregar:

```text
OPENAI_API_KEY = tu_clave_openai
```

3. Guardar y volver a desplegar.

Si no colocas `OPENAI_API_KEY`, el sistema funcionará con reglas técnicas básicas.

## Flujo recomendado

1. Subir logo de la empresa.
2. Subir PDF SDS/FDS.
3. Generar rótulo.
4. Revisar técnica y visualmente.
5. Descargar PNG o PDF A3 horizontal.

## Advertencia técnica

La generación automática no reemplaza la revisión de un especialista HSE/MATPEL. Antes de imprimir o usar en campo, validar:

- NFPA 704.
- Pictogramas SGA/GHS.
- Palabra de advertencia.
- EPP.
- Primeros auxilios.
- Transporte.
- Medio ambiente.

