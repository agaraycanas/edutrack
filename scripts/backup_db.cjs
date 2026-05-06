const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function backup() {
  const collections = ['ies_imparticiones', 'profesor_programaciones', 'ies_programacion_temas', 'profesor_horarios', 'usuarios'];
  const backupData = {};

  for (const col of collections) {
    const snap = await db.collection(col).get();
    backupData[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`Backed up ${snap.size} docs from ${col}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(__dirname, `../backups/backup-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));
  console.log(`Backup saved to ${filePath}`);
}

backup().then(() => process.exit(0)).catch(console.error);
