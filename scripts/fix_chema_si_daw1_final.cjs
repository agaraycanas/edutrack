const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function fixChema() {
  const imparticionId = "SSw5qdd2nV3Bj0RNoQA9";
  const victorId = "UhIIfgCMP2TyIwybjJkRdqpGdzH2"; // Wait, check Chema's ID
  
  // Chema's ID from backup: WUtTm8VqUgNocI9KRpYlGHNVb592
  const chemaId = "WUtTm8VqUgNocI9KRpYlGHNVb592";

  console.log(`Fixing themes for Chema's SI (DAW1) [${imparticionId}]...`);

  // 1. Get correct themes from ies_programacion_temas
  const temasSnap = await db.collection('ies_programacion_temas')
    .where('imparticionId', '==', imparticionId)
    .get();
  
  const correctTemas = [];
  temasSnap.forEach(doc => {
    const data = doc.data();
    correctTemas.push({
      id: data.n,
      nombre: data.titulo,
      horasEstimadas: data.horas,
      completado: data.completado || false,
      fechaInicio: data.fechaInicio || null,
      fechaFin: data.fechaFin || null
    });
  });

  // Sort by id
  correctTemas.sort((a, b) => a.id - b.id);

  if (correctTemas.length === 0) {
    console.error("No correct themes found in ies_programacion_temas!");
    return;
  }

  // 2. Update profesor_programaciones
  await db.collection('profesor_programaciones').doc(imparticionId).update({
    temas: correctTemas,
    updatedAt: FieldValue.serverTimestamp()
  });

  console.log(`Successfully updated profesor_programaciones with ${correctTemas.length} themes.`);
}

fixChema().catch(console.error);
