const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function seedCatalog() {
  const docRef = db.collection('oferta_educativa').doc('IFC_BASICA');
  await docRef.set({
    nombre: "Informática básica de oficina",
    tipo: "FP Grado Básico",
    familia: "Informática y Comunicaciones",
    cursos: [1, 2]
  });
  console.log("Titulación IFC añadida al catálogo global.");
  process.exit(0);
}

seedCatalog().catch(console.error);
