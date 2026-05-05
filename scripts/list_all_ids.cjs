const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function listAllIds() {
  const snapshot = await db.collection('oferta_educativa').get();
  const ids = snapshot.docs.map(doc => doc.id);
  console.log(JSON.stringify(ids));
  process.exit(0);
}

listAllIds().catch(console.error);
