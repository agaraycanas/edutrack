const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function padDate(dStr) {
  if (!dStr) return dStr;
  const parts = dStr.split('-');
  if (parts.length !== 3) return dStr;
  const y = parts[0];
  const m = parts[1].padStart(2, '0');
  const d = parts[2].padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fixDatePadding() {
  console.log("--- Iniciando padding de fechas ---");

  const progSnap = await db.collection('profesor_programaciones').get();
  
  for (const doc of progSnap.docs) {
    const data = doc.data();
    if (data.temas) {
      let changed = false;
      const fixedTemas = data.temas.map(t => {
        const newInicio = padDate(t.fechaInicio);
        const newFin = padDate(t.fechaFin);
        if (newInicio !== t.fechaInicio || newFin !== t.fechaFin) {
          changed = true;
          return { ...t, fechaInicio: newInicio, fechaFin: newFin };
        }
        return t;
      });

      if (changed) {
        await doc.ref.update({ temas: fixedTemas });
        console.log(`~ Programación corregida (${doc.id}): Fechas formateadas.`);
      }
    }
  }

  console.log("\n--- Padding finalizado ---");
  process.exit(0);
}

fixDatePadding().catch(console.error);
