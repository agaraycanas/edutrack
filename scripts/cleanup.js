
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Try to use default credentials
initializeApp({
  projectId: 'edutrack-803e0'
});

const db = getFirestore();

async function cleanup() {
  const iesId = 'ies_rey_fernando';
  const oldName = 'Informática';
  const newName = 'Informática y Comunicaciones';

  console.log('Starting cleanup...');

  // 1. Update ies_estudios
  const studiesSnap = await db.collection('ies_estudios').where('iesId', '==', iesId).get();
  for (const doc of studiesSnap.docs) {
    const data = doc.data();
    if (data.departamentos && data.departamentos.includes(oldName)) {
      let newDepts = data.departamentos.map(d => d === oldName ? newName : d);
      newDepts = [...new Set(newDepts)];
      console.log(`Updating study ${doc.id}: ${data.departamentos} -> ${newDepts}`);
      await doc.ref.update({ departamentos: newDepts });
    }
  }

  // 2. Update ies_asignaturas
  const subjectsSnap = await db.collection('ies_asignaturas')
    .where('iesId', '==', iesId)
    .where('departamento', '==', oldName)
    .get();
  
  console.log(`Found ${subjectsSnap.size} subjects with old department name.`);
  for (const doc of subjectsSnap.docs) {
    console.log(`Updating subject ${doc.id} (${doc.data().nombre})`);
    await doc.ref.update({ departamento: newName });
  }

  // 3. Update users roles
  const usersSnap = await db.collection('usuarios').where('iesIds', 'array-contains', iesId).get();
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    let changed = false;
    const newRoles = data.roles?.map(r => {
      if (r.iesId === iesId && r.departamento === oldName) {
        changed = true;
        return { ...r, departamento: newName };
      }
      return r;
    });
    if (changed) {
      console.log(`Updating user ${doc.id} roles`);
      await doc.ref.update({ roles: newRoles });
    }
  }

  console.log('Cleanup finished.');
}

cleanup().catch(console.error);
