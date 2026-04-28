const admin = require('firebase-admin');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../scripts/serviceAccountKey.json');
const serviceAccount = require(SERVICE_ACCOUNT_PATH);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrate() {
  const festivosColl = db.collection('festivos');
  const snapshot = await festivosColl.where('iesId', '==', 'ies_prueba').get();
  
  if (snapshot.empty) {
    console.log('No se encontraron festivos para ies_prueba.');
    return;
  }

  console.log(`Migrando ${snapshot.size} festivos a ies_rey_fernando...`);
  
  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, { iesId: 'ies_rey_fernando' });
  });

  await batch.commit();
  console.log('✓ Migración completada.');
}

migrate().catch(console.error);
