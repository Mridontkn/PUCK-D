const form = document.getElementById("newsletterForm");
const emailInput = document.getElementById("newsletterEmail");
const message = document.getElementById("newsletterMessage");

if (form && emailInput && message) {

    const button = form.querySelector('button[type="submit"]');
    const buttonLabel = button ? button.textContent.trim() : "Sign Up";

    function setButtonState(state) {
        if (!button) return;
        button.classList.remove("is-loading", "is-success");
        button.disabled = state === "loading";
        if (state === "loading") {
            button.classList.add("is-loading");
            button.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span class="sr-only">Signing up…</span>';
        } else if (state === "success") {
            button.classList.add("is-success");
            button.innerHTML = '<span class="btn-check" aria-hidden="true">✓</span> Done';
            setTimeout(() => setButtonState("idle"), 2600);
        } else {
            button.textContent = buttonLabel;
        }
    }

    function showError(text) {
        message.textContent = text;
        message.style.color = "#ff5b5b";
        form.classList.remove("shake");
        void form.offsetWidth; // restart the animation
        form.classList.add("shake");
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        if (!email) return;

        message.textContent = "";
        setButtonState("loading");

        const { error } = await db
            .from("newsletter")
            .insert([{ email }]);

        if (error) {
            setButtonState("idle");
            if (error.code === "23505") {
                showError("You're already subscribed! 🏒");
            } else {
                console.error(error);
                showError("Something went wrong. Please try again.");
            }
            return;
        }

        setButtonState("success");
        message.textContent = "Thanks for subscribing to the PUCK'D Newsletter! 🏒";
        message.style.color = "var(--accent-2)";
        form.reset();
    });
}
