const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const UID = 'KLPW3ggDtGeY1WHuGEEr8vDCs7j2';
const IES_ID = 'ies_rey_fernando';

async function fixBertoloUser() {
  console.log("--- Asegurando documento de usuario para Jesús Bertolo ---");

  const userRef = db.collection('usuarios').doc(UID);
  const userSnap = await userRef.get();

  const userData = {
    nombre: 'Jesús',
    apellidos: 'Bertolo',
    email: 'jbertolo@example.com', // placeholder
    iesIds: [IES_ID],
    roles: [
      {
        iesId: IES_ID,
        rol: 'profesor',
        departamento: 'Informática y Comunicaciones',
        estado: 'activo'
      }
    ],
    updatedAt: new Date()
  };

  if (!userSnap.exists) {
    await userRef.set({
      ...userData,
      createdAt: new Date(),
      foto: `https://ui-avatars.com/api/?name=Jesus+Bertolo&background=10b981&color=fff`
    });
    console.log("+ Documento de usuario creado.");
  } else {
    await userRef.update(userData);
    console.log("~ Documento de usuario actualizado.");
  }

  console.log("--- Finalizado ---");
  process.exit(0);
}

fixBertoloUser().catch(console.error);
