const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Helper to calculate hours between two dates given a schedule pattern
function calcularHorasRealesRaw(startDate, endDate, pattern, duracionSesion = 55) {
  if (!startDate || !endDate || !pattern) return 0;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  
  let totalSesiones = 0;
  const current = new Date(start);
  
  while (current <= end) {
    const day = current.getDay();
    const dayName = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'][day];
    const sesionesHoy = pattern[dayName] || 0;
    totalSesiones += sesionesHoy;
    current.setDate(current.getDate() + 1);
  }
  
  return (totalSesiones * duracionSesion) / 60;
}

async function normalizeIgnacio() {
  const ignacioId = 'zHvrWIqM2ORDdxgnc3LU07nCBlu1';
  
  console.log('--- STARTING IGNACIO NORMALIZATION ---');
  
  // 1. Get all imparticiones for Ignacio
  const impSnap = await db.collection('ies_imparticiones')
    .where('usuarioId', '==', ignacioId)
    .get();
    
  for (const impDoc of impSnap.docs) {
    const impId = impDoc.id;
    console.log(`Normalizing imparticion: ${impId}`);
    
    // Get horario
    const horarioDoc = await db.collection('profesor_horarios').doc(impId).get();
    const pattern = horarioDoc.exists ? horarioDoc.data().patron : null;
    
    if (!pattern) {
      console.warn(`No pattern found for ${impId}, skipping...`);
      continue;
    }
    
    // Get themes
    const temasSnap = await db.collection('ies_programacion_temas')
      .where('imparticionId', '==', impId)
      .get();
      
    const updatedTemasArray = [];
    const temasDocs = temasSnap.docs.sort((a, b) => a.data().n - b.data().n);
    
    for (const tDoc of temasDocs) {
      const data = tDoc.data();
      
      // We don't recalculate horasEstimadas if they are already in hours (which they are in my migration)
      // but we could normalize dates if they were missed.
      
      updatedTemasArray.push({
        id: data.n,
        nombre: data.titulo,
        horasEstimadas: data.horas,
        fechaInicio: data.fechaInicio,
        fechaFin: data.fechaFin,
        completado: data.completado,
        observaciones: data.observaciones || ''
      });
    }
    
    // Update the main programming doc with the ordered array
    await db.collection('profesor_programaciones').doc(impId).set({
      temas: updatedTemasArray
    }, { merge: true });
  }
  
  console.log('--- IGNACIO NORMALIZATION COMPLETED ---');
}

normalizeIgnacio().then(() => process.exit(0));
