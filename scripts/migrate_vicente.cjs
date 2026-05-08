const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const MAPPINGS = {
  iesId: 'ies_rey_fernando',
  cursoAcademicoId: 'NIaDSaiG7RPsIgWgjNj7',
  profesorId: '8GnD2okKYhWez67TAAGxrvI9up32',
  grupos: {
    'm1v': 'XSP1IFtHq7g4J2JxB0Yo',
    'm2v': 'Sx8acrtPcUmY2rhBZdJy'
  },
  asignaturas: {
    'Desarrollo de interfaces': '2xiNqZ4KdQfmSriXQtOG',
    'Sistemas de gestión empresarial': '2xlW3fmxmvBJEPX1PHXv',
    'Programación de servicios y procesos': '7cVXDw9JvxZR3KItO4Wg',
    'Programación de móviles y dispositivos multimedia': 'TBfAYvIAla7U1vuPH4JI', // Fixed key
    'Acceso a datos': 'G3i8320IgJk45o0kLKdp',
    'Programación': 'Y0UnvxG3LmaGdttqGDTD',
    'Bases de datos': 'gdMAobfiMAxKrGhAxHZC',
    'Lenguajes de marcas': 'NIU8w80WO5TR4re5iOW7',
    'Entornos de desarrollo': 'PY8KPS52CIh7kgXw4RLX',
    'Sistemas informáticos': 'EWz8CuRywf9LRXXF1U6A'
  }
};

async function migrate() {
  console.log('Starting FIXED migration for Vicente Cano (vcano4)...');

  // 1. Cleanup
  console.log('Cleaning up existing imparticiones and topics...');
  const imparticionesRef = db.collection('ies_imparticiones');
  const existingImparticiones = await imparticionesRef
    .where('iesId', '==', MAPPINGS.iesId)
    .where('cursoAcademicoId', '==', MAPPINGS.cursoAcademicoId)
    .where('profesorId', '==', MAPPINGS.profesorId)
    .get();

  const batch = db.batch();
  existingImparticiones.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log(`Deleted ${existingImparticiones.size} existing imparticiones.`);

  const topicsRef = db.collection('ies_programacion_temas');
  const existingTopics = await topicsRef
    .where('iesId', '==', MAPPINGS.iesId)
    .where('cursoAcademicoId', '==', MAPPINGS.cursoAcademicoId)
    .where('profesorId', '==', MAPPINGS.profesorId)
    .get();
  
  const topicBatch = db.batch();
  existingTopics.forEach(doc => topicBatch.delete(doc.ref));
  await topicBatch.commit();
  console.log(`Deleted ${existingTopics.size} existing topics.`);

  // 2. Parse programaciones.xml
  console.log('Parsing legacy programaciones.xml...');
  const xmlData = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const jsonObj = parser.parse(xmlData);

  const depts = Array.isArray(jsonObj.programacion.departamento) ? jsonObj.programacion.departamento : [jsonObj.programacion.departamento];
  
  for (const dept of depts) {
    const cursos = Array.isArray(dept.curso) ? dept.curso : [dept.curso];
    for (const curso of cursos) {
      const asigs = Array.isArray(curso.asignatura) ? curso.asignatura : [curso.asignatura];
      for (const asig of asigs) {
        if (asig.grupo && (asig.grupo.profe === 'Vicente' || asig.grupo.nif === 'Vicente')) {
          const asignaturaId = MAPPINGS.asignaturas[asig.nombre];
          const grupoId = MAPPINGS.grupos[asig.grupo.id];

          if (asignaturaId && grupoId) {
            console.log(`Adding imparticion: ${asig.nombre} for group ${asig.grupo.id}`);
            await imparticionesRef.add({
              iesId: MAPPINGS.iesId,
              cursoAcademicoId: MAPPINGS.cursoAcademicoId,
              profesorId: MAPPINGS.profesorId,
              iesAsignaturaId: asignaturaId,
              iesGrupoId: grupoId,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp()
            });
          } else {
            console.warn(`Missing mapping for Asignatura: ${asig.nombre} or Grupo: ${asig.grupo.id}`);
          }
        }
      }
    }
  }

  // 3. Parse seguimiento-Vicente.xml
  console.log('Parsing legacy seguimiento-Vicente.xml...');
  const trackingXml = fs.readFileSync('legacy/programaciones/dat/seguimiento-Vicente.xml', 'utf8');
  const trackingObj = parser.parse(trackingXml);

  if (trackingObj.seguimiento && trackingObj.seguimiento.asignatura) {
    const asigs = Array.isArray(trackingObj.seguimiento.asignatura) ? trackingObj.seguimiento.asignatura : [trackingObj.seguimiento.asignatura];
    
    for (const asig of asigs) {
      const asignaturaId = MAPPINGS.asignaturas[asig.nombre];
      const grupoId = MAPPINGS.grupos[asig.grupo];

      if (!asignaturaId || !grupoId) {
        console.warn(`Skipping tracking for ${asig.nombre} / ${asig.grupo} due to missing mapping.`);
        continue;
      }

      console.log(`Migrating tracking for ${asig.nombre} (${asig.grupo})...`);
      const temas = Array.isArray(asig.tema) ? asig.tema : (asig.tema ? [asig.tema] : []);
      
      for (const tema of temas) {
        if (tema.ffin) {
          await topicsRef.add({
            iesId: MAPPINGS.iesId,
            cursoAcademicoId: MAPPINGS.cursoAcademicoId,
            profesorId: MAPPINGS.profesorId,
            iesAsignaturaId: asignaturaId,
            iesGrupoId: grupoId,
            nombre: `Tema ${tema.n}`,
            numero: parseInt(tema.n),
            fechaInicio: tema.fini || null,
            fechaFin: tema.ffin,
            comentario: tema.comentario || '',
            completado: true,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
        }
      }
    }
  }

  console.log('Migration for Vicente completed successfully.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
