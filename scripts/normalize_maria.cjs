const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function normalizeMaria() {
  const mariaId = 'MHvyP86jG5Uxf0w32chgS8OaPlE3';
  
  console.log('--- STARTING MARIA NORMALIZATION ---');
  
  const impSnap = await db.collection('ies_imparticiones')
    .where('usuarioId', '==', mariaId)
    .get();
    
  for (const impDoc of impSnap.docs) {
    const impId = impDoc.id;
    console.log(`Normalizing imparticion: ${impId}`);
    
    const temasSnap = await db.collection('ies_programacion_temas')
      .where('imparticionId', '==', impId)
      .get();
      
    const updatedTemasArray = [];
    const temasDocs = temasSnap.docs.sort((a, b) => a.data().n - b.data().n);
    
    for (const tDoc of temasDocs) {
      const data = tDoc.data();
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
    
    await db.collection('profesor_programaciones').doc(impId).set({
      temas: updatedTemasArray
    }, { merge: true });
  }
  
  console.log('--- MARIA NORMALIZATION COMPLETED ---');
}

normalizeMaria().then(() => process.exit(0));
