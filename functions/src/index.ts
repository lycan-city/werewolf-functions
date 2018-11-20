import * as functions from 'firebase-functions';
import Db from './db';

const keepAliveThreshold = 15000;
const currentDate = () => new Date();
const { log, error } = console;

export const purgeParties = functions.firestore
  .document('parties/{partyId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return Promise.resolve('skipped, deleted');

    const { players = {} } = change.after.data();
    if (Object.keys(players).length) return null;

    const db = Db.getInstance().db;

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
  const db = Db.getInstance().db;

  const playersWithKeepAlive = await db
    .collection('keepAlive')
    .get()
    .then(querySnap => (querySnap.empty ? [] : querySnap.docs))
    .then(docs =>
      docs.map(docSnap => {
        const data = docSnap.data();
        const keepAlive: any = Object.values(data)[0]; // hack, tsc was complaining
        return {
          partyId: docSnap.id,
          uid: Object.keys(data)[0],
          lastKeepAlive: keepAlive.toDate(),
        };
      })
    );

  log('players with keep alive', playersWithKeepAlive);

  const playersRemoved = [];

  for (let i = 0; i < playersWithKeepAlive.length; i++) {
    const player = playersWithKeepAlive[i];
    const msFromLastKeepalive =
      currentDate().getTime() - player.lastKeepAlive.getTime();

    if (msFromLastKeepalive < keepAliveThreshold) {
      log(`player ${player.uid} within time restriction, skipping...`);
      continue;
    }

    log(`Processing: player ${player.uid}, time: ${msFromLastKeepalive}ms`);

    const playerParty = await db
      .collection('parties')
      .doc(player.partyId)
      .get()
      .then(ref => ref.data())
      .catch(() => null);

    log('player party: ', playerParty);

    if (!playerParty) {
      error(`party ${player.partyId} is deleted, skipping...`);
      continue;
    }

    if (playerParty.gameInProgress) {
      log(`player${player.uid} is in a game in progress, killing...`);
      await db
        .collection('games')
        .doc(player.partyId)
        .update({ [`${player.uid}.alive`]: false });
    }

    const {
      [player.uid]: playerToRemove,
      ...remainingPlayers
    } = playerParty.players;

    const updatedParty = {
      ...playerParty,
      players: remainingPlayers,
    };

    log('player will be removed from party', playerToRemove);
    log('party to update', updatedParty);

    await db
      .collection('parties')
      .doc(player.partyId)
      .set(updatedParty);

    playersRemoved.push(player);
    log('player removed');
  }

  response.send({
    result: 'OK',
    playersRemoved,
    playersActive: playersWithKeepAlive.length - playersRemoved.length,
  });
});
