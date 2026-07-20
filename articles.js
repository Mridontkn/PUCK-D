document.addEventListener("DOMContentLoaded", initArticlesPage);

let allArticles = [];

async function initArticlesPage() {

    allArticles = await loadArticlesFromSupabase();

    // Make the search use the same data
    articles = allArticles;

    renderArticles(allArticles);

    setupTagFilters();

    // Read category from URL
    const params = new URLSearchParams(window.location.search);
    const category = params.get("category");

    if (category) {

        // Highlight the correct button
        document.querySelectorAll(".tag").forEach(btn => {
            btn.classList.remove("active");

            if (btn.textContent.trim().toLowerCase() === category.toLowerCase()) {
                btn.classList.add("active");
            }
        });

        // Show only matching articles
        renderArticles(
            allArticles.filter(article =>
                article.tag.toLowerCase() === category.toLowerCase()
            )
        );

    }

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
<a class="article-link" href="article.html?id=${article.id}">

<article class="article-row">

    <div class="thumb">
        <img src="${article.imageUrl || "https://placehold.co/220x140"}"
             alt="${article.title}">
    </div>

    <div class="article-body">

        <span class="article-tag">${article.tag}</span>

        <h2>${article.title}</h2>

        <div class="meta">
            ${article.author} • ${article.date}
        </div>

        <p>${article.dek}</p>

        <span class="read-story">
            Read Story →
        </span>

    </div>

</article>

</a>
`;

    });

}

function setupTagFilters() {

    const params = new URLSearchParams(window.location.search);
const category = params.get("category");

if (category) {

    const button = [...document.querySelectorAll(".tag")]
        .find(btn => btn.textContent.trim().toLowerCase() === category.toLowerCase());

    if (button) {
        button.click();
    }

}

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
const category = params.get("category");
console.log(category);
    });


}

console.log("articles.js loaded");

