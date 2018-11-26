import * as functions from 'firebase-functions';

import Db from '../db';
import purgePlayers from './purgePlayers';

const keepAliveThreshold = 15000;
const currentDate = () => new Date();
const db = Db.getInstance();
const logger = console;

export const purgeParties = functions.firestore
  .document('parties/{partyId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return Promise.resolve('skipped, deleted');

    const { players = {} } = change.after.data();
    if (Object.keys(players).length) return null;

    await db.deleteKeepAliveById(context.params.partyId);
    await db.deleteGameById(context.params.partyId);

    return change.after.ref.delete();
  });

export const purgePlayersFn = functions.https.onRequest(async (_, response) => {
  const payload = await purgePlayers(
    db,
    logger,
    currentDate,
    keepAliveThreshold
  );
  response.send(payload);
});
