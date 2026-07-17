document.addEventListener("DOMContentLoaded", initArticlesPage);

let allArticles = [];

async function initArticlesPage() {
    allArticles = await loadArticlesFromSupabase();

    renderArticles(allArticles);

    setupTagFilters();
}

function renderArticles(articles) {

    const container = document.getElementById("articles-list");

    container.innerHTML = "";

    if (!articles.length) {
        container.innerHTML = "<p>No articles found.</p>";
        return;
    }

    articles.forEach(article => {

container.innerHTML += `
<article class="article-row">

    <div class="thumb">
        <img
            src="${article.imageUrl || "https://placehold.co/220x140"}"
            alt="${article.title}">
    </div>

    <div class="article-body">

        <span class="article-tag">${article.tag}</span>

        <h2>${article.title}</h2>

        <div class="meta">
            ${article.author} • ${article.date}
        </div>

        <p>${article.dek}</p>

        <a href="article.html?id=${article.id}">
            Read Story →
        </a>

    </div>

</article>
`;

    });

}

function setupTagFilters() {

    const buttons = document.querySelectorAll(".tag");

    buttons.forEach(button => {

        button.addEventListener("click", () => {

            buttons.forEach(b => b.classList.remove("active"));
            button.classList.add("active");

            const tag = button.textContent.trim();

            if (tag === "All") {
                renderArticles(allArticles);
                return;
            }

            renderArticles(
                allArticles.filter(article =>
                    article.tag.toLowerCase() === tag.toLowerCase()
                )
            );

        });

    });

}

console.log("articles.js loaded");