# EduTrack - Contexto del Proyecto (AI)

Este fichero sirve como memoria central para que Antigravity (o cualquier IA) pueda retomar el proyecto conociendo su estado, reglas y arquitectura.

## 🔴 REGLAS DE INTERACCIÓN (MANDATORIAS)

1. **Imágenes sin texto**: Si el usuario envía una o varias imágenes **sin texto**, la IA debe responder únicamente con la frase **"Esperando audio"** y no realizar ninguna otra acción.
2. **Comandos Git**: El comando "Haz commit" (o similar) implica siempre: `git add .`, `git commit -m "mensaje"` y **`git push`**.
3. **Directrices de Trabajo**:
    - Priorizar siempre las instrucciones de la última iteración.
    - No repetir acciones de sesiones anteriores a menos que se pida.
    - Antes de modificar código estable, verificar si la acción es necesaria.

---

## 🛠 ARQUITECTURA Y STACK

- **Frontend**: React (Vite). SPA.
- **Estilos**: Vanilla CSS moderno (Dark Mode, Glassmorphism).
- **Backend**: Firebase Firestore (Base de datos principal).
- **Autenticación**: Firebase Auth (Google Auth, validación `@educa.madrid.org`).
- **IES ID**: `ies_rey_fernando` (Identificador del instituto actual).

---

## 📊 ESTADO ACTUAL Y ESPECÍFICOS

### Festivos (Holidays)
- **Colección**: `festivos`.
- **Integridad**: `endDate` debe ser `null` (tipo Firestore) o el campo no existir si es un solo día, **nunca** la cadena de texto `"null"`.
- **Ordenación**: Mostrar siempre los más próximos/recientes primero (`startDate` desc).

### Implementado
- [x] Repositorio Git y Proyecto Vite.
- [x] Configuración Firebase y Auth (Google).
- [x] GlobalRouter y ProtectedRoute.
- [x] DashboardLayout, Home, Login (Glassmorphism).
- [x] Gestión de Departamentos y Oferta Educativa.
- [x] Migración inicial de festivos (54 periodos importados).

---

## 🚀 PRÓXIMOS PASOS

1. **Limpieza de Festivos**: Script para corregir los campos `endDate: "null"` (string) a `null` real.
2. **Cola de Aprobaciones**: Vista para que Admin/Jefe Estudios acepten nuevas cuentas.
3. **Auto-asignación**: Lógica para el Admin Supremo.
4. **Gestión de Grupos**: Niveles y grupos específicos vinculados a titulaciones.
