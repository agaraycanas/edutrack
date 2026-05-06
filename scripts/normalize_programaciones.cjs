const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');
const serviceAccount = require('./serviceAccountKey.json');

// Re-implementing counting logic locally to avoid dependency issues in script
function getDayKey(dayNumber) {
  const map = { 1: 'lunes', 2: 'martes', 3: 'miercoles', 4: 'jueves', 5: 'viernes' };
  return map[dayNumber] || null;
}

function contarSesiones(startIso, endIso, horario) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  let count = 0;
  let curr = new Date(start);
  while (curr <= end) {
    const key = getDayKey(curr.getDay());
    if (key) count += (horario[key] || 0);
    curr.setDate(curr.getDate() + 1);
  }
  return count;
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function normalizeProgramming(imparticionId) {
  const impDoc = await db.collection('ies_imparticiones').doc(imparticionId).get();
  if (!impDoc.exists) return;
  const imp = impDoc.data();

  const horDoc = await db.collection('profesor_horarios').doc(imparticionId).get();
  if (!horDoc.exists) return;
  const horario = horDoc.data().patron;

  // Fechas del curso (Hardcoded para 2025-2026 en este IES por ahora, o buscar en config)
  const start = '2025-09-15';
  const end = '2026-04-09'; // Fin de clases aprox antes de FCTs

  const totalSessions = contarSesiones(start, end, horario);
  const totalAvailableHours = (totalSessions * 55) / 60;

  const temasSnap = await db.collection('ies_programacion_temas')
    .where('imparticionId', '==', imparticionId)
    .get();

  let totalXmlHours = 0;
  temasSnap.forEach(d => totalXmlHours += d.data().horas);

  if (totalXmlHours === 0) return;

  const factor = totalAvailableHours / totalXmlHours;
  console.log(`Normalizando ${imp.asignaturaSigla} ${imp.grupoNombre}:`);
  console.log(`  - Horas disponibles en calendario: ${totalAvailableHours.toFixed(1)}h (${totalSessions} sesiones)`);
  console.log(`  - Horas teóricas XML: ${totalXmlHours}h`);
  console.log(`  - Factor de ajuste: ${factor.toFixed(3)}`);

  const batch = db.batch();
  temasSnap.forEach(doc => {
    const newHours = Math.round(doc.data().horas * factor);
    batch.update(doc.ref, { horas: newHours });
    console.log(`    * Tema ${doc.data().n}: ${doc.data().horas}h -> ${newHours}h`);
  });

  await batch.commit();
  console.log(`✓ ${imp.asignaturaSigla} normalizada.\n`);
}

async function main() {
  console.log("--- Iniciando Normalización Global de Programaciones ---\n");
  
  const impSnap = await db.collection('ies_imparticiones')
    .where('estado', '==', 'activo')
    .get();
  
  console.log(`Detectadas ${impSnap.size} imparticiones activas.\n`);

  for (const d of impSnap.docs) {
    try {
      await normalizeProgramming(d.id);
    } catch (err) {
      console.error(`Error normalizando ${d.id}:`, err.message);
    }
  }

  console.log("--- Normalización Global Finalizada ---");
  process.exit(0);
}

main().catch(console.error);
