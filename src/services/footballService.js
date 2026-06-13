import { getDb } from "../data/connection.js";

const FD_BASE = "https://api.football-data.org/v4";
const FD_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const COMPETITION_CODE = "WC";

const CACHE_TTL_MS      = 15 * 60 * 1000;  // 15 min (sin partidos en curso)
const CACHE_TTL_LIVE_MS =      60 * 1000;  // 60s  (partido empezado o en juego)

const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "P"];

function shouldUseLiveTtl(data) {
    if (!data?.length) return false;
    const now = Date.now();
    return data.some((m) => {
        const status = m.fixture?.status?.short;
        if (LIVE_STATUSES.includes(status)) return true;
        // NS pero el kickoff ya pasó → puede haber arrancado
        if (status === "NS") {
            const kickoff = new Date(m.fixture?.date).getTime();
            return now > kickoff;
        }
        return false;
    });
}

function mapStatus(m) {
    switch (m.status) {
        case "FINISHED":
        case "AWARDED":
            return { short: "FT", long: "Match Finished", elapsed: 90 };
        case "IN_PLAY":
            return { short: "1H", long: "In Progress", elapsed: m.minute ?? null };
        case "PAUSED":
            return { short: "HT", long: "Half Time", elapsed: 45 };
        case "EXTRA_TIME":
            return { short: "ET", long: "Extra Time", elapsed: m.minute ?? null };
        case "PENALTY_SHOOTOUT":
            return { short: "P", long: "Penalty Shootout", elapsed: null };
        case "POSTPONED":
            return { short: "PST", long: "Postponed", elapsed: null };
        case "CANCELLED":
            return { short: "CANC", long: "Cancelled", elapsed: null };
        default:
            return { short: "NS", long: "Not Started", elapsed: null };
    }
}

function normalizeMatch(m) {
    const ft = m.score?.fullTime;
    const ht = m.score?.halfTime;
    const group = m.group ? m.group.replace("GROUP_", "Group ") : null;
    const round = m.matchday != null ? `Matchday ${m.matchday}` : (m.stage ?? "Unknown");
    const ftValid = ft && ft.home !== null && ft.away !== null;

    return {
        fixture: {
            id: m.id,
            date: m.utcDate,
            venue: m.venue ?? null,
            status: mapStatus(m),
        },
        league: {
            round,
            group,
        },
        teams: {
            home: {
                name: m.homeTeam.shortName ?? m.homeTeam.name,
                flag: m.homeTeam.crest ?? null,
            },
            away: {
                name: m.awayTeam.shortName ?? m.awayTeam.name,
                flag: m.awayTeam.crest ?? null,
            },
        },
        goals: {
            home: ftValid ? ft.home : null,
            away: ftValid ? ft.away : null,
        },
        score: ftValid
            ? {
                  halftime: ht ? { home: ht.home, away: ht.away } : null,
                  fulltime: { home: ft.home, away: ft.away },
              }
            : null,
    };
}

async function fdFetch(path) {
    const res = await fetch(`${FD_BASE}${path}`, {
        headers: { "X-Auth-Token": FD_API_KEY },
    });
    if (!res.ok) {
        throw new Error(`football-data.org error ${res.status}: ${await res.text()}`);
    }
    return res.json();
}

async function getCached(key) {
    const db = getDb();
    const doc = await db.collection("fixtures_cache").findOne({ key });
    if (!doc) return null;
    const ttl = shouldUseLiveTtl(doc.data) ? CACHE_TTL_LIVE_MS : CACHE_TTL_MS;
    if (Date.now() - doc.updatedAt < ttl) return doc.data;
    return null;
}

async function setCache(key, data) {
    const db = getDb();
    await db.collection("fixtures_cache").updateOne(
        { key },
        { $set: { key, data, updatedAt: Date.now() } },
        { upsert: true }
    );
}

export async function getGroupStageFixtures({ forceRefresh = false } = {}) {
    const cacheKey = "group_stage_fixtures";

    if (!forceRefresh) {
        const cached = await getCached(cacheKey);
        if (cached) return cached;
    }

    const data = await fdFetch(`/competitions/${COMPETITION_CODE}/matches?stage=GROUP_STAGE`);
    const rawMatches = data.matches ?? [];

    const fixtures = rawMatches.map(normalizeMatch);

    await setCache(cacheKey, fixtures);
    return fixtures;
}

export async function getFixtureById(fixtureId) {
    const fixtures = await getGroupStageFixtures();
    const found = fixtures.find((f) => f.fixture.id === Number(fixtureId));
    if (found) return found;

    // Fallback: consulta directa (ej. fase eliminatoria)
    const data = await fdFetch(`/matches/${fixtureId}`);
    return normalizeMatch(data);
}

export async function getGroupStageRounds() {
    const fixtures = await getGroupStageFixtures();
    return [...new Set(fixtures.map((f) => f.league.round))].sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, "")) || 0;
        const numB = parseInt(b.replace(/\D/g, "")) || 0;
        return numA - numB;
    });
}

export async function getGroupStageStandings() {
    const fixtures = await getGroupStageFixtures();
    const groups = {};

    for (const fixture of fixtures) {
        const group = fixture.league.group;
        if (!group) continue;
        if (!groups[group]) groups[group] = {};

        const home = fixture.teams.home.name;
        const away = fixture.teams.away.name;

        for (const team of [home, away]) {
            if (!groups[group][team]) {
                groups[group][team] = {
                    team,
                    played: 0, won: 0, drawn: 0, lost: 0,
                    goalsFor: 0, goalsAgainst: 0, points: 0,
                };
            }
        }

        const hg = fixture.goals.home;
        const ag = fixture.goals.away;

        if (hg !== null && ag !== null) {
            groups[group][home].played++;
            groups[group][away].played++;
            groups[group][home].goalsFor += hg;
            groups[group][home].goalsAgainst += ag;
            groups[group][away].goalsFor += ag;
            groups[group][away].goalsAgainst += hg;

            if (hg > ag) {
                groups[group][home].won++;
                groups[group][home].points += 3;
                groups[group][away].lost++;
            } else if (hg < ag) {
                groups[group][away].won++;
                groups[group][away].points += 3;
                groups[group][home].lost++;
            } else {
                groups[group][home].drawn++;
                groups[group][home].points += 1;
                groups[group][away].drawn++;
                groups[group][away].points += 1;
            }
        }
    }

    return Object.entries(groups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([groupName, teams]) => ({
            group: groupName,
            table: Object.values(teams)
                .sort((a, b) => {
                    const pts = b.points - a.points;
                    if (pts !== 0) return pts;
                    const gd = (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst);
                    if (gd !== 0) return gd;
                    return b.goalsFor - a.goalsFor;
                })
                .map((t, idx) => ({
                    rank: idx + 1,
                    ...t,
                    goalsDiff: t.goalsFor - t.goalsAgainst,
                })),
        }));
}
