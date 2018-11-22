import * as admin from 'firebase-admin';

let instance = null;

class Db {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    admin.initializeApp();
    this.db = admin.firestore();
    this.db.settings({ timestampsInSnapshots: true });
  }

  getKeepAliveRecords() {
    return this.db
      .collection('keepAlive')
      .get()
      .then(querySnap => (querySnap.empty ? [] : querySnap.docs))
      .then(docs => docs.map(d => ({ id: d.id, ...d.data() })));
  }

  getPartyById(id) {
    return this.db
      .collection('parties')
      .doc(id)
      .get()
      .then(ref => ref.data())
      .catch(() => null);
  }

  killPlayerInGame(playerId, partyId) {
    return this.db
      .collection('games')
      .doc(partyId)
      .update({ [`${playerId}.alive`]: false });
  }

  updatePlayersInParty(partyId, players) {
    return this.db
      .collection('parties')
      .doc(partyId)
      .update({
        players,
      });
  }

  updatePlayersKeepAlive(partyId, players) {
    return this.db
      .collection('keepAlive')
      .doc(partyId)
      .set(players);
  }

  deleteKeepAliveById(partyId) {
    return this.db
      .collection('keepAlive')
      .doc(partyId)
      .delete();
  }

  deleteGameById(id) {
    return this.db
      .collection('games')
      .doc(id)
      .delete();
  }
}

const getInstance: () => Db = () => {
  if (!instance) {
    instance = new Db();
  }

  return instance;
};

export default {
  getInstance,
};
