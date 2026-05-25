import { ObjectId } from "mongodb";
import { getDb } from "./connection.js";

function computePoints(prediction, fixture) {
    const status = fixture?.fixture?.status?.short;
    if (!["FT", "AET", "PEN"].includes(status)) return null;

    const realHome = fixture.goals?.home;
    const realAway = fixture.goals?.away;
    if (realHome === null || realHome === undefined) return null;

    const predHome = prediction.homeGoals;
    const predAway = prediction.awayGoals;

    if (predHome === realHome && predAway === realAway) return 3;

    const realWinner =
        realHome > realAway ? "home" : realAway > realHome ? "away" : "draw";
    const predWinner =
        predHome > predAway ? "home" : predAway > predHome ? "away" : "draw";

    if (realWinner === predWinner) return 1;
    return 0;
}

export async function upsertPrediction({ userId, fixtureId, homeGoals, awayGoals }) {
    const db = getDb();
    const now = new Date();

    const result = await db.collection("predictions").updateOne(
        { userId: new ObjectId(userId), fixtureId: Number(fixtureId) },
        {
            $set: { homeGoals, awayGoals, updatedAt: now },
            $setOnInsert: { createdAt: now },
        },
        { upsert: true }
    );

    return result;
}

export async function findPredictionsByUser(userId) {
    const db = getDb();
    return await db
        .collection("predictions")
        .find({ userId: new ObjectId(userId) })
        .toArray();
}

export async function findPredictionByUserAndFixture(userId, fixtureId) {
    const db = getDb();
    return await db.collection("predictions").findOne({
        userId: new ObjectId(userId),
        fixtureId: Number(fixtureId),
    });
}

export async function deletePrediction(userId, fixtureId) {
    const db = getDb();
    return await db.collection("predictions").deleteOne({
        userId: new ObjectId(userId),
        fixtureId: Number(fixtureId),
    });
}

export async function getAllPredictionsGroupedByUser() {
    const db = getDb();
    return await db
        .collection("predictions")
        .aggregate([
            {
                $group: {
                    _id: "$userId",
                    predictions: {
                        $push: {
                            fixtureId: "$fixtureId",
                            homeGoals: "$homeGoals",
                            awayGoals: "$awayGoals",
                        },
                    },
                },
            },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "user",
                },
            },
            { $unwind: "$user" },
            {
                $project: {
                    _id: 0,
                    userId: "$_id",
                    name: "$user.name",
                    email: "$user.email",
                    predictions: 1,
                },
            },
        ])
        .toArray();
}

export { computePoints };
