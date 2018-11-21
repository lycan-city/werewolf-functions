import * as functions from 'firebase-functions';
import Db from '../db';

const keepAliveThreshold = 15000;
const currentDate = () => new Date();
const { log, error } = console;

export const purgeParties = functions.firestore
  .document('parties/{partyId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return Promise.resolve('skipped, deleted');

    const { players = {} } = change.after.data();
    if (Object.keys(players).length) return null;

    const db = Db.getInstance();

    await db.deleteKeepAliveById(context.params.partyId);
    await db.deleteGameById(context.params.partyId);

    return change.after.ref.delete();
  });

export const purgePlayers = functions.https.onRequest(async (_, response) => {
  const db = Db.getInstance();

  const keepAliveRecords = await db.getKeepAliveRecords();

  const playersWithKeepAlive = keepAliveRecords.map(doc => {
    const data = doc.data();
    const keepAlive: any = Object.values(data)[0]; // hack, tsc was complaining
    return {
      partyId: doc.id,
      uid: Object.keys(data)[0],
      lastKeepAlive: keepAlive.toDate(),
    };
  });

  log('Info: players with keep alive:', playersWithKeepAlive.length);

  const removedPlayers = [];

  for (let i = 0; i < playersWithKeepAlive.length; i++) {
    const player = playersWithKeepAlive[i];
    const msFromLastKeepalive =
      currentDate().getTime() - player.lastKeepAlive.getTime();

    if (msFromLastKeepalive < keepAliveThreshold) {
      continue;
    }

    log(`Info: processing player ${player.uid} (${msFromLastKeepalive}ms)`);

    const playerParty = await db.getPartyById(player.partyId);
    log(`Info: player {${player.uid}} party: `, playerParty.partyId);

    if (!playerParty) {
      error(`Error: Party ${player.partyId} is deleted, skipping...`);
      continue;
    }

    if (playerParty.gameInProgress) {
      log(`Info: player${player.uid} has a game in progress, killing...`);
      await db.killPlayerInParty(player.uid, player.partyId);
    }

    const {
      [player.uid]: playerToRemove,
      ...remainingPlayers
    } = playerParty.players;

    const updatedParty = {
      ...playerParty,
      players: remainingPlayers,
    };

    log(`Info: player ${player.uid} will be removed from party`);
    await db.setParty(player.partyId, updatedParty);

    removedPlayers.push(player);

    log(`Info: removing player ${player.uid} from keepalive...`);
    const keepalive = keepAliveRecords.find(r => r.id === player.partyId);

    if (!keepalive) {
      error(`Error: Player {${player.uid}} not in keepAlive, skipping...`);
      continue;
    }

    const {
      [player.uid]: keepAliveToRemove,
      ...remainingKeepAlives
    } = keepalive.data();

    await db.updatePlayersKeepAlive(player.partyId, remainingKeepAlives);
  }

  response.send({
    result: 'OK',
    removedPlayers,
    activePlayers: playersWithKeepAlive.length - removedPlayers.length,
  });
});
