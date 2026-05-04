const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function syncStudyNames() {
  const catalog = {
    'IFC_BASICA': 'IFC - Informática de Oficina',
    'DAW_GS': 'DAW - Desarrollo de Aplicaciones Web',
    'SMR_GM': 'SMR - Sistemas Microinformáticos y Redes',
    'DAM_GS': 'DAM - Desarrollo de Aplicaciones Multiplataforma',
    'ASIR_GS': 'ASIR - Administración de Sistemas Informáticos en Red'
  };

  const snapshot = await db.collection('ies_estudios').get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const newName = catalog[data.titulacionId];
    if (newName && data.nombre !== newName) {
      console.log(`Actualizando: ${data.nombre} -> ${newName}`);
      await doc.ref.update({ nombre: newName });
    }
  }
  process.exit(0);
}

syncStudyNames().catch(console.error);
