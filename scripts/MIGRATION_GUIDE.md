# Guía de Importación de Datos Legacy (EduTrack)

Esta guía documenta los patrones y lecciones aprendidas durante la migración de datos de profesores (ej. Guillermo, Alberto) desde el sistema XML legacy a Firestore.

## 1. Estructura de Documentos en Firestore

### ies_imparticiones
- **IMPORTANTE:** Usar IDs autogenerados por Firestore (`addDoc`). No usar etiquetas personalizadas (labels) como ID del documento, ya que esto causa problemas de refresco y visibilidad en la interfaz de React.
- Asegurarse de que el campo `departamento` coincida exactamente (mayúsculas/minúsculas y tildes) con el del perfil del usuario jefe de departamento/estudios para que sea visible.

### profesor_horarios y profesor_programaciones
- **ID del Documento:** DEBE ser idéntico al ID del documento de la impartición vinculada.
- **Estructura del Horario:** El patrón semanal debe estar dentro de un campo llamado `patron`.
  ```json
  {
    "imparticionId": "ID_DE_LA_IMPARTICION",
    "usuarioId": "UID_DEL_PROFESOR",
    "patron": {
      "lunes": 0,
      "martes": 2,
      "miercoles": 2,
      "jueves": 0,
      "viernes": 0
    }
  }
  ```

## 2. Manejo de Codificación (Encoding)

Los archivos XML legacy suelen estar codificados en `latin-1` o tienen una declaración de encoding incorrecta.
- Al leer con Python, usar `encoding='latin-1'` si falla el `utf-8`.
- En Node.js, si se detectan caracteres extraños (ej. `Ã³`), se puede corregir con:
  `Buffer.from(texto, 'latin1').toString('utf8')`

## 3. Cálculos de Tiempos y Sesiones

- Las funciones de `timeCalculations.js` esperan recibir el objeto **patrón** (el que tiene los nombres de los días), no el documento completo del horario.
- Asegurarse de que el `usuarioId` en los registros de ausencias (`profesor_ausencias`) coincida con el profesor asignado a la impartición para que las horas reales se calculen correctamente en la vista de seguimiento.

## 4. Interfaz de Usuario (UI)

- El botón de volver en las vistas de detalle debe usar `navigate(-1)` para soportar la navegación desde diferentes orígenes (Mis Programaciones vs Gestión de Imparticiones).
- La vista de seguimiento soporta un parámetro `?readOnly=true` para jefes de estudios, que oculta el botón de guardar y deshabilita los inputs.
