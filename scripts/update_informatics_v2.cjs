const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const activeIesId = 'ies_rey_fernando';

const subjectsDAM = [
  // Curso 1
  { nombre: 'Sistemas informáticos', sigla: 'SI', curso: 1 },
  { nombre: 'Bases de Datos', sigla: 'BD', curso: 1 },
  { nombre: 'Programación', sigla: 'PROG', curso: 1 },
  { nombre: 'Lenguajes de marcas y sistemas de gestión de información', sigla: 'LM', curso: 1 },
  { nombre: 'Entornos de desarrollo', sigla: 'ED', curso: 1 },
  { nombre: 'IPE I - Itinerario Personal para la Empleabilidad', sigla: 'IPE1', curso: 1 },
  { nombre: 'Módulo Optativo I', sigla: 'OPT1', curso: 1 },
  // Curso 2
  { nombre: 'Digitalización aplicada a los sectores productivos', sigla: 'DIG', curso: 2 },
  { nombre: 'Diseño de interfaces', sigla: 'DI', curso: 2 },
  { nombre: 'Sistemas de gestión empresarial', sigla: 'SGE', curso: 2 },
  { nombre: 'Acceso a datos', sigla: 'AD', curso: 2 },
  { nombre: 'Programación de servicios y procesos', sigla: 'PSP', curso: 2 },
  { nombre: 'Programación de dispositivos móviles y multimedia', sigla: 'PMDM', curso: 2 },
  { nombre: 'Módulo Optativo II', sigla: 'OPT2', curso: 2 },
  { nombre: 'IPE II - Itinerario Personal para la Empleabilidad', sigla: 'IPE2', curso: 2 },
  { nombre: 'Sostenibilidad aplicada al sistema productivo', sigla: 'SOS', curso: 2 },
  { nombre: 'Inglés profesional', sigla: 'ING', curso: 2 }
];

const subjectsSMR = [
  // Curso 1
  { nombre: 'Montaje y mantenimiento de equipos', sigla: 'MME', curso: 1 },
  { nombre: 'Sistemas operativos monopuesto', sigla: 'SOM', curso: 1 },
  { nombre: 'Aplicaciones ofimáticas', sigla: 'AO', curso: 1 },
  { nombre: 'Redes locales', sigla: 'RL', curso: 1 },
  { nombre: 'IPE I - Itinerario Personal para la Empleabilidad', sigla: 'IPE1', curso: 1 },
  { nombre: 'Módulo Optativo I', sigla: 'OPT1', curso: 1 },
  // Curso 2
  { nombre: 'Digitalización aplicada a los sectores productivos', sigla: 'DIG', curso: 2 },
  { nombre: 'Servicios en red', sigla: 'SR', curso: 2 },
  { nombre: 'Sistemas operativos en red', sigla: 'SOR', curso: 2 },
  { nombre: 'Aplicaciones web', sigla: 'AW', curso: 2 },
  { nombre: 'Seguridad informática', sigla: 'SI', curso: 2 },
  { nombre: 'Módulo Optativo II', sigla: 'OPT2', curso: 2 },
  { nombre: 'Sostenibilidad aplicada al sistema productivo', sigla: 'SOS', curso: 2 },
  { nombre: 'IPE II - Itinerario Personal para la Empleabilidad', sigla: 'IPE2', curso: 2 },
  { nombre: 'Inglés profesional', sigla: 'ING', curso: 2 }
];

const subjectsDAW = [
  // Curso 1 (Igual que DAM1)
  { nombre: 'Sistemas informáticos', sigla: 'SI', curso: 1 },
  { nombre: 'Bases de Datos', sigla: 'BD', curso: 1 },
  { nombre: 'Programación', sigla: 'PROG', curso: 1 },
  { nombre: 'Lenguajes de marcas y sistemas de gestión de información', sigla: 'LM', curso: 1 },
  { nombre: 'Entornos de desarrollo', sigla: 'ED', curso: 1 },
  { nombre: 'IPE I - Itinerario Personal para la Empleabilidad', sigla: 'IPE1', curso: 1 },
  { nombre: 'Módulo Optativo I', sigla: 'OPT1', curso: 1 },
  // Curso 2
  { nombre: 'Desarrollo web en entorno cliente', sigla: 'DWEC', curso: 2 },
  { nombre: 'Desarrollo web en entorno servidor', sigla: 'DWES', curso: 2 },
  { nombre: 'Despliegue de aplicaciones web', sigla: 'DAW', curso: 2 },
  { nombre: 'Diseño de interfaces web', sigla: 'DIW', curso: 2 },
  { nombre: 'IPE II - Itinerario Personal para la Empleabilidad', sigla: 'IPE2', curso: 2 },
  { nombre: 'Módulo Optativo II', sigla: 'OPT2', curso: 2 },
  { nombre: 'Inglés profesional', sigla: 'ING', curso: 2 }
];

const subjectsIFC = [
  // Curso 1
  { nombre: 'Montaje y mantenimiento de sistemas y componentes informáticos', sigla: 'MMS', curso: 1 },
  { nombre: 'Operaciones auxiliares para la configuración y explotación', sigla: 'OACE', curso: 1 },
  { nombre: 'Ámbito de Ciencias Aplicadas I', sigla: 'CA1', curso: 1 },
  { nombre: 'Ámbito de Comunicación y Ciencias Sociales I', sigla: 'CS1', curso: 1 },
  // Curso 2
  { nombre: 'Ofimática y archivo de documentos', sigla: 'OAD', curso: 2 },
  { nombre: 'Instalación y mantenimiento de redes para transmisión de datos', sigla: 'IMR', curso: 2 },
  { nombre: 'Ámbito de Ciencias Aplicadas II', sigla: 'CA2', curso: 2 },
  { nombre: 'Ámbito de Comunicación y Ciencias Sociales II', sigla: 'CS2', curso: 2 }
];

async function updateAll() {
  console.log("--- Iniciando actualización del catálogo de informática ---");

  const catalogUpdates = [
    { nameMatch: 'Desarrollo de Aplicaciones Multiplataforma', subjects: subjectsDAM },
    { nameMatch: 'Sistemas Microinformáticos y Redes', subjects: subjectsSMR },
    { nameMatch: 'Desarrollo de Aplicaciones Web', subjects: subjectsDAW },
    { nameMatch: 'Informática de Oficina', subjects: subjectsIFC }
  ];

  for (const update of catalogUpdates) {
    const snapshot = await db.collection('oferta_educativa').get();
    for (const doc of snapshot.docs) {
      if (doc.data().nombre.includes(update.nameMatch)) {
        await doc.ref.update({ asignaturas: update.subjects });
        console.log(`[Oferta] Actualizado: ${doc.data().nombre} (${doc.id})`);
        
        // Ahora actualizar ies_asignaturas para este centro
        const iesEstudiosSnap = await db.collection('ies_estudios')
          .where('iesId', '==', activeIesId)
          .where('titulacionId', '==', doc.id)
          .get();
        
        for (const iesStudyDoc of iesEstudiosSnap.docs) {
          console.log(`  -> Actualizando asignaturas vinculadas en IES: ${iesStudyDoc.id}`);
          
          // 1. Obtener asignaturas actuales en IES
          const iesAsigSnap = await db.collection('ies_asignaturas')
            .where('iesId', '==', activeIesId)
            .where('iesEstudioId', '==', iesStudyDoc.id)
            .get();
          
          const existingAsigs = iesAsigSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const targetNames = new Set(update.subjects.map(s => s.nombre.toLowerCase()));

          // 2. Eliminar las que sobran (FCT, Proy, etc)
          for (const asig of existingAsigs) {
            if (!targetNames.has(asig.nombre.toLowerCase())) {
              await db.collection('ies_asignaturas').doc(asig.id).delete();
              console.log(`     - Eliminado: ${asig.nombre}`);
            }
          }

          // 3. Añadir las que faltan o actualizar existentes
          for (const targetAsig of update.subjects) {
            const existing = existingAsigs.find(a => a.nombre.toLowerCase() === targetAsig.nombre.toLowerCase());
            if (existing) {
              await db.collection('ies_asignaturas').doc(existing.id).update({
                sigla: targetAsig.sigla,
                curso: targetAsig.curso
              });
            } else {
              await db.collection('ies_asignaturas').add({
                iesId: activeIesId,
                iesEstudioId: iesStudyDoc.id,
                titulacionId: doc.id,
                titulacionNombre: iesStudyDoc.data().nombre,
                nombre: targetAsig.nombre,
                sigla: targetAsig.sigla,
                curso: targetAsig.curso,
                departamento: iesStudyDoc.data().departamentos[0] || 'Informática y Comunicaciones',
                createdAt: new Date(),
                updatedAt: new Date()
              });
              console.log(`     + Añadido: ${targetAsig.nombre}`);
            }
          }
        }
      }
    }
  }

  console.log("--- Proceso completado ---");
  process.exit(0);
}

updateAll().catch(console.error);
