import {
    getGroupStageFixtures,
    getFixtureById,
    getGroupStageRounds,
    getGroupStageStandings,
} from "../services/footballService.js";

export async function getMatches(req, res, next) {
    try {
        const { round, status } = req.query;
        let fixtures = await getGroupStageFixtures();

        if (round) {
            fixtures = fixtures.filter((f) =>
                f.league.round.toLowerCase().includes(round.toLowerCase())
            );
        }

        if (status) {
            fixtures = fixtures.filter(
                (f) => f.fixture.status.short === status.toUpperCase()
            );
        }

        res.json({
            total: fixtures.length,
            data: fixtures,
        });
    } catch (error) {
        next(error);
    }
}

export async function getMatchById(req, res, next) {
    try {
        const { fixtureId } = req.params;
        const fixture = await getFixtureById(fixtureId);

        if (!fixture) {
            return res.status(404).json({ message: "Partido no encontrado" });
        }

        res.json({ data: fixture });
    } catch (error) {
        next(error);
    }
}

export async function getRounds(req, res, next) {
    try {
        const rounds = await getGroupStageRounds();
        res.json({ total: rounds.length, data: rounds });
    } catch (error) {
        next(error);
    }
}

export async function getStandings(req, res, next) {
    try {
        const standings = await getGroupStageStandings();
        res.json({ total: standings.length, data: standings });
    } catch (error) {
        next(error);
    }
}

export async function refreshCache(req, res, next) {
    try {
        const fixtures = await getGroupStageFixtures({ forceRefresh: true });
        res.json({
            message: "Caché de partidos actualizada",
            total: fixtures.length,
        });
    } catch (error) {
        next(error);
    }
}
