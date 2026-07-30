"use strict";

const loginForm = document.getElementById("dispatcher-login-form");
const loginUsername = document.getElementById(
    "dispatcher-login-username"
);
const loginPassword = document.getElementById(
    "dispatcher-login-password"
);
const loginError = document.getElementById("dispatcher-login-error");
const loginSubmit = document.getElementById(
    "dispatcher-login-submit"
);

function clearLoginError() {
    loginError.textContent = "";
}

function handleLogin(event) {
    event.preventDefault();
    clearLoginError();

    loginSubmit.disabled = true;
    loginSubmit.textContent = "Signing In...";

    const account = authenticateDispatcher(
        loginUsername.value,
        loginPassword.value
    );

    if (!account) {
        loginError.textContent =
            "The username or password is incorrect.";
        loginPassword.value = "";
        loginPassword.focus();
        loginSubmit.disabled = false;
        loginSubmit.textContent = "Sign In";
        return;
    }

    createDispatcherSession(account);
    window.location.replace("dispatcher.html");
}

if (getDispatcherSession()) {
    window.location.replace("dispatcher.html");
} else {
    loginForm.addEventListener("submit", handleLogin);
    loginUsername.addEventListener("input", clearLoginError);
    loginPassword.addEventListener("input", clearLoginError);
}
