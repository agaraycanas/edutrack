/**
 * Script para importar datos de seguimiento desde archivos XML legados a Firestore.
 * 
 * Requisitos:
 * 1. Instalar dependencias: npm install firebase-admin fast-xml-parser
 * 2. Colocar el archivo de credenciales de Firebase en: ./scripts/serviceAccountKey.json
 * 
 * Uso:
 * - Interactivo: node scripts/importLegacy.js
 * - Directo: node scripts/importLegacy.js "Programación" "DAW1"
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const readline = require('readline');

// Configuración
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json');
const PROGRAMACIONES_XML = path.join(__dirname, '../legacy/programaciones/dat/programaciones.xml');
const SEGUIMIENTO_XML = path.join(__dirname, '../legacy/programaciones/dat/seguimiento-Alberto.xml');
const TEACHER_EMAIL = 'agaraycanas@educa.madrid.org';

// Inicializar Firebase
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Error: No se encontró el archivo de credenciales en ' + SERVICE_ACCOUNT_PATH);
  console.log('Por favor, descarga el archivo JSON de tu cuenta de servicio desde la consola de Firebase');
  console.log('y guárdalo como: ' + SERVICE_ACCOUNT_PATH);
  process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  try {
    console.log('--- Importador de Datos Legados ---');

    // 1. Cargar y parsear XMLs
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
    
    if (!fs.existsSync(PROGRAMACIONES_XML)) {
      console.error(`Error: No se encontró ${PROGRAMACIONES_XML}`);
      process.exit(1);
    }
    if (!fs.existsSync(SEGUIMIENTO_XML)) {
      console.error(`Error: No se encontró ${SEGUIMIENTO_XML}`);
      process.exit(1);
    }

    const progXml = fs.readFileSync(PROGRAMACIONES_XML, 'utf-8');
    const seguXml = fs.readFileSync(SEGUIMIENTO_XML, 'utf-8');

    const progData = parser.parse(progXml);
    const seguData = parser.parse(seguXml);

    // 2. Obtener asignaturas disponibles en el seguimiento
    const seguAsignaturas = Array.isArray(seguData.seguimiento.asignatura) 
      ? seguData.seguimiento.asignatura 
      : [seguData.seguimiento.asignatura];

    let targetSubjectName = process.argv[2];
    let targetGroupName = process.argv[3];

    if (!targetSubjectName) {
      console.log('\nAsignaturas encontradas en el archivo de seguimiento:');
      seguAsignaturas.forEach((asig, index) => {
        console.log(`${index + 1}. ${asig.nombre} (${asig.grupo})`);
      });

      const choice = await question('\nSelecciona el número de la asignatura a importar: ');
      const selected = seguAsignaturas[parseInt(choice) - 1];
      if (!selected) {
        console.error('Selección no válida.');
        process.exit(1);
      }
      targetSubjectName = selected.nombre;
      targetGroupName = selected.grupo;
    }

    console.log(`\nImportando "${targetSubjectName}" para el grupo "${targetGroupName}"...`);

    // 3. Buscar datos en programaciones.xml
    let selectedProg = null;
    const departamentos = Array.isArray(progData.programacion.departamento)
      ? progData.programacion.departamento
      : [progData.programacion.departamento];

    for (const dep of departamentos) {
      const cursos = Array.isArray(dep.curso) ? dep.curso : [dep.curso];
      for (const curso of cursos) {
        const asignaturas = Array.isArray(curso.asignatura) ? curso.asignatura : [curso.asignatura];
        for (const asig of asignaturas) {
          if (asig.nombre === targetSubjectName && asig.grupo.id === targetGroupName) {
            selectedProg = asig;
            break;
          }
        }
        if (selectedProg) break;
      }
      if (selectedProg) break;
    }

    if (!selectedProg) {
      console.error(`No se encontró la programación para "${targetSubjectName}" / "${targetGroupName}" en programaciones.xml`);
      process.exit(1);
    }

    // 4. Buscar datos en seguimiento.xml
    const selectedSegu = seguAsignaturas.find(a => a.nombre === targetSubjectName && a.grupo === targetGroupName);

    // 5. Buscar usuario en Firestore
    const userSnap = await db.collection('usuarios').where('email', '==', TEACHER_EMAIL).get();
    if (userSnap.empty) {
      console.error(`No se encontró el usuario ${TEACHER_EMAIL} en Firestore.`);
      process.exit(1);
    }
    const userDoc = userSnap.docs[0];
    const uid = userDoc.id;

    // 6. Buscar impartición en Firestore
    // Intentamos mapear el grupo legado (p.ej. w1) al nuevo (p.ej. DAW1)
    let firestoreGroupName = targetGroupName === 'w1' ? 'DAW1' : (targetGroupName === 'w2' ? 'DAW2' : targetGroupName);
    
    const impSnap = await db.collection('ies_imparticiones')
      .where('usuarioId', '==', uid)
      .where('asignaturaNombre', '==', targetSubjectName)
      .where('grupoNombre', '==', firestoreGroupName)
      .get();

    let imparticion;
    if (impSnap.empty) {
      console.log(`❌ No se encontró la impartición para ${targetSubjectName} / ${firestoreGroupName}.`);
      console.log('   Asegúrate de que el nombre de la asignatura y el grupo coincidan exactamente en la web.');
      process.exit(1);
    } else {
      const data = impSnap.docs[0].data();
      // Validar campos requeridos
      if (!data.iesId) {
        console.error(`❌ Error: La impartición ${impSnap.docs[0].id} no tiene iesId.`);
        process.exit(1);
      }
      imparticion = { id: impSnap.docs[0].id, ...data };
    }

    // 7. Preparar temas
    const temasLegados = Array.isArray(selectedProg.tema) ? selectedProg.tema : [selectedProg.tema];
    const seguimientoTemas = Array.isArray(selectedSegu.tema) ? selectedSegu.tema : [selectedSegu.tema];

    const temasFirestore = temasLegados.map(tl => {
      const st = seguimientoTemas.find(s => s.n == tl.n);
      const tema = {
        id: parseInt(tl.n),
        nombre: tl.titulo,
        horasEstimadas: parseInt(tl.horas)
      };
      if (st && st.fini) tema.fechaInicio = st.fini;
      if (st && st.ffin) tema.fechaFin = st.ffin;
      return tema;
    });

    console.log(`   Preparados ${temasFirestore.length} temas para la programación.`);

    // 8. Actualizar profesor_programaciones
    // Usamos set sin merge para los campos core, o aseguramos que están todos.
    // Para temas, si queremos mergear podríamos usar update, pero aquí queremos que la verda sea el XML.
    await db.collection('profesor_programaciones').doc(imparticion.id).set({
      iesId: imparticion.iesId,
      usuarioId: uid,
      imparticionId: imparticion.id,
      temas: temasFirestore,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✓ Programación actualizada en profesor_programaciones.');

    // 9. Actualizar profesor_horarios
    const g = selectedProg.grupo;
    await db.collection('profesor_horarios').doc(imparticion.id).set({
      iesId: imparticion.iesId,
      usuarioId: uid,
      imparticionId: imparticion.id,
      lunes: parseInt(g.Mon || 0),
      martes: parseInt(g.Tue || 0),
      miercoles: parseInt(g.Wed || 0),
      jueves: parseInt(g.Thu || 0),
      viernes: parseInt(g.Fri || 0),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✓ Horario actualizado en profesor_horarios.');
    console.log('\n--- Importación completada con éxito ---');

  } catch (error) {
    console.error('Error durante la importación:', error);
  } finally {
    rl.close();
  }
}

main();
