const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, updateDoc, doc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyCh4uBQgjuvjhVorTVjjiV27pVv8LX2pNk",
  authDomain: "edutrack-803e0.firebaseapp.com",
  projectId: "edutrack-803e0",
  storageBucket: "edutrack-803e0.firebasestorage.app",
  messagingSenderId: "556182154739",
  appId: "1:556182154739:web:a5cc1ff521cefbd503b686",
  measurementId: "G-V2M9FBHFVX"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanHolidays() {
  console.log("Iniciando limpieza de festivos...");
  const snapshot = await getDocs(collection(db, 'festivos'));
  let count = 0;

  for (const holidayDoc of snapshot.docs) {
    const data = holidayDoc.data();
    if (data.endDate === 'null') {
      console.log(`Corrigiendo holiday: ${data.nombre} (${holidayDoc.id})`);
      await updateDoc(doc(db, 'festivos', holidayDoc.id), {
        endDate: null
      });
      count++;
    }
  }

  console.log(`Limpieza completada. Se corrigieron ${count} documentos.`);
  process.exit(0);
}

cleanHolidays().catch(err => {
  console.error(err);
  process.exit(1);
});
