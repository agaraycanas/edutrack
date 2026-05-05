const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const UID = 'KLPW3ggDtGeY1WHuGEEr8vDCs7j2';

const replacements = {
  'Ã¡': 'á', 'Ã©': 'é', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú',
  'Ã±': 'ñ', 'Ã': 'Ñ', // Nota: Ã followed by space or nothing might be Ñ in some cases but usually it's Ã
  'Ã\u0081': 'Á', 'Ã\u0089': 'É', 'Ã\u008D': 'Í', 'Ã\u0093': 'Ó', 'Ã\u009A': 'Ú',
  'Ã\u0091': 'Ñ'
};

function fixString(str) {
  if (!str) return str;
  let newStr = str;
  for (const [bad, good] of Object.entries(replacements)) {
    newStr = newStr.split(bad).join(good);
  }
  return newStr;
}

async function fixFinalData() {
  console.log("--- Iniciando corrección final de datos ---");

  // 1. Corregir ies_imparticiones (usuarioId y sigla)
  const impSnap = await db.collection('ies_imparticiones')
    .where('profesorNombre', '==', 'Jesús Bertolo')
    .get();
  
  const siglaMap = {
    "Montaje y mantenimiento de equipos": "MME",
    "Sistemas operativos monopuesto": "SOM"
  };

  for (const doc of impSnap.docs) {
    const data = doc.data();
    const update = {
      usuarioId: UID, // El dashboard busca usuarioId, no profesorId
      asignaturaSigla: siglaMap[data.asignaturaNombre] || ''
    };
    await doc.ref.update(update);
    console.log(`~ Impartición corregida (${doc.id}): usuarioId seteado y sigla añadida.`);
  }

  // 2. Corregir encodings en profesor_programaciones
  const progSnap = await db.collection('profesor_programaciones')
    .where('usuarioId', '==', UID)
    .get();
  
  for (const doc of progSnap.docs) {
    const data = doc.data();
    if (data.temas) {
      const fixedTemas = data.temas.map(t => {
        const theme = { ...t };
        if (theme.nombre) theme.nombre = fixString(theme.nombre);
        if (theme.observaciones) theme.observaciones = fixString(theme.observaciones);
        // Asegurarse de no dejar undefined si no existe la propiedad
        if (theme.observaciones === undefined) delete theme.observaciones;
        return theme;
      });
      await doc.ref.update({ temas: fixedTemas });
      console.log(`~ Programación corregida (${doc.id}): Encodings de temas arreglados.`);
    }
  }

  console.log("\n--- Corrección finalizada ---");
  process.exit(0);
}

fixFinalData().catch(console.error);
