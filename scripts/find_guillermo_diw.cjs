const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function findGuillermoDIW() {
  const UID_GUILLERMO = "bAcANx9mPkaAQEmJqimdaIPtFYX2";
  const snap = await db.collection('ies_imparticiones')
    .where('usuarioId', '==', UID_GUILLERMO)
    .where('asignaturaSigla', '==', 'DIW')
    .get();
    
  if (snap.empty) {
    console.log("No se encontró la impartición de DIW para Guillermo.");
  } else {
    snap.forEach(doc => {
      console.log(`Impartición encontrada: ID=${doc.id}`, JSON.stringify(doc.data()));
    });
  }
  process.exit(0);
}

findGuillermoDIW().catch(console.error);
