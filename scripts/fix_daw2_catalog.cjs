const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DAW2_LOMLOE = [
  { nombre: 'Desarrollo web en entorno cliente', sigla: 'DWEC', curso: 2, departamento: 'Informática y Comunicaciones' },
  { nombre: 'Desarrollo web en entorno servidor', sigla: 'DWES', curso: 2, departamento: 'Informática y Comunicaciones' },
  { nombre: 'Despliegue de aplicaciones web', sigla: 'DAW', curso: 2, departamento: 'Informática y Comunicaciones' },
  { nombre: 'Diseño de interfaces web', sigla: 'DIW', curso: 2, departamento: 'Informática y Comunicaciones' },
  { nombre: 'IPE II - Itinerario Personal para la Empleabilidad', sigla: 'IPE2', curso: 2, departamento: 'Formación y Orientación Laboral' },
  { nombre: 'Digitalización Aplicada al Sistema Productivo', sigla: 'DIG', curso: 2, departamento: 'Informática y Comunicaciones' },
  { nombre: 'Sostenibilidad Aplicada al Sistema Productivo', sigla: 'SOS', curso: 2, departamento: 'Formación y Orientación Laboral' },
  { nombre: 'Python', sigla: 'PY', curso: 2, departamento: 'Informática y Comunicaciones' },
  { nombre: 'Proyecto de Desarrollo de Aplicaciones Web', sigla: 'PROY', curso: 2, departamento: 'Informática y Comunicaciones' }
];

async function fixDAW2() {
  console.log("--- Iniciando corrección de DAW 2º Curso (LOMLOE) ---");

  // 1. Actualizar Catálogo Global
  const dawRef = db.collection('oferta_educativa').doc('DAW_GS');
  const dawDoc = await dawRef.get();
  
  if (dawDoc.exists) {
    console.log("Actualizando catálogo global DAW_GS...");
    // Mantenemos las de 1º y actualizamos 2º
    const currentAsig = dawDoc.data().asignaturas || [];
    const asig1 = currentAsig.filter(a => a.curso === 1);
    const newAsig2 = DAW2_LOMLOE.map(({nombre, sigla, curso}) => ({nombre, sigla, curso}));
    
    await dawRef.update({
      asignaturas: [...asig1, ...newAsig2]
    });
    console.log("Catálogo global actualizado.");
  }

  // 2. Actualizar ies_asignaturas para todos los centros con DAW
  const iesStudiesSnap = await db.collection('ies_estudios').where('titulacionId', '==', 'DAW_GS').get();
  
  for (const studyDoc of iesStudiesSnap.docs) {
    const studyData = studyDoc.data();
    const iesId = studyData.iesId;
    const studyId = studyDoc.id;

    console.log(`Procesando centro: ${iesId} (${studyData.nombre})`);

    // Obtener asignaturas actuales de 2º para este centro/estudio
    const asigSnap = await db.collection('ies_asignaturas')
      .where('iesId', '==', iesId)
      .where('iesEstudioId', '==', studyId)
      .where('curso', '==', 2)
      .get();

    const existingNames = asigSnap.docs.map(d => d.data().nombre);
    
    // Eliminar las antiguas que ya no van (EIE)
    for (const doc of asigSnap.docs) {
      const data = doc.data();
      if (data.nombre.includes('Empresa e Iniciativa Emprendedora') || data.sigla === 'EIE') {
        console.log(`  Eliminando asignatura antigua: ${data.nombre}`);
        await doc.ref.delete();
      }
      // También si existía un "Módulo Optativo II" genérico lo quitamos para poner Python
      if (data.nombre === 'Módulo Optativo II' || data.sigla === 'OPT2') {
        console.log(`  Eliminando módulo optativo genérico: ${data.nombre}`);
        await doc.ref.delete();
      }
    }

    // Añadir/Actualizar las nuevas
    for (const target of DAW2_LOMLOE) {
      // Si ya existe con el nombre exacto, saltamos (para no duplicar DWEC, etc)
      // Pero si es una de las nuevas o renombradas, la creamos si no está
      const alreadyHasIt = asigSnap.docs.some(d => d.data().nombre === target.nombre);
      
      if (!alreadyHasIt) {
        console.log(`  Añadiendo: ${target.nombre}`);
        await db.collection('ies_asignaturas').add({
          iesId,
          iesEstudioId: studyId,
          titulacionId: 'DAW_GS',
          titulacionNombre: studyData.nombre,
          nombre: target.nombre,
          sigla: target.sigla,
          curso: target.curso,
          departamento: target.departamento,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }
  }

  console.log("--- Proceso completado con éxito ---");
  process.exit(0);
}

fixDAW2().catch(err => {
  console.error(err);
  process.exit(1);
});
