/**
 * fix_department_names.cjs
 * 
 * Corrige referencias al departamento antiguo "Informática" (sin " y Comunicaciones")
 * sustituyéndolas por "Informática y Comunicaciones" en:
 *   - ies_estudios  (campo departamentos: Array)
 *   - ies_asignaturas (campo departamento: String)
 *   - usuarios (campo roles[].departamento)
 *
 * También elimina el departamento "General" de ies_asignaturas si existe,
 * asignándolo a "Informática y Comunicaciones" cuando es una asignatura del
 * ciclo de informática, o dejando al usuario decidir.
 *
 * Uso:
 *   node scripts/fix_department_names.cjs [--dry-run]
 *
 * Requiere Application Default Credentials de Google Cloud configuradas:
 *   gcloud auth application-default login
 *   O la variable GOOGLE_APPLICATION_CREDENTIALS apuntando a un service account.
 */

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const DRY_RUN = process.argv.includes('--dry-run');

initializeApp({
  credential: applicationDefault(),
  projectId: 'edutrack-803e0',
});

const db = getFirestore();

const IES_ID      = 'ies_rey_fernando';
const OLD_NAME    = 'Informática';          // nombre obsoleto (sin " y Comunicaciones")
const NEW_NAME    = 'Informática y Comunicaciones';

let totalUpdated = 0;

function log(msg) {
  console.log(msg);
}

function dryLog(msg) {
  console.log(`[DRY-RUN] ${msg}`);
}

// ─── 1. ies_estudios ────────────────────────────────────────────────────────

async function fixEstudios() {
  log('\n=== ies_estudios ===');
  const snap = await db.collection('ies_estudios')
    .where('iesId', '==', IES_ID)
    .get();

  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const depts = data.departamentos;
    if (!Array.isArray(depts)) continue;
    if (!depts.includes(OLD_NAME)) continue;

    // Reemplazar y deduplicar
    const newDepts = [...new Set(depts.map(d => d === OLD_NAME ? NEW_NAME : d))];
    log(`  [${doc.id}] "${data.nombre || '?'}":  ${JSON.stringify(depts)} → ${JSON.stringify(newDepts)}`);
    if (!DRY_RUN) {
      await doc.ref.update({ departamentos: newDepts });
    } else {
      dryLog(`  Actualizaría departamentos en estudio ${doc.id}`);
    }
    count++;
  }
  log(`  → ${count} estudios actualizados`);
  totalUpdated += count;
}

// ─── 2. ies_asignaturas ─────────────────────────────────────────────────────

async function fixAsignaturas() {
  log('\n=== ies_asignaturas ===');
  const snap = await db.collection('ies_asignaturas')
    .where('iesId', '==', IES_ID)
    .where('departamento', '==', OLD_NAME)
    .get();

  log(`  Encontradas ${snap.size} asignaturas con departamento="${OLD_NAME}"`);

  let count = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    log(`  [${doc.id}] "${d.nombre}" (${d.titulacionNombre || '?'}, curso ${d.curso})`);
    if (!DRY_RUN) {
      await doc.ref.update({ departamento: NEW_NAME });
    } else {
      dryLog(`  Actualizaría departamento en asignatura ${doc.id}`);
    }
    count++;
  }
  log(`  → ${count} asignaturas actualizadas`);
  totalUpdated += count;
}

// ─── 3. usuarios (roles) ─────────────────────────────────────────────────────

async function fixUsuarios() {
  log('\n=== usuarios ===');
  // Obtener todos los usuarios del IES
  const snap = await db.collection('usuarios').get();

  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!Array.isArray(data.roles)) continue;

    let changed = false;
    const newRoles = data.roles.map(r => {
      if (r.iesId === IES_ID && r.departamento === OLD_NAME) {
        changed = true;
        return { ...r, departamento: NEW_NAME };
      }
      return r;
    });

    if (changed) {
      log(`  [${doc.id}] Usuario con rol en departamento antiguo`);
      if (!DRY_RUN) {
        await doc.ref.update({ roles: newRoles });
      } else {
        dryLog(`  Actualizaría roles del usuario ${doc.id}`);
      }
      count++;
    }
  }
  log(`  → ${count} usuarios actualizados`);
  totalUpdated += count;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log(`========================================`);
  log(` EduTrack – Fix Department Names`);
  log(` Proyecto : ${IES_ID}`);
  log(` Cambio   : "${OLD_NAME}" → "${NEW_NAME}"`);
  if (DRY_RUN) log(' MODO: DRY-RUN (sin cambios reales)');
  log(`========================================`);

  await fixEstudios();
  await fixAsignaturas();
  await fixUsuarios();

  log(`\n========================================`);
  log(` Total de documentos afectados: ${totalUpdated}`);
  if (DRY_RUN) log(' (DRY-RUN: ningún cambio aplicado)');
  log(`========================================`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
