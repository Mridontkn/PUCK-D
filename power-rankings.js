const rankingsContainer = document.getElementById("powerRankings");
const updatedDate = document.getElementById("updatedDate");

async function loadPowerRankings() {

    const { data, error } = await db
        .from("power_rankings")
        .select("*")
        .order("rank");

    if (error) {
        console.error(error);
        return;
    }

    if (data.length) {

        updatedDate.textContent =
            "Updated " +
            new Date(data[0].updated).toLocaleDateString(
                "en-US",
                {
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                }
            );
    }

    rankingsContainer.innerHTML = "";

    data.forEach(team => {

        let movement = "";

        if (team.movement > 0) {

            movement =
                `<span class="up">▲${team.movement}</span>`;

        }

        else if (team.movement < 0) {

            movement =
                `<span class="down">▼${Math.abs(team.movement)}</span>`;

        }

        else {

            movement =
                `<span class="same">—</span>`;

        }

        rankingsContainer.innerHTML += `

<div class="ranking-card">

<div class="rank-number">
${team.rank}
</div>

<div class="team-name">
${team.team}
</div>

<div class="team-record">
${team.record}
</div>

<div class="movement">
${movement}
</div>

</div>

`;

    });

}

loadPowerRankings();