// /static/js/login.js
// Shardbound Auth UI — extracted logic (Jarvis-approved)

(function () {
  const qs  = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function showForm(name) {
    qsa("form[data-form]").forEach(f => f.classList.remove("active"));
    const target = qs(`form[data-form="${name}"]`);
    if (target) target.classList.add("active");

    // clear visible error boxes
    qsa(".error").forEach(e => (e.textContent = ""));
  }

  async function handleLogin(e) {
    e.preventDefault();
    const user = qs("#login-username").value.trim();
    const pass = qs("#login-password").value;

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json();
      if (data.ok) {
        window.location.href = data.redirect || "/play";
      } else {
        (qs("#login-error") || {}).textContent =
          "⚔️ The guild does not recognize you.";
      }
    } catch (err) {
      (qs("#login-error") || {}).textContent =
        "Network gremlins detected. Please try again.";
    }
    return false;
  }

  async function handleSignup(e) {
    e.preventDefault();
    const first = qs("#signup-first").value.trim();
    const last  = qs("#signup-last").value.trim();
    const email = qs("#signup-email").value.trim();
    const user  = qs("#signup-username").value.trim();
    const pass  = qs("#signup-password").value;

    const errBox = qs("#signup-error");
    if (errBox) errBox.textContent = "";

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: user,
          password: pass,
          email,
          first_name: first,
          last_name: last,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        alert("Account created. Please log in.");
        showForm("login");
      } else {
        // Field-level messages from server (if present)
        const errs = data.errors || {};
        const lines = [];
        if (errs.username) lines.push(`Username: ${errs.username}`);
        if (errs.email)    lines.push(`Email: ${errs.email}`);
        if (errs.password) lines.push(`Password: ${errs.password}`);
        if (errs._)        lines.push(errs._);

        if (errBox) errBox.textContent = lines.join("  •  ") || (data.error || "Signup failed.");
        else alert(data.error || "Signup failed.");
      }
    } catch (err) {
      if (errBox) errBox.textContent = "Network gremlins detected. Please try again.";
      else alert("Network error.");
    }
    return false;
  }

  // Wire events after DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    // Tab buttons
    const loginTab  = qs('[data-tab="login"]');
    const signupTab = qs('[data-tab="signup"]');
    if (loginTab)  loginTab.addEventListener("click", () => showForm("login"));
    if (signupTab) signupTab.addEventListener("click", () => showForm("signup"));

    // Forms
    const loginForm  = qs('#login-form');
    const signupForm = qs('#signup-form');
    if (loginForm)  loginForm.addEventListener("submit", handleLogin);
    if (signupForm) signupForm.addEventListener("submit", handleSignup);

    // Default view
    showForm("login");
  });
})();
