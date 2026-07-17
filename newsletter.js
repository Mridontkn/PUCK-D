const form = document.getElementById("newsletterForm");
const emailInput = document.getElementById("newsletterEmail");
const message = document.getElementById("newsletterMessage");

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();

    if (!email) return;

    const { error } = await db
        .from("newsletter")
        .insert([{ email }]);

    if (error) {
        if (error.code === "23505") {
            message.textContent = "You're already subscribed! 🏒";
        } else {
            message.textContent = "Something went wrong. Please try again.";
            console.error(error);
        }

        message.style.color = "#ff5b5b";
        return;
    }

    message.textContent = "Thanks for subscribing to the PUCK'D Newsletter! 🏒";
    message.style.color = "#E8632C";

    form.reset();
});