const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function mapCatalog() {
  const snapshot = await db.collection('oferta_educativa').get();
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`${doc.id} | ${data.nombre} | ${data.tipo}`);
  });
  process.exit(0);
}

mapCatalog().catch(console.error);
