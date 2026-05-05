const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function checkIesEstudios() {
  const activeIesId = 'ies_rey_fernando'; // From context
  const snapshot = await db.collection('ies_estudios').where('iesId', '==', activeIesId).get();
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`${doc.id} | ${data.nombre} | GlobalID: ${data.titulacionId}`);
  });
  process.exit(0);
}

checkIesEstudios().catch(console.error);
