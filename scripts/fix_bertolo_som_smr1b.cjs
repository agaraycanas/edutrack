const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const IMPARTICION_ID = 'w6ytyViRCdiBqOBe3C1v'; // Bertolo SOM SMR1B
const IES_ID = 'ies_rey_fernando';
const DEPT = 'Informática y Comunicaciones';

function fixEncoding(str) {
  if (!str) return str;
  return str
    .replace(/Ã¡/g, 'á').replace(/Ã©/g, 'é').replace(/Ã­/g, 'í').replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ').replace(/Ã\u0081/g, 'Á').replace(/Ã\u0089/g, 'É').replace(/Ã\u008D/g, 'Í')
    .replace(/Ã\u0093/g, 'Ó').replace(/Ã\u009A/g, 'Ú').replace(/Ã\u0091/g, 'Ñ');
}

async function fixBertoloSOM() {
  console.log("--- Corrigiendo Programación de SOM - SMR1B (Bertolo) ---");

  // 1. Preservar seguimiento actual
  const existingSnap = await db.collection('ies_programacion_temas')
    .where('imparticionId', '==', IMPARTICION_ID)
    .get();
    
  const trackingData = {};
  existingSnap.forEach(doc => {
    const d = doc.data();
    // Guardamos por título para que sea más seguro si los 'n' están duplicados
    if (d.fechaInicio || d.fechaFin || d.observaciones) {
      trackingData[d.titulo] = {
        fechaInicio: d.fechaInicio || '',
        fechaFin: d.fechaFin || '',
        observaciones: d.observaciones || ''
      };
    }
  });
  console.log(`Preservados datos de seguimiento para ${Object.keys(trackingData).length} temas.`);

  // 2. Extraer temas correctos del XML
  const progXml = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'utf8');
  const cursoRegex = /<curso nombre="SMR1b">([\s\S]*?)<\/curso>/;
  const cursoMatch = cursoRegex.exec(progXml);
  
  if (!cursoMatch) {
    console.error("No se encontró el bloque <curso nombre=\"SMR1b\">");
    return;
  }
  
  const smr1bBlock = cursoMatch[1];
  const asigRegex = /<asignatura nombre="Sistemas operativos monopuesto">([\s\S]*?)<\/asignatura>/;
  const asigMatch = asigRegex.exec(smr1bBlock);
  
  if (!asigMatch) {
    console.error("No se encontró la asignatura 'Sistemas operativos monopuesto' en SMR1b");
    return;
  }
  
  const asigBlock = asigMatch[1];
  const temas = [];
  const temaRegex = /<tema n="(\d+)" titulo="([^"]+)" horas="(\d+)" \/>/g;
  let tMatch;
  while ((tMatch = temaRegex.exec(asigBlock)) !== null) {
    const titulo = fixEncoding(tMatch[2]);
    const track = trackingData[titulo] || { fechaInicio: '', fechaFin: '', observaciones: '' };
    
    temas.push({
      n: parseInt(tMatch[1]),
      titulo: titulo,
      horas: parseInt(tMatch[3]),
      ...track
    });
  }
  console.log(`Extraídos ${temas.length} temas correctos del XML.`);

  // 3. Borrar todo lo actual (limpieza total de la impartición)
  console.log(`Borrando ${existingSnap.size} documentos antiguos (incluyendo duplicados de AO)...`);
  const batch = db.batch();
  existingSnap.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  // 4. Insertar temas limpios
  console.log("Insertando temas correctos...");
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

  console.log("\n--- Corrección de Bertolo finalizada ---");
}

fixBertoloSOM().catch(console.error);
