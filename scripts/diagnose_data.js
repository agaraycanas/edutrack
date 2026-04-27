
import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function diagnose() {
  const docId = '9MXqO4F7DKvZMWHPBLva'; // Programación DAW1
  console.log(`Diagnosing document: ${docId}`);
  
  const snap = await db.collection('profesor_programaciones').doc(docId).get();
  if (!snap.exists) {
    console.log('Document does not exist!');
    return;
  }
  
  const data = snap.data();
  console.log('Document found.');
  console.log('Temas count:', data.temas ? data.temas.length : 'N/A');
  
  data.temas.forEach((t, i) => {
    const issues = [];
    if (t.id === undefined) issues.push('missing id');
    if (t.nombre === undefined) issues.push('missing nombre');
    if (t.horasEstimadas === undefined) issues.push('missing horasEstimadas');
    if (typeof t.horasEstimadas !== 'number') issues.push(`horasEstimadas is ${typeof t.horasEstimadas}`);
    
    if (issues.length > 0) {
      console.log(`Tema index ${i} has issues: ${issues.join(', ')}`);
      console.log(JSON.stringify(t));
    }
  });

  console.log('Diagnosis complete.');
}

diagnose().catch(console.error);
