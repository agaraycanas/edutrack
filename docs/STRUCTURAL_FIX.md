# EduTrack: Plan de Solución Estructural para Migraciones

Este documento establece las bases para evitar errores recurrentes en la migración de datos y asegurar la consistencia entre colecciones.

## 1. Mapeo de Datos Maestro (Chema)
Para evitar confusiones con la distribución de módulos, se establece el siguiente mapeo definitivo:

| Asignatura (XML) | Grupo (XML) | Nombre App (Firestore) | Sigla | Estudio |
| :--- | :--- | :--- | :--- | :--- |
| Sistemas informáticos | w1 | Sistemas Informáticos | SI | DAW1 |
| Sistemas informáticos | m1d | Sistemas Informáticos | SI | DAM1D |
| Desarrollo de interfaces | m2d | Desarrollo de Interfaces | DI | DAM2D |
| Fundamentos de las Bases de datos | s1a | Fundamentos de las Bases de datos | fBD | SMR1A |

> [!IMPORTANT]
> **NO confundir DI con SGE**. Chema imparte "Desarrollo de Interfaces" en DAM2D. "Sistemas de Gestión Empresarial" NO le pertenece.

## 2. Consistencia de Colecciones (Dual Update)
EduTrack utiliza dos modelos para el seguimiento de programaciones. Cualquier script de importación **DEBE** actualizar ambos:

1. **`ies_programacion_temas`**: Colección normalizada. **FUENTE ÚNICA DE VERDAD PARA LA UI**. Cada tema es un documento individual.
2. **`profesor_programaciones`**: Colección legacy. Se mantiene únicamente como registro histórico y para marcar el estado de migración (`normalized: true`). **NO se debe usar para lectura en componentes de la UI**.

### Protocolo de Actualización y Lectura
1. **Lectura**: Los componentes de React (Dashboard, Tracking, etc.) deben consultar **exclusivamente** `ies_programacion_temas`. No deben existir "fallbacks" a la colección legacy.
2. **Escritura**: Cualquier cambio en el seguimiento debe impactar en `ies_programacion_temas`.

## 3. Normalización de Fechas
Las fechas provenientes de sistemas legacy (formato `Y-M-D`) deben ser siempre transformadas a `YYYY-MM-DD` (ISO string) antes de subir a Firestore para asegurar la compatibilidad con los selectores de fecha (`<input type="date">`) de la web.

## 4. Notas de Implementación Futura
- No usar hardcoding de IDs en scripts si es posible; buscar por nombre de asignatura y grupo de forma case-insensitive.
- El campo `completado` en el XML legacy debe mapearse a `completado` (booleano) en Firestore.
