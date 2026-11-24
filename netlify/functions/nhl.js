// Proxy for the public NHL web API, which does not send CORS headers.
// Only these fixed feeds are allowed; the client cannot choose an arbitrary URL.
const FEEDS = {
    score: "https://api-web.nhle.com/v1/score/now",
    standings: "https://api-web.nhle.com/v1/standings/now",
    leaders: "https://api-web.nhle.com/v1/skater-stats-leaders/current?categories=points,goals,assists&limit=10",
    goalies: "https://api-web.nhle.com/v1/goalie-stats-leaders/current?categories=wins,savePctg,goalsAgainstAverage,shutouts&limit=10"
};

// NHL season id (e.g. 20262027); a new season starts in September.
function seasonId(now = new Date()) {
    const y = now.getUTCFullYear();
    const start = now.getUTCMonth() >= 8 ? y : y - 1;
    return `${start}${start + 1}`;
}

// Filtered skater lists from the NHL stats API (top 50 by points, sorted client-side).
function skaterSummary(filter) {
    const season = seasonId();
    const params = new URLSearchParams({
        isAggregate: "false",
        isGame: "false",
        sort: JSON.stringify([{ property: "points", direction: "DESC" }, { property: "goals", direction: "DESC" }]),
        start: "0",
        limit: "50",
        cayenneExp: `gameTypeId=2 and seasonId<=${season} and seasonId>=${season} and ${filter}`
    });
    return `https://api.nhle.com/stats/rest/en/skater/summary?${params}`;
}
FEEDS.defense = skaterSummary('positionCode="D"');
FEEDS.rookies = skaterSummary("isRookie=1");

exports.handler = async function (event) {
    const params = event.queryStringParameters || {};
    const feed = params.feed;
    let url = FEEDS[feed];

    // Scores for a specific day (used for last night's goals). Strict format only.
    if (feed === "score" && params.date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
            return { statusCode: 400, body: JSON.stringify({ error: "bad date" }) };
        }
        url = `https://api-web.nhle.com/v1/score/${params.date}`;
    }

    if (!url) {
        return { statusCode: 400, body: JSON.stringify({ error: "unknown feed" }) };
    }

    try {
        const response = await fetch(url, { redirect: "follow" });

        if (!response.ok) {
            throw new Error(`NHL API error: ${response.status}`);
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                // Scores change quickly; standings barely do.
                "Cache-Control": feed === "score" ? "public, max-age=30" : "public, max-age=600"
            },
            body: await response.text()
        };
    } catch (err) {
        return { statusCode: 502, body: JSON.stringify({ error: String(err.message || err) }) };
    }
};
