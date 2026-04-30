
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');
const fs = require('fs');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const UID_GUILLERMO = "bAcANx9mPkaAQEmJqimdaIPtFYX2";
const IES_ID = "ies_rey_fernando";
const ACAD_YEAR_ID = "NIaDSaiG7RPsIgWgjNj7";
const ACAD_YEAR_LABEL = "2025-2026";

async function run() {
  const data = JSON.parse(fs.readFileSync('guillermo_import.json', 'utf8'));
  
  for (const imp of data.imparticiones) {
    console.log(`Processing: ${imp.asignatura_nombre} (${imp.legacy_grupo})`);
    
    // 1. Map IDs (Hardcoded for DIW in DAW2)
    const asignaturaId = "p8oOekIGkTQpyx4QB3NK";
    const grupoId = "UmyCsrcSy5miFHzZuh83"; // DAW2
    const estudioId = "0JKS51nEBzvL05ZkEqdP";
    
    const label = `${ACAD_YEAR_LABEL.slice(2,4)}${ACAD_YEAR_LABEL.slice(7,9)}_DAW2_DIW_GS`;

    // 2. Create/Update Imparticion
    const impRef = db.collection('ies_imparticiones').doc(label); // Using label as ID for consistency
    await impRef.set({
      iesId: IES_ID,
      cursoAcademicoId: ACAD_YEAR_ID,
      cursoAcademicoLabel: ACAD_YEAR_LABEL,
      iesEstudioId: estudioId,
      titulacionNombre: "DAW - Desarrollo de Aplicaciones Web",
      usuarioId: UID_GUILLERMO,
      profesorNombre: "Guillermo Sanz",
      asignaturaId: asignaturaId,
      asignaturaNombre: "Diseño de Interfaces Web",
      asignaturaSigla: "DIW",
      grupoId: grupoId,
      grupoNombre: "DAW2",
      departamento: "Informática y Comunicaciones",
      label: label,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // 3. Create/Update Horario
    const horarioRef = db.collection('profesor_horarios').doc(label);
    await horarioRef.set({
      imparticionId: label,
      usuarioId: UID_GUILLERMO,
      patron: imp.pattern,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // 4. Create/Update Programacion
    const progRef = db.collection('profesor_programaciones').doc(label);
    await progRef.set({
      iesId: IES_ID,
      imparticionId: label,
      usuarioId: UID_GUILLERMO,
      temas: imp.temas,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  // 5. Import Ausencias
  console.log(`Importing ${data.ausencias.length} absences...`);
  const ausSnap = await db.collection('profesor_ausencias').where('userId', '==', UID_GUILLERMO).get();
  const existingAus = ausSnap.docs.map(d => d.data().startDate);
  
  for (const aus of data.ausencias) {
    if (!existingAus.includes(aus.startDate)) {
      await db.collection('profesor_ausencias').add({
        ...aus,
        userId: UID_GUILLERMO,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
  }

  console.log("Import finished successfully!");
}

run().catch(console.error);
