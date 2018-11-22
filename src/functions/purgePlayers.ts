import { Db } from '../db';
import { Logger } from '../logger';

export default async (
  db: Db,
  logger: Logger,
  getCurrentDate,
  keepAliveThreshold
) => {
  const keepAliveRecords = await db.getKeepAliveRecords();

  const playersWithKeepAlive = keepAliveRecords.map(doc => {
    const [uid, timestamp]: any = Object.entries(doc)[1];

    return {
      partyId: doc.id,
      uid,
      lastKeepAlive: timestamp.toDate(),
    };
  });

  logger.info('Players with keep alive:', playersWithKeepAlive.length);

  const removedPlayers = [];

  for (const player of playersWithKeepAlive) {
    const msFromLastKeepalive =
      getCurrentDate().getTime() - player.lastKeepAlive.getTime();

    if (msFromLastKeepalive < keepAliveThreshold) {
      continue;
    }

    logger.info(`Processing player {${player.uid}} (${msFromLastKeepalive}ms)`);

    const party = await db.getPartyById(player.partyId);

    if (!party) {
      logger.error(`Error: Party ${player.partyId} is deleted, skipping...`);
      continue;
    }

    if (party.gameInProgress) {
      logger.info(`Player${player.uid} has a game in progress, killing...`);
      await db.killPlayerInGame(player.uid, player.partyId);
    }

    const { [player.uid]: playerToRemove, ...remainingPlayers } = party.players;

    logger.info(`Player ${player.uid} will be removed from party`);
    await db.updatePlayersInParty(player.partyId, remainingPlayers);

    removedPlayers.push(player);

    logger.info(`Removing player ${player.uid} from keepalive...`);
    const keepalive = keepAliveRecords.find(r => r.id === player.partyId);

    if (!keepalive) {
      logger.error(
        `Error: Player {${player.uid}} not in keepAlive, skipping...`
      );
      continue;
    }

    const {
      [player.uid]: keepAliveToRemove,
      ...remainingKeepAlives
    } = keepalive;

    await db.updatePlayersKeepAlive(player.partyId, remainingKeepAlives);
  }

  return {
    result: 'OK',
    removedPlayers,
    activePlayers: playersWithKeepAlive.length - removedPlayers.length,
  };
};
