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
  profesorId: 'lDAyZWxvl0gIUjVrtjiWMo76iUD2',
  grupos: {
    'w2': 'UmyCsrcSy5miFHzZuh83',
    's1a': '0WpywoWJcxS07E39U9tg',
    's1b': 'zLS6dPRowEZvpJQz6Lqh'
  },
  asignaturas: {
    'Despliegue de aplicaciones web': 'tzh7r5H15FoLFJnwNlqZ',
    'Redes locales': 'COZ2tYZqYcRSTq3esmsf',
    'Aplicaciones ofimáticas': 'ehoxP5n2Yj88JkUwlDts'
  }
};

async function migrate() {
  console.log('Starting FIXED migration for Beatriz López Méndez (blopezmendez)...');

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
        if (asig.grupo && (asig.grupo.profe === 'Bea' || asig.grupo.nif === 'Bea')) {
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

  // 3. Parse seguimiento-Bea.xml
  console.log('Parsing legacy seguimiento-Bea.xml...');
  const trackingXml = fs.readFileSync('legacy/programaciones/dat/seguimiento-Bea.xml', 'utf8');
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
        if (tema.ffin) { // Using ffin from attributes
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

  console.log('Migration for Beatriz completed successfully.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
