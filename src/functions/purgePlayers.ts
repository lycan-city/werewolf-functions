export default async ({ db, logger, getCurrentDate, keepAliveThreshold }) => {
  const keepAliveRecords = await db.getKeepAliveRecords();

  const playersWithKeepAlive = keepAliveRecords.map(doc => {
    const [uid, timestamp]: any = Object.entries(doc)[1];

    return {
      partyId: doc.id,
      uid,
      lastKeepAlive: timestamp.toDate(),
    };
  });

  logger.log('Info: players with keep alive:', playersWithKeepAlive.length);

  const playersRemoved = [];

  for (const player of playersWithKeepAlive) {
    const msFromLastKeepalive =
      getCurrentDate().getTime() - player.lastKeepAlive.getTime();

    if (msFromLastKeepalive < keepAliveThreshold) {
      continue;
    }

    logger.log(
      `Info: Processing player {${player.uid}} (${msFromLastKeepalive}ms)`
    );

    const party = await db.getPartyById(player.partyId);

    if (!party) {
      logger.error(`Error: Party ${player.partyId} is deleted, skipping...`);
      continue;
    }

    if (party.gameInProgress) {
      logger.log(
        `Info: player${player.uid} has a game in progress, killing...`
      );
      await db.killPlayerInGame(player.uid, player.partyId);
    }

    const { [player.uid]: playerToRemove, ...remainingPlayers } = party.players;

    const updatedParty = {
      ...party,
      players: remainingPlayers,
    };

    logger.log(`Info: player ${player.uid} will be removed from party`);
    await db.setParty(player.partyId, updatedParty);

    playersRemoved.push(player);

    logger.log(`Info: removing player ${player.uid} from keepalive...`);
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
    playersRemoved,
    playersActive: playersWithKeepAlive.length - playersRemoved.length,
  };
};
