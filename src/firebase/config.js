// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA6W8FXHxr_FgdmsVVI0JmZNCHAMPUkGtI",
  authDomain: "qallariy-coffee.firebaseapp.com",
  projectId: "qallariy-coffee",
  storageBucket: "qallariy-coffee.firebasestorage.app",
  messagingSenderId: "521718251061",
  appId: "1:521718251061:web:3706133dffe74792b3fb7c",
  measurementId: "G-92Y0JNEC6S"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app