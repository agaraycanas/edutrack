const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function migrateAll() {
  console.log('Starting global migration to normalized structure...');
  
  const progSnap = await db.collection('profesor_programaciones').get();
  console.log(`Found ${progSnap.size} programming documents.`);

  for (const progDoc of progSnap.docs) {
    const data = progDoc.data();
    const impId = progDoc.id;
    
    // Check if it's already properly normalized in the new collection
    const temasSnap = await db.collection('ies_programacion_temas')
      .where('imparticionId', '==', impId)
      .get();
      
    if (temasSnap.size > 0 && data.normalized) {
      console.log(`Skipping ${impId} (already normalized)`);
      continue;
    }

    console.log(`Migrating ${impId}...`);

    // Get department from imparticion
    const impSnap = await db.collection('ies_imparticiones').doc(impId).get();
    const impData = impSnap.data() || {};
    const dept = impData.departamento || '';
    const iesId = impData.iesId || data.iesId || 'ies_rey_fernando';

    // 1. Wipe existing themes for this imparticion in the new collection to be safe
    const batch = db.batch();
    temasSnap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    // 2. Create new theme documents
    if (data.temas && Array.isArray(data.temas)) {
      for (const [index, tema] of data.temas.entries()) {
        const n = tema.id || (index + 1);
        
        // Normalize dates to YYYY-MM-DD
        const normalize = (d) => {
          if (!d) return '';
          if (typeof d !== 'string') return '';
          if (d.includes('/')) {
            const [day, m, y] = d.split('/');
            return `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
          if (d.includes('-')) {
            const parts = d.split('-');
            if (parts[0].length === 4) {
              // YYYY-M-D to YYYY-MM-DD
              return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            } else {
              // D-M-YYYY to YYYY-MM-DD
              return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
          return d;
        };

        const themeData = {
          iesId: iesId,
          imparticionId: impId,
          n: n,
          titulo: tema.nombre || '',
          horas: Number(tema.horasEstimadas) || 0,
          fechaInicio: normalize(tema.fechaInicio),
          fechaFin: normalize(tema.fechaFin),
          observaciones: tema.observaciones || '',
          departamento: dept,
          updatedAt: new Date()
        };

        await db.collection('ies_programacion_temas').add(themeData);
      }
    }

    // 3. Mark as normalized in the legacy collection
    await db.collection('profesor_programaciones').doc(impId).update({
      normalized: true,
      updatedAt: new Date()
    });
  }

  console.log('Migration complete!');
}

migrateAll().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
