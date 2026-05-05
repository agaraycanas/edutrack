const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const IES_ID = 'ies_rey_fernando';

async function fixGroupsAndData() {
  console.log("--- Iniciando corrección de grupos y datos de Jesús ---");

  // 1. Borrar SMR1A y SMR1B si están vacíos
  const oldGroupNames = ['SMR1A', 'SMR1B'];
  for (const name of oldGroupNames) {
    const snap = await db.collection('grupos')
      .where('iesId', '==', IES_ID)
      .where('nombre', '==', name)
      .get();
    
    for (const doc of snap.docs) {
      // Verificar si hay imparticiones asociadas
      const impSnap = await db.collection('ies_imparticiones')
        .where('grupoId', '==', doc.id)
        .get();
      
      if (impSnap.empty) {
        await doc.ref.delete();
        console.log(`- Grupo vacío borrado: ${name} (${doc.id})`);
      } else {
        console.log(`! Grupo ${name} tiene imparticiones, no se borra.`);
      }
    }
  }

  // 2. Renombrar s1a -> SMR1A y s1b -> SMR1B
  const renameMap = { 's1a': 'SMR1A', 's1b': 'SMR1B' };
  for (const [oldName, newName] of Object.entries(renameMap)) {
    const snap = await db.collection('grupos')
      .where('iesId', '==', IES_ID)
      .where('nombre', '==', oldName)
      .get();
    
    for (const doc of snap.docs) {
      await doc.ref.update({ nombre: newName });
      console.log(`~ Grupo renombrado: ${oldName} -> ${newName} (${doc.id})`);

      // Actualizar imparticiones que referencian este grupo por nombre
      const impSnap = await db.collection('ies_imparticiones')
        .where('grupoId', '==', doc.id)
        .get();
      
      for (const impDoc of impSnap.docs) {
        await impDoc.ref.update({ grupoNombre: newName });
        console.log(`  ~ Impartición actualizada con nuevo nombre de grupo: ${impDoc.id}`);
      }
    }
  }

  // 3. Renombrar 'comentario' a 'observaciones' en las programaciones
  // Buscamos las programaciones de Jesús
  const UID = 'KLPW3ggDtGeY1WHuGEEr8vDCs7j2';
  const progSnap = await db.collection('profesor_programaciones')
    .where('usuarioId', '==', UID)
    .get();
  
  for (const doc of progSnap.docs) {
    const data = doc.data();
    if (data.temas) {
      const updatedTemas = data.temas.map(t => {
        if (t.comentario !== undefined) {
          t.observaciones = t.comentario;
          delete t.comentario;
        }
        return t;
      });
      await doc.ref.update({ temas: updatedTemas });
      console.log(`~ Programación actualizada (comentario -> observaciones): ${doc.id}`);
    }
  }

  console.log("\n--- Corrección finalizada ---");
  process.exit(0);
}

fixGroupsAndData().catch(console.error);
