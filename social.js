document.addEventListener("DOMContentLoaded", initSocialPage);

let allPosts = [];


async function initSocialPage() {

    allPosts = await loadSocialFeed();

    renderSocialFeed(allPosts);

    setupFilters();

}

function renderSocialFeed(posts) {

    const container = document.getElementById("socialFeed");

    if (!posts.length) {
        container.innerHTML = `
            <p>No posts yet.</p>
        `;
        return;
    }

    const logos = {
    "PUCK'D Media": "logo.png",
    "IceMetrix": "IceMetrix.jpg"
};

    container.innerHTML = posts.map(post => `

        <article
    class="social-card ${post.post_url ? "clickable" : ""}"
    ${post.post_url ? `onclick="window.open('${post.post_url}', '_blank')"` : ""}>

            <div class="social-header">

                <div class="social-avatar">
    <img
        src="${logos[post.account] || "logo.png"}"
        alt="${post.account}">
</div>

<div class="social-account">

    <h3>
        ${post.account}
        ${post.verified ? `<span class="verified">✓</span>` : ""}
    </h3>

    <span class="social-username">${post.username || ""}</span>

    <small class="social-time">
        ${formatTimeAgo(post.created_at)}
    </small>

</div>

            </div>

            <p class="social-content">
                ${post.content}
            </p>

            ${post.image_url ? `
                <img
                    src="${post.image_url}"
                    class="social-image"
                    alt="Post image">
            ` : ""}

            ${post.post_url ? `
                <a
                    href="${post.post_url}"
                    target="_blank"
                    class="social-link">
                    View on X →
                </a>
            ` : ""}

        </article>

    `).join("");

}

function setupFilters() {

    const buttons = document.querySelectorAll(".tag");

    buttons.forEach(button => {

        button.addEventListener("click", () => {

            buttons.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");

            const filter = button.dataset.filter;

            if (filter === "All") {
                renderSocialFeed(allPosts);
                return;
            }

            const filtered = allPosts.filter(post => post.account === filter);

            renderSocialFeed(filtered);

        });

    });

}

function formatTimeAgo(dateString) {

    const now = new Date();
    const postDate = new Date(dateString);

    const seconds = Math.floor((now - postDate) / 1000);

    if (seconds < 60)
        return "Just now";

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60)
        return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);

    if (hours < 24)
        return `${hours}h ago`;

    const days = Math.floor(hours / 24);

    if (days === 1)
        return "Yesterday";

    if (days < 7)
        return `${days}d ago`;

    return postDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
});
}