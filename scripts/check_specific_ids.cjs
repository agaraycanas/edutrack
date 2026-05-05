const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const targetIds = ['0GLoM7LU7BYfQuS6k0QV', 'GM-SMR', 'IFC_BASICA', 'FPGS-DAM', 'FPGS-ASIR'];

async function checkSpecificIds() {
  for (const id of targetIds) {
    const doc = await db.collection('oferta_educativa').doc(id).get();
    if (doc.exists) {
      console.log(`FOUND: ${id} | ${doc.data().nombre}`);
    } else {
      console.log(`NOT FOUND: ${id}`);
    }
  }
  process.exit(0);
}

checkSpecificIds().catch(console.error);
