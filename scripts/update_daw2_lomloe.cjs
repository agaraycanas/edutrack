const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const missingDAW2 = [
  { nombre: 'Digitalización Aplicada al Sistema Productivo', sigla: 'DIG', curso: 2, departamento: 'Informática y Comunicaciones' },
  { nombre: 'Sostenibilidad Aplicada al Sistema Productivo', sigla: 'SOS', curso: 2, departamento: 'Formación y Orientación Laboral' },
  { nombre: 'Módulo Optativo II', sigla: 'OPT2', curso: 2, departamento: 'Informática y Comunicaciones' },
  { nombre: 'Proyecto de Desarrollo de Aplicaciones Web', sigla: 'PROY', curso: 2, departamento: 'Informática y Comunicaciones' }
];

async function updateDAW2() {
  console.log("--- Actualizando DAW 2º Curso ---");
  
  // 1. Update Global Catalog (Oferta Educativa)
  const dawRef = db.collection('oferta_educativa').doc('DAW_GS');
  const dawDoc = await dawRef.get();
  if (dawDoc.exists) {
    const currentAsig = dawDoc.data().asignaturas || [];
    const newAsig = [...currentAsig];
    
    for (const m of missingDAW2) {
      if (!newAsig.some(a => a.nombre === m.nombre)) {
        newAsig.push({ nombre: m.nombre, sigla: m.sigla, curso: m.curso });
      }
    }
    await dawRef.update({ asignaturas: newAsig });
    console.log("Catálogo global de DAW actualizado.");
  }

  // 2. Update existing IES Studies (ies_estudios) and add missing subjects to ies_asignaturas
  const iesStudiesSnap = await db.collection('ies_estudios').where('titulacionId', '==', 'DAW_GS').get();
  
  for (const studyDoc of iesStudiesSnap.docs) {
    const studyData = studyDoc.data();
    const iesId = studyData.iesId;
    const studyId = studyDoc.id;

    console.log(`Procesando centro: ${iesId}`);

    for (const m of missingDAW2) {
      const q = await db.collection('ies_asignaturas')
        .where('iesId', '==', iesId)
        .where('iesEstudioId', '==', studyId)
        .where('nombre', '==', m.nombre)
        .get();

      if (q.empty) {
        console.log(`  Creando asignatura: ${m.nombre}`);
        await db.collection('ies_asignaturas').add({
          iesId,
          iesEstudioId: studyId,
          titulacionId: 'DAW_GS',
          titulacionNombre: studyData.nombre,
          nombre: m.nombre,
          sigla: m.sigla,
          curso: m.curso,
          departamento: m.departamento,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }
  }

  process.exit(0);
}

updateDAW2().catch(console.error);
