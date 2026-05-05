const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const UID = '2LwLh3HtffdJMlRvMRY0KLktL2C3'; // Antonio Villegas Valera
const IES_ID = 'ies_rey_fernando';
const ACADEMIC_YEAR_ID = 'NIaDSaiG7RPsIgWgjNj7';
const ACADEMIC_YEAR_LABEL = '2025-2026';
const DEPT = 'Informática y Comunicaciones';

const studiesMap = {
  "DAM": "aiSkVWbNBLK6PPhWKdEh",
  "DAW": "0JKS51nEBzvL05ZkEqdP",
  "SMR": "IRCwWmikBP6CKKipMQUl"
};

const asigMap = {
  "Programación de móviles y dispositivos multimedia": { id: "TBfAYvIAla7U1vuPH4JI", sigla: "PMDM", studyId: studiesMap.DAM },
  "Programación en Pyhton": {
    "m2d": { id: "DAM_PY_ID", sigla: "PY", studyId: studiesMap.DAM },
    "w2": { id: "cI95KdCyIYnPqfOq6lus", sigla: "PY", studyId: studiesMap.DAW },
    "s2a": { id: "SMR_PY_ID", sigla: "PY", studyId: studiesMap.SMR },
    "s2b": { id: "SMR_PY_ID", sigla: "PY", studyId: studiesMap.SMR }
  },
  "Programación en Python": { // Same as above, just in case
    "s2a": { id: "SMR_PY_ID", sigla: "PY", studyId: studiesMap.SMR },
    "s2b": { id: "SMR_PY_ID", sigla: "PY", studyId: studiesMap.SMR }
  }
};

const groupIds = {
  "DAM2D": "vPzZfK7Yw9j5YkLp9Xw7",
  "DAW2": "jNmY3hA19R9Jp9oHxvd",
  "SMR2A": "zJ0S6PRowEZvpJQz6Lqh",
  "SMR2B": "KLPW3ggDtGeY1WHuGEEr"
};

function fixEncoding(str) {
  if (!str) return str;
  return str
    .replace(/Ã¡/g, 'á').replace(/Ã©/g, 'é').replace(/Ã­/g, 'í').replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ').replace(/Ã\u0081/g, 'Á').replace(/Ã\u0089/g, 'É').replace(/Ã\u008D/g, 'Í')
    .replace(/Ã\u0093/g, 'Ó').replace(/Ã\u009A/g, 'Ú').replace(/Ã\u0091/g, 'Ñ');
}

function padDate(dStr) {
  if (!dStr) return dStr;
  const parts = dStr.split('-');
  if (parts.length !== 3) return dStr;
  return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
}

async function ensureSubject(name, sigla, studyId, titulacionId, titulacionNombre) {
  const snap = await db.collection('ies_asignaturas')
    .where('iesEstudioId', '==', studyId)
    .where('sigla', '==', sigla)
    .get();
  
  if (snap.empty) {
    const ref = await db.collection('ies_asignaturas').add({
      iesId: IES_ID,
      iesEstudioId: studyId,
      titulacionId: titulacionId,
      titulacionNombre: titulacionNombre,
      nombre: name,
      sigla: sigla,
      curso: 2,
      departamento: DEPT,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log(`+ Asignatura ${sigla} creada para ${titulacionId} (${ref.id})`);
    return ref.id;
  } else {
    console.log(`= Asignatura ${sigla} ya existe para ${titulacionId}`);
    return snap.docs[0].id;
  }
}

async function migrateAntonio() {
  console.log("--- Iniciando migración de Antonio Villegas Valera ---");

  // 1. Asegurar asignaturas missing
  asigMap["Programación en Pyhton"]["m2d"].id = await ensureSubject('Programación en Python', 'PY', studiesMap.DAM, 'GS-DAM', 'DAM - Desarrollo de Aplicaciones Multiplataforma');
  const smrPyId = await ensureSubject('Programación en Python', 'PY', studiesMap.SMR, 'GM-SMR', 'SMR - Sistemas Microinformáticos y Redes');
  asigMap["Programación en Pyhton"]["s2a"].id = smrPyId;
  asigMap["Programación en Pyhton"]["s2b"].id = smrPyId;
  asigMap["Programación en Python"]["s2a"].id = smrPyId;
  asigMap["Programación en Python"]["s2b"].id = smrPyId;

  const progXml = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'utf-8');
  
  const assignments = [
    { asig: "Programación de móviles y dispositivos multimedia", grupo: "m2d", targetGroup: "DAM2D", schedule: { Mon: 0, Tue: 1, Wed: 1, Thu: 2, Fri: 0 } },
    { asig: "Programación en Pyhton", grupo: "m2d", targetGroup: "DAM2D", schedule: { Mon: 0, Tue: 0, Wed: 2, Thu: 1, Fri: 0 } },
    { asig: "Programación en Pyhton", grupo: "w2", targetGroup: "DAW2", schedule: { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 3 } },
    { asig: "Programación en Python", grupo: "s2a", targetGroup: "SMR2A", schedule: { Mon: 3, Tue: 0, Wed: 0, Thu: 0, Fri: 0 } },
    { asig: "Programación en Python", grupo: "s2b", targetGroup: "SMR2B", schedule: { Mon: 2, Tue: 0, Wed: 1, Thu: 0, Fri: 0 } }
  ];

  for (const ass of assignments) {
    let asigInfo = asigMap[ass.asig];
    if (asigInfo[ass.grupo]) {
      asigInfo = asigInfo[ass.grupo];
    }
    const grupoId = groupIds[ass.targetGroup];

    console.log(`\nProcesando: ${ass.asig} | ${ass.targetGroup}`);

    const profInitials = 'AV';
    const yearDigits = '2526';
    const studyGroupLabel = ass.targetGroup; 
    const generatedLabel = `${yearDigits}_${studyGroupLabel}_${asigInfo.sigla}_${profInitials}`;

    // a. Crear Impartición
    const impRef = await db.collection('ies_imparticiones').add({
      iesId: IES_ID,
      label: generatedLabel,
      iesEstudioId: asigInfo.studyId,
      asignaturaId: asigInfo.id,
      asignaturaNombre: fixEncoding(ass.asig),
      asignaturaSigla: asigInfo.sigla,
      grupoId: grupoId,
      grupoNombre: ass.targetGroup,
      usuarioId: UID,
      profesorNombre: 'Antonio Villegas Valera',
      departamento: DEPT,
      cursoAcademicoId: ACADEMIC_YEAR_ID,
      cursoAcademicoLabel: ACADEMIC_YEAR_LABEL,
      estado: 'activo',
      createdAt: new Date()
    });
    const impId = impRef.id;
    console.log(`  + Impartición creada: ${impId}`);

    // b. Crear Horario
    const scheduleData = {
      imparticionId: impId,
      usuarioId: UID,
      patron: {
        lunes: ass.schedule.Mon,
        martes: ass.schedule.Tue,
        miercoles: ass.schedule.Wed,
        jueves: ass.schedule.Thu,
        viernes: ass.schedule.Fri
      }
    };
    await db.collection('profesor_horarios').doc(impId).set(scheduleData);
    console.log(`  + Horario creado`);

    // c. Extraer temas
    const asigBlocks = progXml.split('</asignatura>');
    const correctBlock = asigBlocks.find(block => 
      block.includes(`nombre="${ass.asig}"`) && 
      block.includes(`id="${ass.grupo}"`)
    );

    const temas = [];
    if (correctBlock) {
      const temaRegex = /<tema n="(\d+)" titulo="([^"]+)" horas="(\d+)" \/>/g;
      let tMatch;
      while ((tMatch = temaRegex.exec(correctBlock)) !== null) {
        temas.push({
          id: parseInt(tMatch[1]),
          nombre: fixEncoding(tMatch[2]),
          horasEstimadas: parseInt(tMatch[3]),
          completado: false
        });
      }
    }
    console.log(`  + Encontrados ${temas.length} temas`);

    // d. Cargar Seguimiento
    const segXml = fs.readFileSync('legacy/programaciones/dat/seguimiento-Antonio.xml', 'utf-8');
    const segRegex = new RegExp(`<asignatura grupo="${ass.grupo}" nombre="${ass.asig}">[\\s\\S]*?<\\/asignatura>`, 'g');
    const segBlock = segRegex.exec(segXml);
    if (segBlock) {
      const segTemaRegex = /<tema n="(\d+)" fini="([^"]*)" ffin="([^"]*)" comentario="([^"]*)"\/>/g;
      let stMatch;
      while ((stMatch = segTemaRegex.exec(segBlock[0])) !== null) {
        const n = parseInt(stMatch[1]);
        const fini = stMatch[2];
        const ffin = stMatch[3];
        const comentario = stMatch[4];
        
        const tema = temas.find(t => t.id === n);
        if (tema && fini) {
          tema.fechaInicio = padDate(fini);
          tema.fechaFin = padDate(ffin);
          tema.observaciones = fixEncoding(comentario);
          tema.completado = !!ffin;
        }
      }
    }
    console.log(`  + Seguimiento cargado`);

    // e. Crear Programación
    await db.collection('profesor_programaciones').doc(impId).set({
      imparticionId: impId,
      usuarioId: UID,
      temas: temas,
      updatedAt: new Date()
    });
    console.log(`  + Programación creada`);
  }

  console.log("\n--- Migración de Antonio Villegas Valera completada ---");
  process.exit(0);
}

migrateAntonio().catch(console.error);
