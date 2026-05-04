const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function checkCatalog() {
  const snap = await db.collection('oferta_educativa').get();
  console.log(`Titulaciones en catálogo global: ${snap.size}`);
  snap.forEach(doc => {
    console.log(`- ${doc.data().nombre} (${doc.data().tipo})`);
  });
  process.exit(0);
}

checkCatalog().catch(console.error);
