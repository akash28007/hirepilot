
import { initializeApp } from "firebase/app";
import {getAuth, GoogleAuthProvider} from "firebase/auth"
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_APIKEY,
   authDomain: "hirepilot-abafd.firebaseapp.com",
  projectId: "hirepilot-abafd",
  storageBucket: "hirepilot-abafd.firebasestorage.app",
  messagingSenderId: "449573355289",
  appId: "1:449573355289:web:cf228088168c2d665b8f88"
};


const app = initializeApp(firebaseConfig);

const auth = getAuth(app)

const provider = new GoogleAuthProvider()

export {auth , provider}