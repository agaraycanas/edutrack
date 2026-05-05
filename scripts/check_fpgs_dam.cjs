const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function checkDAM() {
  const doc = await db.collection('oferta_educativa').doc('FPGS-DAM').get();
  if (doc.exists) {
    console.log("FPGS-DAM exists:");
    console.log(JSON.stringify(doc.data(), null, 2));
  } else {
    console.log("FPGS-DAM DOES NOT EXIST");
  }
  process.exit(0);
}

checkDAM().catch(console.error);
