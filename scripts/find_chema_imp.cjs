const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const UID = 'UhIIfgCMP2TyIwybjJkRdqpGdzH2'; // Chema

async function findImparticiones() {
  const snapshot = await db.collection('ies_imparticiones')
    .where('usuarioId', '==', UID)
    .get();
  
  const results = snapshot.docs.map(doc => ({
    id: doc.id,
    label: doc.data().label,
    asignaturaNombre: doc.data().asignaturaNombre,
    grupoNombre: doc.data().grupoNombre
  }));
  
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

findImparticiones().catch(err => {
  console.error(err);
  process.exit(1);
});
