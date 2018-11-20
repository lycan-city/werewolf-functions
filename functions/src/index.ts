import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const keepAliveThreshold = 15000;
const currentDate = () => new Date();

export const purgeParties = functions.firestore
  .document('parties/{partyId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return Promise.resolve('skipped, deleted');

    const { players = {} } = change.after.data();
    if (Object.keys(players).length) return null;

    const db = admin.firestore();

    await db
      .collection('keepAlive')
      .doc(context.params.partyId)
      .delete();

    await db
      .collection('games')
      .doc(context.params.partyId)
      .delete();
    return change.after.ref.delete();
  });

export const purgePlayers = functions.https.onRequest(async (_, response) => {
  const db = admin.firestore();
  db.settings({ timestampsInSnapshots: true }); // So firebase cli stops complaining

  const playersWithKeepAlive = await db
    .collection('keepAlive')
    .get()
    .then(querySnap => (querySnap.empty ? [] : querySnap.docs))
    .then(docs =>
      docs.map(docSnap => {
        const data = docSnap.data();
        return {
          partyId: docSnap.id,
          uid: Object.keys(data)[0],
          lastKeepAlive: Object.values(data)[0].toDate(),
        };
      })
    );

  console.log('players with keep alive', playersWithKeepAlive);

  const playersRemoved = [];

  for (let i = 0; i < playersWithKeepAlive.length; i++) {
    const player = playersWithKeepAlive[i];
    const msFromLastKeepalive =
      currentDate().getTime() - player.lastKeepAlive.getTime();

    console.log('PASS THRESHOLD', player.uid, msFromLastKeepalive);

    if (msFromLastKeepalive > keepAliveThreshold) {
      const playerParty = await db
        .collection('parties')
        .doc(player.partyId)
        .get()
        .then(ref => ref.data())
        .catch(() => null);

      console.log('player party', playerParty);

      const {
        [player.uid]: playerToRemove,
        ...remainingPlayers
      } = playerParty.players;

      const updatedParty = {
        ...playerParty,
        players: remainingPlayers,
      };
      console.log(`player will be removed from party ${playerToRemove}`);
      console.log('party to update', updatedParty);

      await db
        .collection('parties')
        .doc(player.partyId)
        .set(updatedParty);

      playersRemoved.push(player);
      console.log('player removed');
    }
  }

  response.send({ result: 'OK', playersRemoved });
});
