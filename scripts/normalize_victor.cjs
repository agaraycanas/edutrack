const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Helper to pad dates like 2025-11-6 to 2025-11-06
function padDate(dateStr) {
  if (!dateStr) return '';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  return dateStr;
}

async function normalizeVictor() {
  const victorId = 'BGar5THDICSfdFBEfDqLZvZk1413';
  const iesId = 'ies_rey_fernando';

  // 1. Get Academic Year Config for session duration (55m)
  const aySnap = await db.collection('cursos_academicos').where('iesId', '==', iesId).get();
  const academicYear = aySnap.docs[0]?.data();
  const duracionSesion = academicYear?.duracionSesion || 55;

  // 2. Process all imparticiones of Victor
  const impSnap = await db.collection('ies_imparticiones').where('usuarioId', '==', victorId).get();

  for (const doc of impSnap.docs) {
    const impId = doc.id;
    console.log(`Normalizing imparticion: ${impId}`);

    // Get individual themes
    const temasSnap = await db.collection('ies_programacion_temas').where('imparticionId', '==', impId).get();
    const temas = temasSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.n - b.n);

    const updatedTemasArray = [];

    for (const t of temas) {
      // Normalization: 1 session (legacy) = 55 min -> hours with decimals
      const horasNormalizadas = (t.horas * duracionSesion) / 60;
      
      const paddedInicio = padDate(t.fechaInicio);
      const paddedFin = padDate(t.fechaFin);

      // Update individual doc
      await db.collection('ies_programacion_temas').doc(t.id).update({
        horas: horasNormalizadas,
        fechaInicio: paddedInicio,
        fechaFin: paddedFin,
        updatedAt: FieldValue.serverTimestamp()
      });

      // Prepare for array update
      updatedTemasArray.push({
        id: t.n,
        nombre: t.titulo,
        horasEstimadas: horasNormalizadas,
        fechaInicio: paddedInicio,
        fechaFin: paddedFin,
        completado: t.completado,
        observaciones: t.observaciones || ''
      });
    }

    // Update professor_programaciones temas array
    await db.collection('profesor_programaciones').doc(impId).update({
      temas: updatedTemasArray,
      updatedAt: FieldValue.serverTimestamp()
    });
  }
}

normalizeVictor().then(() => {
  console.log('--- VICTOR NORMALIZATION COMPLETED ---');
  process.exit(0);
}).catch(console.error);
