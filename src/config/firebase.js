import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

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
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
