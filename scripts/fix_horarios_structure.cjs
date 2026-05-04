const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');
const path = require('path');

const credPath = path.join(__dirname, 'serviceAccountKey.json');
if (!require('fs').existsSync(credPath)) {
  console.error("Error: No se encontró serviceAccountKey.json en /scripts");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function fixSchedules() {
  console.log("--- Iniciando corrección de estructura de horarios ---");
  const schedulesSnap = await db.collection('profesor_horarios').get();
  
  let fixedCount = 0;
  
  for (const docSnap of schedulesSnap.docs) {
    const data = docSnap.data();
    console.log(`Documento encontrado: ${docSnap.id}`, JSON.stringify(data));
    
    if (data.patron) {
      console.log(`Arreglando documento: ${docSnap.id}`);
      
      const updateData = {
        lunes: Number(data.patron.lunes || 0),
        martes: Number(data.patron.martes || 0),
        miercoles: Number(data.patron.miercoles || 0),
        jueves: Number(data.patron.jueves || 0),
        viernes: Number(data.patron.viernes || 0),
        patron: FieldValue.delete(), // Eliminamos el campo obsoleto
        updatedAt: FieldValue.serverTimestamp()
      };
      
      await docSnap.ref.update(updateData);
      fixedCount++;
    }
  }
  
  console.log(`--- Proceso finalizado. Se han corregido ${fixedCount} documentos ---`);
  process.exit(0);
}

fixSchedules().catch(err => {
  console.error("Error durante la corrección:", err);
  process.exit(1);
});
