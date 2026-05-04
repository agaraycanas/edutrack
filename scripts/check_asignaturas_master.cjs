const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function checkAsignaturasMaster() {
  const collections = await db.listCollections();
  const names = collections.map(col => col.id);
  console.log("Colecciones encontradas:", names.join(", "));
  
  if (names.includes('master_asignaturas')) {
    const snap = await db.collection('master_asignaturas').limit(10).get();
    console.log("Muestras de master_asignaturas:");
    snap.forEach(doc => console.log(`- ${doc.data().nombre}`));
  } else {
    console.log("No existe la colección master_asignaturas.");
  }
  process.exit(0);
}

checkAsignaturasMaster().catch(console.error);
