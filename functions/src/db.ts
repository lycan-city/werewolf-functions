import * as admin from 'firebase-admin';

let instance = null;

class Db {
  db: FirebaseFirestore.Firestore;

  constructor() {
    admin.initializeApp();
    this.db = admin.firestore();
    this.db.settings({ timestampsInSnapshots: true });
  }
}

export default {
  getInstance: () => {
    if (!instance) {
      instance = new Db();
    }

    return instance;
  },
};
