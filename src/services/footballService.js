import { getDb } from "../data/connection.js";

const FLAG_CODES = {
    "Argentina": "ar",
    "Algeria": "dz",
    "Australia": "au",
    "Austria": "at",
    "Belgium": "be",
    "Bosnia & Herzegovina": "ba",
    "Brazil": "br",
    "Canada": "ca",
    "Cape Verde": "cv",
    "Colombia": "co",
    "Croatia": "hr",
    "Curaçao": "cw",
    "Czech Republic": "cz",
    "DR Congo": "cd",
    "Ecuador": "ec",
    "Egypt": "eg",
    "England": "gb-eng",
    "France": "fr",
    "Germany": "de",
    "Ghana": "gh",
    "Haiti": "ht",
    "Iran": "ir",
    "Iraq": "iq",
    "Ivory Coast": "ci",
    "Japan": "jp",
    "Jordan": "jo",
    "Mexico": "mx",
    "Morocco": "ma",
    "Netherlands": "nl",
    "New Zealand": "nz",
    "Norway": "no",
    "Panama": "pa",
    "Paraguay": "py",
    "Portugal": "pt",
    "Qatar": "qa",
    "Saudi Arabia": "sa",
    "Scotland": "gb-sct",
    "Senegal": "sn",
    "South Africa": "za",
    "South Korea": "kr",
    "Spain": "es",
    "Sweden": "se",
    "Switzerland": "ch",
    "Tunisia": "tn",
    "Turkey": "tr",
    "Uruguay": "uy",
    "USA": "us",
    "Uzbekistan": "uz",
};

function getFlagUrl(teamName) {
    const code = FLAG_CODES[teamName];
    return code ? `https://flagcdn.com/w80/${code}.png` : null;
}

const OPENFOOTBALL_URL =
    "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

// Genera un ID numérico estable a partir de fecha + equipos
function stableId(match) {
    const str = `${match.date}_${match.team1}_${match.team2}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

// Convierte el formato de hora "13:00 UTC-6" a un Date UTC
function parseKickoffUTC(date, time) {
    try {
        const [hm, utcPart] = time.split(" ");
        const [hours, minutes] = hm.split(":").map(Number);
        let offsetHours = 0;
        if (utcPart) {
            const m = utcPart.match(/UTC([+-]\d+)/);
            if (m) offsetHours = parseInt(m[1]);
        }
        const d = new Date(
            `${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00Z`
        );
        d.setHours(d.getHours() - offsetHours);
        return d;
    } catch {
        return new Date(`${date}T00:00:00Z`);
    }
}

function determineStatus(match) {
    if (match.score?.ft) {
        return { short: "FT", long: "Match Finished", elapsed: 90 };
    }
    const kickoff = parseKickoffUTC(match.date, match.time || "00:00");
    if (new Date() > kickoff) {
        return { short: "1H", long: "In Progress", elapsed: null };
    }
    return { short: "NS", long: "Not Started", elapsed: null };
}

function normalizeMatch(match) {
    const status = determineStatus(match);
    const ft = match.score?.ft ?? null;
    const kickoff = parseKickoffUTC(match.date, match.time || "00:00");

    return {
        fixture: {
            id: stableId(match),
            date: kickoff.toISOString(),
            venue: match.ground ?? null,
            status,
        },
        league: {
            round: match.round,
            group: match.group ?? null,
        },
        teams: {
            home: { name: match.team1, flag: getFlagUrl(match.team1) },
            away: { name: match.team2, flag: getFlagUrl(match.team2) },
        },
        goals: {
            home: ft ? ft[0] : null,
            away: ft ? ft[1] : null,
        },
        score: ft
            ? {
                  halftime: match.score.ht
                      ? { home: match.score.ht[0], away: match.score.ht[1] }
                      : null,
                  fulltime: { home: ft[0], away: ft[1] },
              }
            : null,
    };
}

async function getCached(key) {
    const db = getDb();
    const doc = await db.collection("fixtures_cache").findOne({ key });
    if (doc && Date.now() - doc.updatedAt < CACHE_TTL_MS) return doc.data;
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

    const response = await fetch(OPENFOOTBALL_URL);
    if (!response.ok) throw new Error(`Error al obtener datos: ${response.status}`);

    const data = await response.json();
    const groupMatches = (data.matches ?? [])
        .filter((m) => m.group)
        .map(normalizeMatch);

    await setCache(cacheKey, groupMatches);
    return groupMatches;
}

export async function getFixtureById(fixtureId) {
    const fixtures = await getGroupStageFixtures();
    return fixtures.find((f) => f.fixture.id === Number(fixtureId)) ?? null;
}

export async function getGroupStageRounds() {
    const fixtures = await getGroupStageFixtures();
    return [...new Set(fixtures.map((f) => f.league.round))].sort();
}

export async function getGroupStageStandings() {
    const fixtures = await getGroupStageFixtures();
    const groups = {};

    for (const fixture of fixtures) {
        const group = fixture.league.group;
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
