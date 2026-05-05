const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const UID = 'KLPW3ggDtGeY1WHuGEEr8vDCs7j2';
const IES_ID = 'ies_rey_fernando';
const STUDY_ID = 'IRCwWmikBP6CKKipMQUl';

// Mapping from subject name in XML to Firestore ID and Sigla
const asigMap = {
  "Montaje y mantenimiento de equipos": { id: "18Hk4ZEKHKNvYzDqaCWx", sigla: "MME" },
  "Sistemas operativos monopuesto": { id: "2KbVVgwJPFsLm1BeeQPj", sigla: "SOM" }
};

function fixEncoding(str) {
  if (!str) return str;
  // Fix common broken UTF-8 interpreted as Latin1
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

async function migrateJesus() {
  console.log("--- Iniciando migración de Jesús Bertolo ---");

  // 1. Asegurar grupos
  const groupsToCreate = [
    { nombre: 'SMR1A', curso: 1 },
    { nombre: 'SMR1B', curso: 1 }
  ];

  const groupIds = {};

  for (const g of groupsToCreate) {
    const snap = await db.collection('grupos')
      .where('iesId', '==', IES_ID)
      .where('nombre', '==', g.nombre)
      .get();
    
    if (snap.empty) {
      const docRef = await db.collection('grupos').add({
        iesId: IES_ID,
        iesEstudioId: STUDY_ID,
        nombre: g.nombre,
        curso: g.curso,
        titulacionNombre: 'SMR - Sistemas Microinformáticos y Redes',
        departamento: 'Informática y Comunicaciones',
        cursoAcademicoNombre: '2025-2026',
        createdAt: new Date()
      });
      groupIds[g.nombre] = docRef.id;
      console.log(`+ Grupo creado: ${g.nombre} (${docRef.id})`);
    } else {
      groupIds[g.nombre] = snap.docs[0].id;
      console.log(`= Grupo ya existe: ${g.nombre} (${snap.docs[0].id})`);
    }
  }

  // 2. Extraer imparticiones y horarios de programaciones.xml
  const progXml = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'latin1');
  
  const assignments = [
    { asig: "Montaje y mantenimiento de equipos", grupo: "SMR1A", schedule: { Mon: 2, Tue: 0, Wed: 2, Thu: 0, Fri: 2 } },
    { asig: "Sistemas operativos monopuesto", grupo: "SMR1A", schedule: { Mon: 0, Tue: 2, Wed: 0, Thu: 1, Fri: 2 } },
    { asig: "Sistemas operativos monopuesto", grupo: "SMR1B", schedule: { Mon: 2, Tue: 1, Wed: 0, Thu: 2, Fri: 0 } }
  ];

  for (const ass of assignments) {
    const asigInfo = asigMap[ass.asig];
    const grupoId = groupIds[ass.grupo];

    const profInitials = 'JB';
    const yearDigits = '2526';
    const studyGroupLabel = `SMR${ass.grupo.match(/\d/)?.[0] || ''}`;
    const generatedLabel = `${yearDigits}_${studyGroupLabel}_${asigInfo.sigla}_${profInitials}`;

    // a. Crear Impartición
    const impRef = await db.collection('ies_imparticiones').add({
      iesId: IES_ID,
      label: generatedLabel,
      iesEstudioId: STUDY_ID,
      asignaturaId: asigInfo.id,
      asignaturaNombre: ass.asig,
      asignaturaSigla: asigInfo.sigla,
      grupoId: grupoId,
      grupoNombre: ass.grupo,
      usuarioId: UID, // IMPORTANTE: El dashboard usa usuarioId
      profesorNombre: 'Jesús Bertolo',
      departamento: 'Informática y Comunicaciones',
      cursoAcademicoId: 'NIaDSaiG7RPsIgWgjNj7',
      cursoAcademicoLabel: '2025-2026',
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

    // c. Extraer temas de programaciones.xml
    const asigRegex = new RegExp(`<asignatura nombre="${ass.asig}">[\\s\\S]*?<grupo id="${ass.grupo}"[\\s\\S]*?<\\/asignatura>`, 'g');
    const asigBlock = asigRegex.exec(progXml);
    const temas = [];
    if (asigBlock) {
      const temaRegex = /<tema n="(\d+)" titulo="([^"]+)" horas="(\d+)" \/>/g;
      let tMatch;
      while ((tMatch = temaRegex.exec(asigBlock[0])) !== null) {
        temas.push({
          id: parseInt(tMatch[1]),
          nombre: fixEncoding(tMatch[2]),
          horasEstimadas: parseInt(tMatch[3]),
          completado: false
        });
      }
    }
    console.log(`  + Encontrados ${temas.length} temas`);

    // d. Cargar Seguimiento de seguimiento-Jesus.xml
    const segXml = fs.readFileSync('legacy/programaciones/dat/seguimiento-Jesus.xml', 'latin1');
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

    // e. Crear Programación en Firestore
    await db.collection('profesor_programaciones').doc(impId).set({
      imparticionId: impId,
      usuarioId: UID,
      temas: temas,
      updatedAt: new Date()
    });
    console.log(`  + Programación creada`);
  }

  console.log("\n--- Migración de Jesús Bertolo completada ---");
  process.exit(0);
}

migrateJesus().catch(console.error);
