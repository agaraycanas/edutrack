const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const IMPARTICION_ID = 'SSw5qdd2nV3Bj0RNoQA9'; // Chema SI DAW1
const IES_ID = 'ies_rey_fernando';
const DEPT = 'Informática y Comunicaciones';

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

async function fixChemaSI() {
  console.log("--- Corrigiendo Programación de SI - DAW1 (Chema) ---");

  const progXml = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'utf8');
  
  // Buscar el bloque de DAW1 específicamente para evitar solapamientos
  const cursoRegex = /<curso nombre="DAW1">([\s\S]*?)<\/curso>/;
  const cursoMatch = cursoRegex.exec(progXml);
  
  if (!cursoMatch) {
    console.error("No se encontró el bloque <curso nombre=\"DAW1\">");
    return;
  }
  
  const daw1Block = cursoMatch[1];
  
  // Ahora buscar la asignatura SI dentro de ese bloque
  const asigRegex = /<asignatura nombre="Sistemas informáticos">([\s\S]*?)<\/asignatura>/;
  const asigMatch = asigRegex.exec(daw1Block);
  
  if (!asigMatch) {
    console.error("No se encontró la asignatura 'Sistemas informáticos' en DAW1");
    return;
  }
  
  const asigBlock = asigMatch[1];
  const temas = [];
  const temaRegex = /<tema n="(\d+)" titulo="([^"]+)" horas="(\d+)" \/>/g;
  let tMatch;
  while ((tMatch = temaRegex.exec(asigBlock)) !== null) {
    temas.push({
      n: parseInt(tMatch[1]),
      titulo: fixEncoding(tMatch[2]),
      horas: parseInt(tMatch[3]),
      fechaInicio: '',
      fechaFin: '',
      observaciones: ''
    });
  }

  console.log(`Encontrados ${temas.length} temas correctos en el XML.`);

  // Cargar Seguimiento
  const segXml = fs.readFileSync('legacy/programaciones/dat/seguimiento-Chema.xml', 'utf8');
  const segRegex = /<asignatura grupo="w1" nombre="Sistemas informáticos">([\s\S]*?)<\/asignatura>/;
  const segBlock = segRegex.exec(segXml);
  if (segBlock) {
    const segTemaRegex = /<tema n="(\d+)" fini="([^"]*)" ffin="([^"]*)" comentario="([^"]*)"\/>/g;
    let stMatch;
    while ((stMatch = segTemaRegex.exec(segBlock[1])) !== null) {
      const n = parseInt(stMatch[1]);
      const fini = stMatch[2];
      const ffin = stMatch[3];
      const comentario = stMatch[4];
      
      const tema = temas.find(t => t.n === n);
      if (tema && fini) {
        tema.fechaInicio = padDate(fini);
        tema.fechaFin = padDate(ffin);
        tema.observaciones = fixEncoding(comentario);
      }
    }
    console.log("Datos de seguimiento cargados.");
  }

  // 1. Borrar temas incorrectos
  const temasSnap = await db.collection('ies_programacion_temas')
    .where('imparticionId', '==', IMPARTICION_ID)
    .get();
    
  console.log(`Borrando ${temasSnap.size} temas incorrectos...`);
  const batch = db.batch();
  temasSnap.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  // 2. Insertar temas correctos
  console.log("Insertando temas correctos con seguimiento...");
  for (const tema of temas) {
    await db.collection('ies_programacion_temas').add({
      iesId: IES_ID,
      imparticionId: IMPARTICION_ID,
      n: tema.n,
      titulo: tema.titulo,
      horas: tema.horas,
      fechaInicio: tema.fechaInicio,
      fechaFin: tema.fechaFin,
      observaciones: tema.observaciones,
      departamento: DEPT,
      updatedAt: new Date()
    });
    console.log(`  + Tema ${tema.n}: ${tema.titulo} (${tema.fechaInicio || 'sin fecha'})`);
  }

  console.log("\n--- Corrección finalizada con éxito ---");
}

fixChemaSI().catch(console.error);
