const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

function padDate(dateStr) {
  if (!dateStr) return '';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  return dateStr;
}

async function migrateVicente() {
  const iesId = 'ies_rey_fernando';
  const vicenteId = '4XHxo00U6qVnE92bVLBx';
  const cursoAcademicoId = 'NIaDSaiG7RPsIgWgjNj7'; 
  const cursoAcademicoLabel = '2025-2026';

  const groupMapping = {
    'm1v': { id: 'XSP1IFtHq7g4J2JxB0Yo', nombre: 'DAM1V', estudioId: 'aiSkVWbNBLK6PPhWKdEh' },
    'm2v': { id: 'Sx8acrtPcUmY2rhBZdJy', nombre: 'DAM2V', estudioId: 'aiSkVWbNBLK6PPhWKdEh' }
  };

  const subjectsMapping = {
    'Bases de datos': { sigla: 'BD', id: 'gdMAobfiMAxKrGhAxHZC' },
    'Entornos de desarrollo': { sigla: 'ED', id: 'PY8KPS52CIh7kgXw4RLX' },
    'Lenguajes de marcas': { sigla: 'LM', id: 'NIU8w80WO5TR4re5iOW7' },
    'Acceso a datos': { sigla: 'AD', id: 'G3i8320IgJk45o0kLKdp' },
    'Programación de móviles y dispositivos multimedia': { sigla: 'PMDM', id: 'TBfAYvIAla7U1vuPH4JI' }
  };

  console.log('--- CLEANING PREVIOUS DATA FOR VICENTE ---');
  const impSnap = await db.collection('ies_imparticiones').where('usuarioId', '==', vicenteId).get();
  for (const doc of impSnap.docs) {
    const impId = doc.id;
    await db.collection('ies_imparticiones').doc(impId).delete();
    await db.collection('profesor_horarios').doc(impId).delete();
    await db.collection('profesor_programaciones').doc(impId).delete();
    const temasSnap = await db.collection('ies_programacion_temas').where('imparticionId', '==', impId).get();
    for (const tDoc of temasSnap.docs) {
      await db.collection('ies_programacion_temas').doc(tDoc.id).delete();
    }
  }

  console.log('--- PARSING XML DATA ---');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const progXml = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'utf-8');
  const progData = parser.parse(progXml);
  const segXml = fs.readFileSync('legacy/programaciones/dat/seguimiento-Vicente.xml', 'utf-8');
  const segData = parser.parse(segXml);

  const trackingMap = {};
  if (segData.seguimiento && segData.seguimiento.asignatura) {
    const asigs = Array.isArray(segData.seguimiento.asignatura) ? segData.seguimiento.asignatura : [segData.seguimiento.asignatura];
    asigs.forEach(a => {
      const key = `${a.grupo}_${a.nombre}`;
      trackingMap[key] = Array.isArray(a.tema) ? a.tema : [a.tema];
    });
  }

  const depts = Array.isArray(progData.programacion.departamento) ? progData.programacion.departamento : [progData.programacion.departamento];

  for (const dept of depts) {
    const cursos = Array.isArray(dept.curso) ? dept.curso : [dept.curso];
    for (const curso of cursos) {
      const asigs = Array.isArray(curso.asignatura) ? curso.asignatura : [curso.asignatura];
      for (const asig of asigs) {
        if (asig.grupo && (asig.grupo.profe === 'Vicente' || asig.grupo.nif === 'Vicente')) {
          const groupInfo = groupMapping[asig.grupo.id];
          if (!groupInfo) continue;
          const subInfo = subjectsMapping[asig.nombre];
          if (!subInfo) continue;

          console.log(`Migrating ${asig.nombre} for ${groupInfo.nombre}...`);
          const impId = `${cursoAcademicoLabel.replace('-', '')}_${groupInfo.nombre}_${subInfo.sigla}_VIC`.replace(/\s+/g, '');

          await db.collection('ies_imparticiones').doc(impId).set({
            iesId,
            usuarioId: vicenteId,
            profesorNombre: 'Vicente',
            cursoAcademicoId,
            cursoAcademicoLabel,
            iesEstudioId: groupInfo.estudioId,
            departamento: 'Informática y Comunicaciones',
            asignaturaId: subInfo.id,
            asignaturaNombre: asig.nombre,
            asignaturaSigla: subInfo.sigla,
            grupoId: groupInfo.id,
            grupoNombre: groupInfo.nombre,
            label: impId,
            createdAt: FieldValue.serverTimestamp()
          });

          const patron = {
            lunes: parseInt(asig.grupo.Mon || 0),
            martes: parseInt(asig.grupo.Tue || 0),
            miercoles: parseInt(asig.grupo.Wed || 0),
            jueves: parseInt(asig.grupo.Thu || 0),
            viernes: parseInt(asig.grupo.Fri || 0)
          };

          await db.collection('profesor_horarios').doc(impId).set({
            imparticionId: impId,
            usuarioId: vicenteId,
            patron: patron
          });

          const segTemas = trackingMap[`${asig.grupo.id}_${asig.nombre}`] || [];
          const temasFirestore = [];
          if (asig.tema) {
            const temasXml = Array.isArray(asig.tema) ? asig.tema : [asig.tema];
            for (const t of temasXml) {
              const segTema = segTemas.find(st => String(st.n) === String(t.n));
              const temaData = {
                imparticionId: impId,
                n: parseInt(t.n),
                titulo: t.titulo,
                horas: parseInt(t.horas),
                fechaInicio: segTema && segTema.fini ? padDate(segTema.fini) : null,
                fechaFin: segTema && segTema.ffin ? padDate(segTema.ffin) : null,
                observaciones: segTema && segTema.comentario ? segTema.comentario : '',
                completado: !!(segTema && segTema.fini && segTema.ffin),
                updatedAt: FieldValue.serverTimestamp()
              };
              const temaDocId = `${impId}_T${t.n}`;
              await db.collection('ies_programacion_temas').doc(temaDocId).set(temaData);
              temasFirestore.push({
                id: parseInt(t.n),
                nombre: temaData.titulo,
                horasEstimadas: temaData.horas,
                fechaInicio: temaData.fechaInicio,
                fechaFin: temaData.fechaFin,
                completado: temaData.completado,
                observaciones: temaData.observaciones
              });
            }
          }

          await db.collection('profesor_programaciones').doc(impId).set({
            imparticionId: impId,
            usuarioId: vicenteId,
            temas: temasFirestore,
            updatedAt: FieldValue.serverTimestamp()
          });
        }
      }
    }
  }
}

migrateVicente().then(() => {
  console.log('--- VICENTE MIGRATION COMPLETED SUCCESSFULLY ---');
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
