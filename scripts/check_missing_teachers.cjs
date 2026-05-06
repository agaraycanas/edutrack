const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function checkMissingTeachers() {
  console.log('--- ANALYZING TEACHERS FROM XML ---');
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
        if (asig.grupo && asig.grupo.profe) {
          xmlTeachers.add(asig.grupo.profe);
        }
      }
    }
  }

  console.log(`Found ${xmlTeachers.size} teachers in XML.`);

  console.log('\n--- CHECKING REGISTRATION IN FIRESTORE ---');
  const userSnap = await db.collection('usuarios').get();
  const registeredNames = new Set();
  const registeredEmails = new Set();
  
  userSnap.forEach(u => {
    const data = u.data();
    if (data.nombre) registeredNames.add(data.nombre.trim());
    if (data.email) registeredEmails.add(data.email.split('@')[0]); // Just the prefix
  });

  const missing = [];
  const registered = [];

  for (const t of Array.from(xmlTeachers).sort()) {
    // Check by name (approximate) or if we have a mapping
    let isRegistered = false;
    
    // Check if the XML name is part of a registered name
    for (const regName of registeredNames) {
      if (regName.toLowerCase().includes(t.toLowerCase())) {
        isRegistered = true;
        break;
      }
    }

    if (isRegistered) {
      registered.push(t);
    } else {
      missing.push(t);
    }
  }

  console.log('\n--- REGISTERED TEACHERS ---');
  console.log(registered.join(', '));

  console.log('\n--- MISSING / NOT LINKED TEACHERS ---');
  if (missing.length === 0) {
    console.log('All teachers from XML are registered!');
  } else {
    console.log(missing.join(', '));
  }
}

checkMissingTeachers().then(() => process.exit(0));
