// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDKgk68l20g3x6l4v4mwDUqmnsJEs_OAgQ",
  authDomain: "dhh-register.firebaseapp.com",
  projectId: "dhh-register",
  storageBucket: "dhh-register.firebasestorage.app",
  messagingSenderId: "631707050354",
  appId: "1:631707050354:web:ccf7c622aad86698a1bdeb",
  measurementId: "G-R1RTP4EPYZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);