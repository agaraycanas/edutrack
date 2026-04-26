const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where, deleteDoc, doc, updateDoc } = require('firebase/firestore');

const firebaseConfig = {
  projectId: 'edutrack-803e0'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanup() {
  console.log("Starting cleanup of duplicate subjects...");
  const q = query(collection(db, 'ies_asignaturas'), where('iesId', '==', 'ies_rey_fernando'));
  const snapshot = await getDocs(q);
  const subjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const grouped = {};
  subjects.forEach(s => {
    // Group by study, name and course
    const key = `${s.iesEstudioId}_${s.nombre.toLowerCase().trim()}_${s.curso}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  let deletedCount = 0;
  let updatedCount = 0;

  for (const key in grouped) {
    const list = grouped[key];
    if (list.length > 1) {
      console.log(`Processing duplicates for: ${list[0].nombre} (${list[0].titulacionNombre})`);
      
      // Strategy: Keep "Informática y Comunicaciones" over "Informática"
      let toKeep = list.find(s => s.departamento === "Informática y Comunicaciones");
      
      if (!toKeep) {
        // If neither is "Informática y Comunicaciones", just keep the first one
        toKeep = list[0];
        // If it was "Informática", update it to the full name
        if (toKeep.departamento === "Informática") {
           await updateDoc(doc(db, 'ies_asignaturas', toKeep.id), {
             departamento: "Informática y Comunicaciones"
           });
           updatedCount++;
        }
      }

      // Delete the others
      for (const s of list) {
        if (s.id !== toKeep.id) {
          await deleteDoc(doc(db, 'ies_asignaturas', s.id));
          deletedCount++;
          console.log(`  Deleted duplicate ID: ${s.id} (Dept: ${s.departamento})`);
        }
      }
    } else {
      // Not a duplicate, but check if we should update the department name for consistency
      const s = list[0];
      if (s.departamento === "Informática") {
        await updateDoc(doc(db, 'ies_asignaturas', s.id), {
          departamento: "Informática y Comunicaciones"
        });
        updatedCount++;
        console.log(`Updated department for: ${s.nombre}`);
      }
    }
  }

  console.log(`Cleanup complete! Deleted ${deletedCount} duplicates and updated ${updatedCount} subjects.`);
  process.exit(0);
}

cleanup().catch(console.error);
