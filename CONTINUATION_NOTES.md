# Notas de Continuación - Normalización de Datos

## Estado Actual
- **Objetivo**: Normalizar los datos del profesor Chema y asegurar la uniformidad en toda la base de datos (especialmente horas reales y formatos de fecha).
- **Progreso**: ~35% (Plan de normalización definido, scripts de migración base creados).
- **Bloqueo**: No se encuentra el archivo `serviceAccountKey.json` necesario para ejecutar los scripts de `firebase-admin` localmente (scripts como `migrate_chema.cjs`).

## Tareas Pendientes
1. **Localizar/Generar Credenciales**: Encontrar el `serviceAccountKey.json` o pedir al usuario que lo genere en la consola de Firebase y lo coloque en `scripts/`.
2. **Ejecutar Migración de Chema**: Una vez obtenidas las credenciales, ejecutar `node scripts/migrate_chema.cjs`.
3. **Normalización Global**: Crear un script que recorra todas las imparticiones y programaciones para asegurar que:
    - `fechaInicio` y `fechaFin` usen el formato ISO "YYYY-MM-DD" con padding (ej. 2025-09-01).
    - Los campos de los temas sean uniformes (`n`, `titulo`, `horas`, etc. según `normalization_plan.md`).
4. **Verificación**: Comprobar en la UI que las horas reales de Chema se calculan correctamente.

## Archivos Relevantes
- `scripts/migrate_chema.cjs`: Script principal para la migración de Chema.
- `normalization_plan.md`: Detalle del esquema propuesto.
- `src/config/firebase.js`: Configuración de Firebase para el frontend (Project ID: `edutrack-803e0`).
