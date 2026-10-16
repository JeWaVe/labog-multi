// Multijoueur via Firebase Realtime Database. Sans config valide, le jeu reste jouable en solo.
import { firebaseConfig } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

export const isConfigured = !!firebaseConfig && !!firebaseConfig.databaseURL && !firebaseConfig.apiKey?.startsWith("VOTRE");

/** Retourne { uid, publish(day, data), subscribe(day, cb) } ou null si Firebase n'est pas configuré. */
export async function connect() {
  if (!isConfigured) return null;
  const [{ initializeApp }, { getAuth, signInAnonymously }, db] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-database.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const { user } = await signInAnonymously(auth);
  const database = db.getDatabase(app);
  const playerRef = (day) => db.ref(database, `days/${day}/players/${user.uid}`);
  return {
    uid: user.uid,
    publish: (day, data) => db.set(playerRef(day), { ...data, updated: db.serverTimestamp() }),
    subscribe(day, cb) {
      return db.onValue(db.ref(database, `days/${day}/players`), (snap) => cb(snap.val() ?? {}));
    },
  };
}
