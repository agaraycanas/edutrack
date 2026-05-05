# Legacy to EduTrack Mappings

Este documento registra las equivalencias entre los nombres de grupos del sistema legacy y los nombres estandarizados en EduTrack.

## Grupos

| Legacy ID | EduTrack Name | Titulación / Departamento |
| :--- | :--- | :--- |
| s1a | SMR1A | SMR - Sistemas Microinformáticos y Redes |
| s1b | SMR1B | SMR - Sistemas Microinformáticos y Redes |
| s2a | SMR2A | SMR - Sistemas Microinformáticos y Redes |
| s2b | SMR2B | SMR - Sistemas Microinformáticos y Redes |
| w1 | DAW1 | DAW - Desarrollo de Aplicaciones Web |
| w2 | DAW2 | DAW - Desarrollo de Aplicaciones Web |
| m1d | DAM1D | DAM - Desarrollo de Aplicaciones Multiplataforma (Diurno) |
| m1v | DAM1V | DAM - Desarrollo de Aplicaciones Multiplataforma (Vespertino) |
| m2d | DAM2D | DAM - Desarrollo de Aplicaciones Multiplataforma (Diurno) |
| m2v | DAM2V | DAM - Desarrollo de Aplicaciones Multiplataforma (Vespertino) |
| i1 | IFC1 | IFC - Informática y Comunicaciones (FP Básica) |
| i2 | IFC2 | IFC - Informática y Comunicaciones (FP Básica) |

## Observaciones de Migración
- Al importar datos de legacy, se debe verificar primero si el nombre en EduTrack (columna 2) ya existe.
- Los comentarios de los temas en el sistema legacy se mapean al campo `observaciones` en Firestore.
