const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function diagnose() {
  console.log('--- FINDING IGNACIO ---');
  const userSnap = await db.collection('usuarios').where('email', '==', 'ipt551@educantabria.es').get();
  if (userSnap.empty) {
    console.log('Ignacio not found by email, searching by name...');
    const allUsers = await db.collection('usuarios').get();
    allUsers.forEach(u => {
      if (u.data().nombre?.includes('Ignacio')) {
        console.log(`Found: ${u.id} - ${u.data().nombre} (${u.data().email})`);
      }
    });
  } else {
    userSnap.forEach(u => console.log(`Found: ${u.id} - ${u.data().nombre}`));
  }

  console.log('\n--- FINDING GROUPS ---');
  const groupsSnap = await db.collection('ies_estudios_grupos').get();
  groupsSnap.forEach(g => {
    const data = g.data();
    if (data.nombre?.includes('DAM1') || data.nombre?.includes('DAM2')) {
      console.log(`Group: ${g.id} - ${data.nombre} (Estudio: ${data.estudioId})`);
    }
  });
}

diagnose().then(() => process.exit(0));
