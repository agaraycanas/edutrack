const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const UID = 'gFFvjCu7e9ZIWv560oUXCBSd2yp2'; // Marcos Martínez Rus
const IES_ID = 'ies_rey_fernando';
const ACADEMIC_YEAR_ID = 'NIaDSaiG7RPsIgWgjNj7';
const ACADEMIC_YEAR_LABEL = '2025-2026';
const DEPT = 'Informática y Comunicaciones';

const studiesMap = {
  "DAM": "aiSkVWbNBLK6PPhWKdEh",
  "DAW": "0JKS51nEBzvL05ZkEqdP"
};

const asigMap = {
  "Bases de datos": {
    "m1d": { id: "F7uiMW1S3Le16UzVsv47", sigla: "BD", studyId: studiesMap.DAM },
    "w1": { id: "gdMAobfiMAxKrGhAxHZC", sigla: "BD", studyId: studiesMap.DAW }
  },
  "Acceso a datos": {
    "m2d": { id: "G3i8320IgJk45o0kLKdp", sigla: "AD", studyId: studiesMap.DAM }
  }
};

const groupIds = {
  "DAM1D": "I5Wiv9kYsVTacBkm1e5I",
  "DAM2D": "vPzZfK7Yw9j5YkLp9Xw7",
  "DAW1": "otWTqydqZdADudR7NLjw"
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

async function migrateMarcos() {
  console.log("--- Iniciando migración de Marcos Martínez Rus ---");

  const progXml = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'utf-8');
  
  const assignments = [
    { asig: "Bases de datos", grupo: "m1d", targetGroup: "DAM1D", schedule: { Mon: 1, Tue: 2, Wed: 1, Thu: 0, Fri: 2 } },
    { asig: "Acceso a datos", grupo: "m2d", targetGroup: "DAM2D", schedule: { Mon: 1, Tue: 0, Wed: 0, Thu: 2, Fri: 2 } },
    { asig: "Bases de datos", grupo: "w1", targetGroup: "DAW1", schedule: { Mon: 1, Tue: 2, Wed: 1, Thu: 2, Fri: 0 } }
  ];

  for (const ass of assignments) {
    const asigInfo = asigMap[ass.asig][ass.grupo];
    const grupoId = groupIds[ass.targetGroup];

    console.log(`\nProcesando: ${ass.asig} | ${ass.targetGroup}`);

    const profInitials = 'MM';
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
      profesorNombre: 'Marcos Martínez Rus',
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
    const segXml = fs.readFileSync('legacy/programaciones/dat/seguimiento-Marcos.xml', 'utf-8');
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

  console.log("\n--- Migración de Marcos Martínez Rus completada ---");
  process.exit(0);
}

migrateMarcos().catch(console.error);
