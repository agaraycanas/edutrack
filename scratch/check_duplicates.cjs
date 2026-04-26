const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');

const firebaseConfig = {
  projectId: 'edutrack-803e0'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkDuplicates() {
  const q = query(collection(db, 'ies_asignaturas'), where('iesId', '==', 'ies_rey_fernando'));
  const snapshot = await getDocs(q);
  
  const subjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  console.log(`Total subjects: ${subjects.length}`);
  
  // Group by study and name to find duplicates
  const grouped = {};
  subjects.forEach(s => {
    const key = `${s.iesEstudioId}_${s.nombre}_${s.curso}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });
  
  Object.keys(grouped).forEach(key => {
    if (grouped[key].length > 1) {
      console.log(`Duplicate found for key ${key}:`);
      grouped[key].forEach(s => {
        console.log(`  - ID: ${s.id}, Dept: ${s.departamento}, Name: ${s.nombre}, Study: ${s.titulacionNombre}`);
      });
    }
  });
  
  process.exit(0);
}

checkDuplicates().catch(console.error);
