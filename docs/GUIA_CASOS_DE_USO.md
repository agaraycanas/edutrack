# Guía de Casos de Uso y Flujos de Trabajo en EduTrack

Esta guía detalla los procedimientos estándar para cada rol y el flujo de inicio de un nuevo curso académico.

---

## 📅 Flujo de Inicio de un Nuevo Curso Académico (Paso a Paso)

```
[1. Jefe de Estudios]                [2. Jefe de Departamento]             [3. Profesor]
  ├─ Crear Curso Académico              ├─ Aprobar solicitudes pendientes     ├─ Configurar Horario
  ├─ Configurar Festivos/Calendario     ├─ Asignar Imparticiones del curso    ├─ Crear Programación / Temas
  └─ Revisar Estudios, Grupos y Asig.   └─ Supervisar Seguimiento             └─ Registrar Seguimiento y Ausencias
```

---

## 👤 1. Rol: Jefe de Estudios

El Jefe de Estudios es responsable de la estructura organizativa y académica global del centro.

### 🔹 Caso de Uso 1.1: Crear un Nuevo Curso Académico
1. Cambia tu rol activo a **Jefe de Estudios** (selector superior derecho).
2. En el menú lateral, accede a **Organización ➔ Curso Académico**.
3. Pulsa en **Nuevo Curso Académico**.
4. Selecciona la **Fecha de inicio de clases** (el sistema detectará automáticamente el año, ej. `2025-2026`) y la duración de cada sesión en minutos (por defecto `55`).
5. Guarda los cambios.

### 🔹 Caso de Uso 1.2: Configurar Festivos y Calendario Escolar
1. Accede a **Organización ➔ Festivos**.
2. Añade los periodos no lectivos (Navidad, Semana Santa, festivos locales, etc.) para el nuevo curso.
3. *Esto es fundamental para que el cálculo automático de sesiones en las programaciones sea exacto.*

### 🔹 Caso de Uso 1.3: Revisar Oferta Educativa (Estudios, Grupos y Asignaturas)
1. **Académico ➔ Departamentos**: Verificar los departamentos existentes.
2. **Académico ➔ Estudios**: Comprobar los ciclos formativos/grados ofertados y sus departamentos vinculados.
3. **Organización ➔ Grupos**: Crear los grupos del nuevo curso (ej. `DAW1`, `DAW2D`, `ASIR1`, etc.) vinculados a su titulación.
4. **Académico ➔ Asignaturas**: Comprobar que todas las materias/módulos están dados de alta con sus siglas y horas asignadas.

### 🔹 Caso de Uso 1.4: Gestión de Usuarios y Roles del Centro
- **Pantalla `Gestión ➔ Usuarios`**:
  - **Checkboxes de roles**: Activan o desactivan permisos globales (`Súperadmin`, `Jefe de Estudios`, `Jefe de Depto.`, `Profesor`).
  - ⚠️ **NO desmarcar "Profesor" para cambiar de departamento**: Si desmarcas la casilla, eliminas el acceso del profesor al IES.
  - **Cambiar de Departamento a un profesor**: Pulsa el icono de **Lápiz (Editar)** en la columna *DEPARTAMENTO* de la fila de ese usuario.

---

## 👥 2. Rol: Jefe de Departamento

El Jefe de Departamento coordina a los profesores de su especialidad y asigna la docencia.

### 🔹 Caso de Uso 2.1: Aprobar Nuevos Profesores
1. Cambia tu rol activo a **Jefe de Depto.**.
2. Si un nuevo profesor se ha registrado seleccionando tu departamento, aparecerá un indicador numérico en **Gestión ➔ Solicitudes**.
3. Revisa los datos y pulsa **Aceptar**. El profesor quedará automáticamente habilitado en tu departamento.

### 🔹 Caso de Uso 2.2: Asignar Carga Docente (Imparticiones)
1. Accede a **Académico ➔ Imparticiones**.
2. Selecciona el **Curso Académico** (ej. `2025-2026`) en el filtro superior.
3. Pulsa en **Nueva Impartición**:
   - Selecciona la **Titulación** (Ciclo).
   - Selecciona el **Profesor** del departamento.
   - Selecciona el **Grupo** (ej. `DAW1`).
   - Selecciona la **Asignatura / Módulo** (ej. `LM - Lenguajes de Marcas`).
4. Al guardar, se genera el identificador estándar `AÑO_GRUPO_ASIG_INICIALES` (ej. `2526_DAW1_LM_AG`).
5. ℹ️ **Eliminación segura**: Si necesitas borrar una impartición, solo eliminas esa vinculación para ese año escolar concreto; **nunca se borra al profesor ni los datos base de la asignatura**.

### 🔹 Caso de Uso 2.3: Bloquear/Desbloquear Edición de Programaciones
1. En **Académico ➔ Imparticiones**, usa el botón superior **Edición Habilitada / Bloqueada**.
2. Bloquear la edición impide que los profesores alteren la estructura de unidades temáticas una vez aprobada la programación departamental.

### 🔹 Caso de Uso 2.4: Supervisión y Generación de Resumen
1. En **Académico ➔ Imparticiones**, haz clic en cualquier fila para ver el seguimiento del profesor en modo solo lectura.
2. Accede a **Académico ➔ Generar Resumen** para exportar informes de avance y desviaciones horarias de todo el departamento.

---

## 🧑‍🏫 3. Rol: Profesor

El profesor gestiona el día a día de sus asignaturas asignadas.

### 🔹 Caso de Uso 3.1: Primer Acceso y Registro
1. Accede a la plataforma e inicia sesión con Google / `@educa.madrid.org`.
2. Completa el formulario inicial: Nombre, Apellidos, Centro Educativo, Rol (*Profesor*) y **Departamento**.
3. Espera a que el Jefe de Departamento o Jefe de Estudios apruebe la solicitud (se recibe confirmación por correo electrónico).

### 🔹 Caso de Uso 3.2: Configurar Horario Semanal
1. Selecciona el rol **Profesor**.
2. Accede a **Mi Docencia ➔ Horarios**.
3. Asigna las horas semanales en la cuadrícula para cada una de tus asignaturas asignadas.

### 🔹 Caso de Uso 3.3: Crear y Planificar la Programación Didáctica
1. Accede a **Mi Docencia ➔ Programaciones**.
2. Selecciona la impartición correspondiente.
3. Crea las **Unidades Temáticas (UTs)**, define las sesiones previstas y vincula los criterios de evaluación.

### 🔹 Caso de Uso 3.4: Seguimiento Diario y Ausencias
1. Entra al **Seguimiento** de la programación para marcar las sesiones impartidas reales vs. previstas.
2. En **Mi Docencia ➔ Ausencias**, registra los días/sesiones de falta justificada o no lectiva para mantener la coherencia con el calendario real.

---

## 🔑 Resumen de Diferencias Clave

| Concepto | Dónde se gestiona | Qué hace | ¿Borra datos al quitar? |
| :--- | :--- | :--- | :--- |
| **Rol de Usuario** | `Gestión ➔ Usuarios` | Permite o deniega el acceso a las funciones de un rol. | Quita el acceso al rol, no borra el usuario de Firestore. |
| **Departamento del Profesor** | `Gestión ➔ Usuarios` (Lápiz) | Asigna a qué departamento pertenece el docente de forma fija. | Reasigna el departamento. |
| **Impartición (Curso Escolar)** | `Académico ➔ Imparticiones` | Asigna un profesor a una materia y grupo en un año escolar concreto. | Solo elimina la asignación docente de ese año. |
| **Nuevo Profesor** | `Login ➔ Registro ➔ Solicitudes` | Da de alta e incorpora a un profesor a la plantilla del IES. | — |
