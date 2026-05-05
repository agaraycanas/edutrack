const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const UID = 'Ch0wBnG6xZPzHzUrZOJNWA5QSQO2'; // Mª Jesús
const IES_ID = 'ies_rey_fernando';
const ACADEMIC_YEAR_ID = 'NIaDSaiG7RPsIgWgjNj7';
const ACADEMIC_YEAR_LABEL = '2025-2026';
const DEPT = 'Informática y Comunicaciones';

// Mapping for Chus
const studiesMap = {
  "IFC": "L7bXUyTus9WvqCB0fBWX"
};

const asigMap = {
  "Operaciones auxiliares": { id: "pw5rjytwioJpaBsp57UA", sigla: "OACE", studyId: studiesMap.IFC },
  "Ofimática y archivo de documentos": { id: "GP6gTrZdKb19M6VGBguJ", sigla: "OAD", studyId: studiesMap.IFC }
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

async function migrateChus() {
  console.log("--- Iniciando migración de María Jesús Bodas ---");

  // 1. Asegurar grupos IFC1 e IFC2
  const groupsToCreate = [
    { nombre: 'IFC1', curso: 1, studyId: studiesMap.IFC, titulacion: 'IFC - Informática de Oficina' },
    { nombre: 'IFC2', curso: 2, studyId: studiesMap.IFC, titulacion: 'IFC - Informática de Oficina' }
  ];

  const groupIds = {};

  for (const g of groupsToCreate) {
    const snap = await db.collection('ies_grupos')
      .where('iesId', '==', IES_ID)
      .where('nombre', '==', g.nombre)
      .get();
    
    if (snap.empty) {
      const docRef = await db.collection('ies_grupos').add({
        iesId: IES_ID,
        iesEstudioId: g.studyId,
        nombre: g.nombre,
        curso: g.curso,
        titulacionNombre: g.titulacion,
        departamento: DEPT,
        cursoAcademicoNombre: ACADEMIC_YEAR_LABEL,
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
  const progXml = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'utf-8');
  
  const assignments = [
    { asig: "Operaciones auxiliares", grupo: "i1", schedule: { Mon: 0, Tue: 3, Wed: 0, Thu: 1, Fri: 2 } },
    { asig: "Ofimática y archivo de documentos", grupo: "i2", schedule: { Mon: 3, Tue: 1, Wed: 1, Thu: 2, Fri: 2 } }
  ];

  const groupMapping = { "i1": "IFC1", "i2": "IFC2" };

  for (const ass of assignments) {
    const asigInfo = asigMap[ass.asig];
    const targetGroup = groupMapping[ass.grupo];
    const grupoId = groupIds[targetGroup];

    console.log(`\nProcesando: ${ass.asig} | ${targetGroup}`);

    const profInitials = 'MB';
    const yearDigits = '2526';
    const studyGroupLabel = targetGroup; // "IFC1" o "IFC2"
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
      grupoNombre: targetGroup,
      usuarioId: UID,
      profesorNombre: 'María Jesús Bodas',
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
    // Nota: El XML usa el nombre exacto de la asignatura.
    // Buscamos el bloque de la asignatura que tenga el grupo correcto
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

    // d. Cargar Seguimiento
    const segXml = fs.readFileSync('legacy/programaciones/dat/seguimiento-Chus.xml', 'utf-8');
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

  console.log("\n--- Migración de María Jesús Bodas completada ---");
  process.exit(0);
}

migrateChus().catch(console.error);
