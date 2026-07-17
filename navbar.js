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

    if (typeof initSearch === "function") {
        initSearch();
    }

})();