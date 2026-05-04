const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function analyzeProductionData() {
  console.log("--- Analizando datos de producción ---");
  
  // 1. Get linked studies
  const studiesSnap = await db.collection('ies_estudios').get();
  console.log(`Titulaciones vinculadas en centros: ${studiesSnap.size}`);
  
  // 2. Get subjects
  const subjectsSnap = await db.collection('ies_asignaturas').get();
  console.log(`Asignaturas totales en centros: ${subjectsSnap.size}`);
  
  // 3. Get tracking data to see what's "untouchable"
  const trackingSnap = await db.collection('profesor_programaciones').get();
  const trackedSubjectIds = new Set();
  trackingSnap.forEach(doc => trackedSubjectIds.add(doc.data().asignaturaId));
  console.log(`Asignaturas con seguimiento activo (INTOCABLES): ${trackedSubjectIds.size}`);
  
  // List them
  for (const subId of trackedSubjectIds) {
    if (!subId) continue;
    const subDoc = await db.collection('ies_asignaturas').doc(subId).get();
    if (subDoc.exists()) {
      console.log(`- [${subId}] ${subDoc.data().nombre} (${subDoc.data().titulacionNombre})`);
    }
  }

  process.exit(0);
}

analyzeProductionData().catch(console.error);
