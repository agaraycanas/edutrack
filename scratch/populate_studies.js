import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, where } from "firebase/firestore";
import dotenv from "dotenv";

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const globalStudies = [
  { nombre: "ESO (Educación Secundaria Obligatoria)", cursos: [1, 2, 3, 4], tipo: "Secundaria" },
  { nombre: "Bachillerato de Ciencias y Tecnología", cursos: [1, 2], tipo: "Bachillerato" },
  { nombre: "Bachillerato de Humanidades y Ciencias Sociales", cursos: [1, 2], tipo: "Bachillerato" },
  { nombre: "Bachillerato de Artes", cursos: [1, 2], tipo: "Bachillerato" },
  { nombre: "DAW - Desarrollo de Aplicaciones Web", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Informática" },
  { nombre: "DAM - Desarrollo de Aplicaciones Multiplataforma", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Informática" },
  { nombre: "ASIR - Administración de Sistemas Informáticos en Red", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Informática" },
  { nombre: "SMR - Sistemas Microinformáticos y Redes", cursos: [1, 2], tipo: "FP Grado Medio", familia: "Informática" },
  { nombre: "STAD - Sistemas de Telecomunicaciones e Informáticos", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Electricidad y Electrónica" },
  { nombre: "GA - Gestión Administrativa", cursos: [1, 2], tipo: "FP Grado Medio", familia: "Administración y Gestión" },
  { nombre: "ADFI - Administración y Finanzas", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Administración y Gestión" }
];

async function populate() {
  console.log("Starting population...");
  for (const study of globalStudies) {
    const q = query(collection(db, "oferta_educativa"), where("nombre", "==", study.nombre));
    const snap = await getDocs(q);
    if (snap.empty) {
      await addDoc(collection(db, "oferta_educativa"), study);
      console.log(`Added: ${study.nombre}`);
    } else {
      console.log(`Skipped (exists): ${study.nombre}`);
    }
  }
  
  // Link to our test IES (IES Rey Fernando VI - ies_rey_fernando)
  const activeIesId = "ies_rey_fernando";
  const studiesToLink = ["ESO", "Bachillerato de Ciencias", "DAW", "DAM", "SMR"];
  
  const allGlobal = await getDocs(collection(db, "oferta_educativa"));
  for (const docSnap of allGlobal.docs) {
    const data = docSnap.data();
    if (studiesToLink.some(s => data.nombre.includes(s))) {
      // Check if already linked
      const qLink = query(collection(db, "ies_estudios"), 
        where("iesId", "==", activeIesId),
        where("titulacionId", "==", docSnap.id)
      );
      const snapLink = await getDocs(qLink);
      if (snapLink.empty) {
        await addDoc(collection(db, "ies_estudios"), {
          iesId: activeIesId,
          titulacionId: docSnap.id,
          nombre: data.nombre,
          cursos: data.cursos,
          tipo: data.tipo
        });
        console.log(`Linked ${data.nombre} to ${activeIesId}`);
      }
    }
  }
  console.log("Finished!");
}

populate().catch(console.error);
