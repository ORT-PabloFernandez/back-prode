import {
    upsertPrediction,
    findPredictionsByUser,
    findPredictionByUserAndFixture,
    deletePrediction,
    getAllPredictionsGroupedByUser,
    computePoints,
} from "../data/predictionRepository.js";
import { getFixtureById, getGroupStageFixtures } from "../services/footballService.js";

export async function upsertPredictionHandler(req, res, next) {
    try {
        const userId = req.user._id;
        const { fixtureId, homeGoals, awayGoals } = req.body;

        if (fixtureId === undefined || homeGoals === undefined || awayGoals === undefined) {
            return res.status(400).json({
                message: "fixtureId, homeGoals y awayGoals son requeridos",
            });
        }

        if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) || homeGoals < 0 || awayGoals < 0) {
            return res.status(400).json({
                message: "homeGoals y awayGoals deben ser enteros no negativos",
            });
        }

        const fixture = await getFixtureById(fixtureId);
        if (!fixture) {
            return res.status(404).json({ message: "Partido no encontrado" });
        }

        const fixtureStatus = fixture.fixture?.status?.short;
        if (["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "FT", "AET", "PEN"].includes(fixtureStatus)) {
            return res.status(400).json({
                message: "No se puede apostar en un partido que ya comenzó o finalizó",
            });
        }

        await upsertPrediction({ userId, fixtureId, homeGoals, awayGoals });

        res.status(200).json({
            message: "Pronóstico guardado exitosamente",
            data: { fixtureId, homeGoals, awayGoals },
        });
    } catch (error) {
        next(error);
    }
}

export async function getMyPredictions(req, res, next) {
    try {
        const userId = req.user._id;
        const predictions = await findPredictionsByUser(userId);

        const fixtures = await getGroupStageFixtures();
        const fixtureMap = Object.fromEntries(fixtures.map((f) => [f.fixture.id, f]));

        const enriched = predictions.map((pred) => {
            const fixture = fixtureMap[pred.fixtureId];
            return {
                ...pred,
                points: computePoints(pred, fixture),
                fixture: fixture
                    ? {
                          id: fixture.fixture.id,
                          date: fixture.fixture.date,
                          status: fixture.fixture.status,
                          homeTeam: fixture.teams.home.name,
                          awayTeam: fixture.teams.away.name,
                          goals: fixture.goals,
                          round: fixture.league.round,
                      }
                    : null,
            };
        });

        const totalPoints = enriched.reduce((acc, p) => acc + (p.points ?? 0), 0);

        res.json({
            totalPoints,
            total: enriched.length,
            data: enriched,
        });
    } catch (error) {
        next(error);
    }
}

export async function getPredictionByFixture(req, res, next) {
    try {
        const userId = req.user._id;
        const { fixtureId } = req.params;

        const prediction = await findPredictionByUserAndFixture(userId, fixtureId);
        if (!prediction) {
            return res.status(404).json({ message: "No hay pronóstico para este partido" });
        }

        const fixture = await getFixtureById(fixtureId);
        const points = computePoints(prediction, fixture);

        res.json({ data: { ...prediction, points } });
    } catch (error) {
        next(error);
    }
}

export async function deletePredictionHandler(req, res, next) {
    try {
        const userId = req.user._id;
        const { fixtureId } = req.params;

        const fixture = await getFixtureById(fixtureId);
        if (fixture) {
            const fixtureStatus = fixture.fixture?.status?.short;
            if (["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "FT", "AET", "PEN"].includes(fixtureStatus)) {
                return res.status(400).json({
                    message: "No se puede eliminar el pronóstico de un partido que ya comenzó o finalizó",
                });
            }
        }

        const result = await deletePrediction(userId, fixtureId);
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Pronóstico no encontrado" });
        }

        res.json({ message: "Pronóstico eliminado" });
    } catch (error) {
        next(error);
    }
}

export async function getRanking(req, res, next) {
    try {
        const usersWithPredictions = await getAllPredictionsGroupedByUser();
        const fixtures = await getGroupStageFixtures();
        const fixtureMap = Object.fromEntries(fixtures.map((f) => [f.fixture.id, f]));

        const ranking = usersWithPredictions
            .map((userEntry) => {
                let totalPoints = 0;
                let exactScores = 0;
                let correctResults = 0;
                let totalPredictions = userEntry.predictions.length;

                userEntry.predictions.forEach((pred) => {
                    const fixture = fixtureMap[pred.fixtureId];
                    const pts = computePoints(pred, fixture);
                    if (pts !== null) {
                        totalPoints += pts;
                        if (pts === 3) exactScores++;
                        if (pts >= 1) correctResults++;
                    }
                });

                return {
                    userId: userEntry.userId,
                    name: userEntry.name,
                    email: userEntry.email,
                    totalPoints,
                    exactScores,
                    correctResults,
                    totalPredictions,
                };
            })
            .sort((a, b) => b.totalPoints - a.totalPoints || b.exactScores - a.exactScores);

        ranking.forEach((entry, idx) => {
            entry.position = idx + 1;
        });

        res.json({ total: ranking.length, data: ranking });
    } catch (error) {
        next(error);
    }
}
