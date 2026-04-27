import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, updateDoc, doc } from "firebase/firestore";

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

async function makeSuperAdmin() {
  const q = query(collection(db, 'usuarios'), where('email', '==', 'agaraycanas@educa.madrid.org'));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    console.log("User not found!");
    process.exit(1);
  }

  snapshot.forEach(async (userDoc) => {
    const data = userDoc.data();
    const iesId = (data.iesIds && data.iesIds.length > 0) ? data.iesIds[0] : 'default_ies';
    
    await updateDoc(doc(db, 'usuarios', userDoc.id), {
      roles: [{ iesId: iesId, rol: 'superadmin', estado: 'activo' }]
    });
    console.log(`User ${userDoc.id} updated to superadmin!`);
  });
}

makeSuperAdmin().then(() => {
  setTimeout(() => process.exit(0), 2000); // wait for updateDoc
});
