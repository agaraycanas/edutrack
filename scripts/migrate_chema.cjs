const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const UID = 'UhIIfgCMP2TyIwybjJkRdqpGdzH2'; // Chema
const IES_ID = 'ies_rey_fernando';

// Mapping from subject name + group in XML to Firestore ID and Sigla
const asigMap = {
  "Sistemas informáticos": {
    "w1": { id: "xmf7v27QoPkNVjdOVZQk", sigla: "SI", study: "0JKS51nEBzvL05ZkEqdP", studyName: "DAW - Desarrollo de Aplicaciones Web" },
    "m1d": { id: "EWz8CuRywf9LRXXF1U6A", sigla: "SI", study: "aiSkVWbNBLK6PPhWKdEh", studyName: "DAM - Desarrollo de Aplicaciones Multiplataforma" }
  },
  "Desarrollo de interfaces": {
    "m2d": { id: "2xiNqZ4KdQfmSriXQtOG", sigla: "DI", study: "aiSkVWbNBLK6PPhWKdEh", studyName: "DAM - Desarrollo de Aplicaciones Multiplataforma" }
  },
  "Fundamentos de las Bases de datos": {
    "s1a": { id: "OCsPQU0Ww21yRgpaAL2F", sigla: "fBD", study: "IRCwWmikBP6CKKipMQUl", studyName: "SMR - Sistemas Microinformáticos y Redes" }
  }
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

async function migrateChema() {
  console.log("--- Iniciando migración corregida de José María Montalvo (Chema) ---");

  const groupsToCreate = [
    { nombre: 'DAW1', curso: 1, studyId: '0JKS51nEBzvL05ZkEqdP', studyName: 'DAW - Desarrollo de Aplicaciones Web', legacyId: 'w1' },
    { nombre: 'SMR1A', curso: 1, studyId: 'IRCwWmikBP6CKKipMQUl', studyName: 'SMR - Sistemas Microinformáticos y Redes', legacyId: 's1a' },
    { nombre: 'DAM1D', curso: 1, studyId: 'aiSkVWbNBLK6PPhWKdEh', studyName: 'DAM - Desarrollo de Aplicaciones Multiplataforma', legacyId: 'm1d' },
    { nombre: 'DAM2D', curso: 2, studyId: 'aiSkVWbNBLK6PPhWKdEh', studyName: 'DAM - Desarrollo de Aplicaciones Multiplataforma', legacyId: 'm2d' }
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
        iesEstudioId: g.studyId,
        nombre: g.nombre,
        curso: g.curso,
        titulacionNombre: g.studyName,
        departamento: 'Informática y Comunicaciones',
        cursoAcademicoNombre: '2025/2026',
        createdAt: new Date()
      });
      groupIds[g.legacyId] = docRef.id;
      console.log(`+ Grupo creado: ${g.nombre} (${docRef.id})`);
    } else {
      groupIds[g.legacyId] = snap.docs[0].id;
      console.log(`= Grupo ya existe: ${g.nombre} (${snap.docs[0].id})`);
    }
  }

  const progXml = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'latin1');
  
  const assignments = [
    { asig: "Sistemas informáticos", grupo: "w1", schedule: { Mon: 2, Tue: 0, Wed: 2, Thu: 2, Fri: 0 } },
    { asig: "Sistemas informáticos", grupo: "m1d", schedule: { Mon: 2, Tue: 0, Wed: 2, Thu: 2, Fri: 0 } },
    { asig: "Sistemas de gestión empresarial", grupo: "m2d", schedule: { Mon: 2, Tue: 1, Wed: 0, Thu: 0, Fri: 2 } },
    { asig: "Fundamentos de las Bases de datos", grupo: "s1a", schedule: { Mon: 0, Tue: 2, Wed: 0, Thu: 0, Fri: 0 } }
  ];

  for (const ass of assignments) {
    const asigInfo = asigMap[ass.asig][ass.grupo];
    const grupoId = groupIds[ass.grupo];

    const yearDigits = '2526';
    const studyLabel = ass.grupo.substring(0, 1).toUpperCase() + ass.grupo.substring(1);
    const generatedLabel = `${yearDigits}_${studyLabel}_${asigInfo.sigla}_CH`;

    // a. Buscar o crear Impartición (evitar duplicados)
    const impSnap = await db.collection('ies_imparticiones')
      .where('iesId', '==', IES_ID)
      .where('usuarioId', '==', UID)
      .where('asignaturaId', '==', asigInfo.id)
      .where('grupoId', '==', grupoId)
      .get();

    let impId;
    const impData = {
      iesId: IES_ID,
      label: generatedLabel,
      iesEstudioId: asigInfo.study,
      asignaturaId: asigInfo.id,
      asignaturaNombre: ass.asig,
      asignaturaSigla: asigInfo.sigla,
      grupoId: grupoId,
      grupoNombre: groupsToCreate.find(g => g.legacyId === ass.grupo).nombre,
      usuarioId: UID,
      profesorNombre: 'José María Montalvo García',
      departamento: 'Informática y Comunicaciones',
      cursoAcademicoId: 'NIaDSaiG7RPsIgWgjNj7',
      cursoAcademicoLabel: '2025/2026',
      estado: 'activo',
      updatedAt: new Date()
    };

    if (impSnap.empty) {
      const impRef = await db.collection('ies_imparticiones').add({
        ...impData,
        createdAt: new Date()
      });
      impId = impRef.id;
      console.log(`  + Impartición creada: ${impId} para ${ass.asig} (${ass.grupo})`);
    } else {
      impId = impSnap.docs[0].id;
      await db.collection('ies_imparticiones').doc(impId).update(impData);
      console.log(`  = Impartición actualizada: ${impId} para ${ass.asig} (${ass.grupo})`);
    }

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
    console.log(`  + Horario configurado`);

    // c. Extraer temas
    // Nota: El XML usa "Fundamentos de las Bases de datos" y grupo "s1a"
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
    const segXml = fs.readFileSync('legacy/programaciones/dat/seguimiento-Chema.xml', 'latin1');
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
    console.log(`  + Programación creada en profesor_programaciones`);
  }

  console.log("\n--- Migración de Chema completada con éxito ---");
  process.exit(0);
}

migrateChema().catch(console.error);
