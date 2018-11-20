import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

export const purgeParties = functions.firestore
  .document("parties/{partyId}")
  .onWrite(async (change, context) => {
    if (!change.after.exists) return Promise.resolve("skipped, deleted");

    const { players = {} } = change.after.data();
    if (Object.keys(players).length) return null;

    const db = admin.firestore();

    await db
      .collection("keepAlive")
      .doc(context.params.partyId)
      .delete();

    await db
      .collection("games")
      .doc(context.params.partyId)
      .delete();
    return change.after.ref.delete();
  });
