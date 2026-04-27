/**
 * Script para importar una asignatura específica para un usuario desde XML legados.
 * 
 * Uso:
 * node scripts/import_subject.js "Programación" "agaraycanas" "seguimiento-Alberto.xml"
 * 
 * O sin argumentos para modo interactivo:
 * node scripts/import_subject.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const readline = require('readline');

// CONFIGURACIÓN - Ajusta estas rutas según tu entorno
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json');
const PROGRAMACIONES_XML = path.join(__dirname, '../legacy/programaciones/dat/programaciones.xml');
const DAT_DIR = path.join(__dirname, '../legacy/programaciones/dat/');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('\x1b[31mError: No se encontró serviceAccountKey.json en la carpeta scripts/\x1b[0m');
  console.log('Por favor, descarga la clave de servicio de Firebase Console -> Configuración del proyecto -> Cuentas de servicio.');
  process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  
  let subjectArg = process.argv[2];
  let userAliasArg = process.argv[3];
  let seguimientoFileArg = process.argv[4];

  // MODO INTERACTIVO si no hay argumentos
  if (!subjectArg || !userAliasArg) {
    console.log("\n\x1b[36m=== EduTrack: Importador de Asignaturas Legadas ===\x1b[0m");
    
    if (!subjectArg) {
      subjectArg = await question("Nombre de la asignatura (ej. Programación): ");
    }
    if (!userAliasArg) {
      userAliasArg = await question("Usuario destinatario (alias sin @educa.madrid.org): ");
    }
    if (!seguimientoFileArg) {
      const defaultSegu = `seguimiento-${userAliasArg.charAt(0).toUpperCase() + userAliasArg.slice(1)}.xml`;
      seguimientoFileArg = await question(`Archivo de seguimiento (default: ${defaultSegu}): `) || defaultSegu;
    }
  }

  const SEGUIMIENTO_PATH = path.join(DAT_DIR, seguimientoFileArg);
  if (!fs.existsSync(SEGUIMIENTO_PATH)) {
    console.warn(`\x1b[33mAdvertencia: No se encontró ${seguimientoFileArg}. Se importará solo la estructura.\x1b[0m`);
  }

  console.log(`\n--- Iniciando importación para: \x1b[32m${subjectArg}\x1b[0m ---`);

  // 1. Cargar Datos XML
  const progXml = fs.readFileSync(PROGRAMACIONES_XML, 'utf-8');
  const progData = parser.parse(progXml);
  
  let seguData = null;
  if (fs.existsSync(SEGUIMIENTO_PATH)) {
    const seguXml = fs.readFileSync(SEGUIMIENTO_PATH, 'utf-8');
    seguData = parser.parse(seguXml);
  }

  // 2. Buscar Usuario en Firestore
  const userEmail = `${userAliasArg}@educa.madrid.org`;
  const userSnap = await db.collection('usuarios').where('email', '==', userEmail).get();
  if (userSnap.empty) {
    console.error(`\x1b[31mError: El usuario con email ${userEmail} no existe en Firestore.\x1b[0m`);
    process.exit(1);
  }
  const userDoc = userSnap.docs[0];
  const userData = userDoc.data();
  const uid = userDoc.id;
  const iesId = userData.iesId || userData.iesIds[0];

  if (!iesId) {
    console.error("\x1b[31mError: El usuario no tiene iesId asociado.\x1b[0m");
    process.exit(1);
  }

  // 3. Buscar Programación en XML (Iterando por departamentos/cursos)
  let foundProg = null;
  const programacionObj = progData.programacion || {};
  const departamentos = [].concat(programacionObj.departamento || []);
  
  for (const dep of departamentos) {
    const cursos = [].concat(dep.curso || []);
    for (const curso of cursos) {
      const asignaturas = [].concat(curso.asignatura || []);
      for (const asig of asignaturas) {
        // Normalización simple para búsqueda
        if (asig.nombre === subjectArg || asig.nombre.replace(//g, 'ó') === subjectArg) {
          foundProg = asig;
          break;
        }
      }
      if (foundProg) break;
    }
    if (foundProg) break;
  }

  if (!foundProg) {
    console.error(`\x1b[31mError: No se encontró la asignatura "${subjectArg}" en programaciones.xml\x1b[0m`);
    process.exit(1);
  }

  // 4. Buscar Seguimiento en XML
  let foundSegu = null;
  if (seguData && seguData.seguimiento) {
    const seguAsignaturas = [].concat(seguData.seguimiento.asignatura || []);
    foundSegu = seguAsignaturas.find(a => a.nombre === subjectArg || a.nombre.replace(//g, 'ó') === subjectArg);
  }

  // 5. Crear/Obtener Impartición
  const groupLabel = foundProg.grupo.id;
  const groupName = groupLabel.toUpperCase(); // Simplificado
  
  let imparticionId;
  const impSnap = await db.collection('ies_imparticiones')
    .where('usuarioId', '==', uid)
    .where('asignaturaNombre', '==', subjectArg)
    .where('grupoNombre', '==', groupName)
    .get();

  if (impSnap.empty) {
    console.log(`Creando nueva impartición: ${subjectArg} (${groupName})...`);
    const newImp = await db.collection('ies_imparticiones').add({
      iesId,
      usuarioId: uid,
      profesorNombre: `${userData.nombre} ${userData.apellidos}`,
      asignaturaNombre: subjectArg,
      asignaturaSigla: subjectArg.substring(0, 4).toUpperCase().replace(/ /g, ''),
      grupoNombre: groupName,
      cursoAcademicoLabel: "2025-2026",
      label: `${subjectArg} (${groupName})`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    imparticionId = newImp.id;
  } else {
    imparticionId = impSnap.docs[0].id;
    console.log(`Usando impartición existente: ${imparticionId}`);
  }

  // 6. Horario
  const g = foundProg.grupo;
  await db.collection('profesor_horarios').doc(imparticionId).set({
    iesId,
    usuarioId: uid,
    imparticionId,
    lunes: parseInt(g.Mon || 0),
    martes: parseInt(g.Tue || 0),
    miercoles: parseInt(g.Wed || 0),
    jueves: parseInt(g.Thu || 0),
    viernes: parseInt(g.Fri || 0),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // 7. Programación (Temas)
  const temasLegados = [].concat(foundProg.tema || []);
  const seguimientoTemas = foundSegu ? [].concat(foundSegu.tema || []) : [];

  const temasFirestore = temasLegados.map(tl => {
    const st = seguimientoTemas.find(s => s.n == tl.n);
    const tema = {
      id: parseInt(tl.n),
      nombre: (tl.titulo || '').replace(//g, 'ó'),
      horasEstimadas: parseInt(tl.horas || 0)
    };
    if (st && st.fini) tema.fechaInicio = st.fini;
    if (st && st.ffin) tema.fechaFin = st.ffin;
    return tema;
  });

  await db.collection('profesor_programaciones').doc(imparticionId).set({
    iesId,
    usuarioId: uid,
    imparticionId,
    temas: temasFirestore,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  console.log(`\n\x1b[32m✓ Importación completada con éxito.\x1b[0m`);
  console.log(`  - Impartición: ${imparticionId}`);
  console.log(`  - Temas importados: ${temasFirestore.length}`);
  
  rl.close();
  process.exit(0);
}

main().catch(err => {
  console.error("\x1b[31mError fatal durante la importación:\x1b[0m");
  console.error(err);
  process.exit(1);
});
