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

    // Reveal the page once the header is in and fonts are ready (don't wait long for fonts)
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise(r => setTimeout(r, 800))])
        .then(() => document.documentElement.classList.remove("is-loading"));

    // Mark the current page's nav link (works with or without ".html" in the URL)
    const clean = path => (path.split("?")[0].split("#")[0].split("/").pop() || "index").toLowerCase().replace(/\.html$/, "");
    const page = clean(location.pathname);
    ["#navbar nav.primary", "#navbar .mobile-menu"].forEach(sel => {
        const match = [...document.querySelectorAll(`${sel} a`)]
            .find(a => clean(a.getAttribute("href") || "") === page);
        if (match) {
            match.classList.add("is-active");
            match.setAttribute("aria-current", "page");
        }
    });

    // Load ticker on every page
    if (typeof initTicker === "function") {
        await initTicker();
    }

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