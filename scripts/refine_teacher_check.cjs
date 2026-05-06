const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function refineCheck() {
  const userSnap = await db.collection('usuarios').get();
  const users = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const progXml = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'utf-8');
  const progData = parser.parse(progXml);

  const xmlTeachers = new Set();
  const depts = Array.isArray(progData.programacion.departamento) ? progData.programacion.departamento : [progData.programacion.departamento];
  for (const dept of depts) {
    const cursos = Array.isArray(dept.curso) ? dept.curso : [dept.curso];
    for (const curso of cursos) {
      const asigs = Array.isArray(curso.asignatura) ? curso.asignatura : [curso.asignatura];
      for (const asig of asigs) {
        if (asig.grupo && asig.grupo.profe) xmlTeachers.add(asig.grupo.profe);
      }
    }
  }

  const results = [];
  for (const t of Array.from(xmlTeachers).sort()) {
    const match = users.find(u => 
      u.nombre?.toLowerCase().includes(t.toLowerCase()) || 
      (t === 'Chema' && u.nombre?.includes('José María')) ||
      (t === 'MJose' && u.nombre?.includes('María José')) ||
      (t === 'Chus' && u.nombre?.includes('Mª Jesús')) ||
      (t === 'JLuis' && u.nombre?.includes('José Luis'))
    );

    results.push({
      xmlName: t,
      status: match ? 'REGISTRADO' : 'PENDIENTE',
      fullName: match ? match.nombre : '-',
      email: match ? match.email : '-'
    });
  }

  console.table(results);
}

refineCheck().then(() => process.exit(0));
