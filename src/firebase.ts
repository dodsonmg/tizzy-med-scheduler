import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";

export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  user: User;
};

export async function connectFirebase(): Promise<FirebaseServices> {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const { user } = await signInAnonymously(auth);

  return {
    app,
    auth,
    db: getFirestore(app),
    user,
  };
}
