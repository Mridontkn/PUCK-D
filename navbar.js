async function loadComponent(id, file) {
    const response = await fetch(file);

    if (!response.ok) {
        console.error(`Failed to load ${file}`);
        return;
    }

    document.getElementById(id).innerHTML = await response.text();
}

(async () => {

    await loadComponent("ticker", "ticker.html");
    await loadComponent("navbar", "navbar.html");
    await loadComponent("footer", "footer.html");

    // Initialize search
    if (typeof initSearch === "function") {
        initSearch();
    }

    // Mobile menu
    const hamburger = document.getElementById("hamburgerBtn");
    const mobileMenu = document.getElementById("mobileMenu");

    if (hamburger && mobileMenu) {

        hamburger.addEventListener("click", () => {

            mobileMenu.classList.toggle("active");

            hamburger.textContent = mobileMenu.classList.contains("active")
                ? "✕"
                : "☰";

        });

    }

})();