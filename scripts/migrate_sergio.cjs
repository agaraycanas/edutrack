const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const UID = 'ubdagf6z3DVZyY5KzcuwP0x0wJT2'; // Sergio Fontán
const IES_ID = 'ies_rey_fernando';
const ACADEMIC_YEAR_ID = 'NIaDSaiG7RPsIgWgjNj7';
const ACADEMIC_YEAR_LABEL = '2025-2026';
const DEPT = 'Informática y Comunicaciones';

const studiesMap = {
  "SMR": "IRCwWmikBP6CKKipMQUl"
};

const asigMap = {
  "Aplicaciones ofimáticas": { id: "ehoxP5n2Yj88JkUwlDts", sigla: "AO", studyId: studiesMap.SMR },
  "Fundamentos de las Bases de datos": { id: "fBD_SMR_ID", sigla: "fBD", studyId: studiesMap.SMR }
};

const groupIds = {
  "SMR1A": "0WpywoWJcxS07E39U9tg",
  "SMR1B": "zLS6dPRowEZvpJQz6Lqh"
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

async function migrateSergio() {
  console.log("--- Iniciando migración de Sergio Fontán ---");

  // 1. Asegurar asignatura fBD para SMR
  const fbdSnap = await db.collection('ies_asignaturas')
    .where('iesEstudioId', '==', studiesMap.SMR)
    .where('sigla', '==', 'fBD')
    .get();
  
  if (fbdSnap.empty) {
    const fbdRef = await db.collection('ies_asignaturas').add({
      iesId: IES_ID,
      iesEstudioId: studiesMap.SMR,
      titulacionId: 'GM-SMR',
      titulacionNombre: 'SMR - Sistemas Microinformáticos y Redes',
      nombre: 'Fundamentos de las Bases de datos',
      sigla: 'fBD',
      curso: 1,
      departamento: DEPT,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    asigMap["Fundamentos de las Bases de datos"].id = fbdRef.id;
    console.log(`+ Asignatura fBD creada (${fbdRef.id})`);
  } else {
    asigMap["Fundamentos de las Bases de datos"].id = fbdSnap.docs[0].id;
    console.log(`= Asignatura fBD ya existe`);
  }

  const progXml = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'utf-8');
  
  const assignments = [
    { asig: "Aplicaciones ofimáticas", grupo: "s1a", targetGroup: "SMR1A", schedule: { Mon: 0, Tue: 0, Wed: 0, Thu: 7, Fri: 0 } },
    { asig: "Aplicaciones ofimáticas", grupo: "s1b", targetGroup: "SMR1B", schedule: { Mon: 7, Tue: 0, Wed: 0, Thu: 0, Fri: 0 } },
    { asig: "Fundamentos de las Bases de datos", grupo: "s1b", targetGroup: "SMR1B", schedule: { Mon: 0, Tue: 2, Wed: 0, Thu: 0, Fri: 0 } }
  ];

  for (const ass of assignments) {
    const asigInfo = asigMap[ass.asig];
    const grupoId = groupIds[ass.targetGroup];

    console.log(`\nProcesando: ${ass.asig} | ${ass.targetGroup}`);

    const profInitials = 'SF';
    const yearDigits = '2526';
    const studyGroupLabel = ass.targetGroup; 
    const generatedLabel = `${yearDigits}_${studyGroupLabel}_${asigInfo.sigla}_${profInitials}`;

    // a. Crear Impartición
    const impRef = await db.collection('ies_imparticiones').add({
      iesId: IES_ID,
      label: generatedLabel,
      iesEstudioId: asigInfo.studyId,
      asignaturaId: asigInfo.id,
      asignaturaNombre: ass.asig,
      asignaturaSigla: asigInfo.sigla,
      grupoId: grupoId,
      grupoNombre: ass.targetGroup,
      usuarioId: UID,
      profesorNombre: 'Sergio Fontán',
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
    const segXml = fs.readFileSync('legacy/programaciones/dat/seguimiento-Sergio.xml', 'utf-8');
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

  console.log("\n--- Migración de Sergio Fontán completada ---");
  process.exit(0);
}

migrateSergio().catch(console.error);
