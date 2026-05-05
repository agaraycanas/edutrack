const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const activeIesId = 'ies_rey_fernando';

async function fixInglesDAM2() {
  console.log("--- Corrigiendo Inglés para DAM 2 (v2 sin índices complejos) ---");

  // 1. Encontrar el estudio de DAM en el IES (Filtro por iesId y luego en JS por nombre)
  const iesEstudioSnap = await db.collection('ies_estudios')
    .where('iesId', '==', activeIesId)
    .get();

  const damStudyDoc = iesEstudioSnap.docs.find(doc => doc.data().nombre.includes('DAM'));

  if (!damStudyDoc) {
    console.log("No se encontró el estudio DAM en el centro.");
    process.exit(0);
  }

  console.log(`Estudio encontrado: ${damStudyDoc.data().nombre} (${damStudyDoc.id})`);

  // 2. Verificar si ya existe Inglés en ies_asignaturas
  const asigSnap = await db.collection('ies_asignaturas')
    .where('iesId', '==', activeIesId)
    .where('iesEstudioId', '==', damStudyDoc.id)
    .get();

  const asigs = asigSnap.docs.map(d => ({id: d.id, ...d.data()}));
  const hasIngles = asigs.some(a => a.nombre.toLowerCase().includes('ingles') && a.curso === 2);

  if (!hasIngles) {
    console.log("Añadiendo Inglés profesional a DAM 2...");
    await db.collection('ies_asignaturas').add({
      iesId: activeIesId,
      iesEstudioId: damStudyDoc.id,
      titulacionId: damStudyDoc.data().titulacionId,
      titulacionNombre: damStudyDoc.data().nombre,
      nombre: 'Inglés profesional',
      sigla: 'ING',
      curso: 2,
      departamento: 'Inglés',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log("Inglés profesional añadido.");
  } else {
    console.log("Inglés ya existe en DAM 2.");
  }

  // 3. Asegurar en oferta_educativa también
  const globalSnap = await db.collection('oferta_educativa').get();
  for (const doc of globalSnap.docs) {
    if (doc.data().nombre.includes('DAM - Desarrollo de Aplicaciones Multiplataforma')) {
      const subjects = doc.data().asignaturas || [];
      if (!subjects.some(s => s.nombre.toLowerCase().includes('ingles') && s.curso === 2)) {
        subjects.push({ nombre: 'Inglés profesional', sigla: 'ING', curso: 2 });
        await doc.ref.update({ asignaturas: subjects });
        console.log(`Actualizado global: ${doc.data().nombre} (${doc.id})`);
      }
    }
  }

  process.exit(0);
}

fixInglesDAM2().catch(console.error);
