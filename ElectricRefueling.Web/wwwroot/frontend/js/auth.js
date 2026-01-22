const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const registerButton = document.getElementById("registerButton");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const authStatus = document.getElementById("authStatus");
const authCurrent = document.getElementById("authCurrent");
const authUsername = document.getElementById("authUsername");
const authUserId = document.getElementById("authUserId");

let currentUserId = null;
let currentUsername = null;

function setAuthStatus(message, isError = false) {
  if (!authStatus) return;
  authStatus.textContent = message;
  authStatus.style.color = isError ? "#f38a8a" : "";
}

function updateAuthUI() {
  const isLoggedIn = currentUserId !== null;
  if (authCurrent) authCurrent.hidden = !isLoggedIn;
  if (logoutButton) logoutButton.hidden = !isLoggedIn;
  if (registerButton) registerButton.disabled = isLoggedIn;
  if (loginButton) loginButton.disabled = isLoggedIn;
  if (usernameInput) usernameInput.disabled = isLoggedIn;
  if (passwordInput) passwordInput.disabled = isLoggedIn;

  if (isLoggedIn && authUsername && authUserId) {
    authUsername.textContent = currentUsername || "";
    authUserId.textContent = currentUserId.toString();
    setAuthStatus("Аккаунт активен. Можно сохранять машины.");
  } else {
    setAuthStatus("Создайте аккаунт или войдите в существующий.");
  }
}

function storeAuth(userId, username) {
  currentUserId = userId;
  currentUsername = username;
  localStorage.setItem("er_user_id", userId.toString());
  localStorage.setItem("er_username", username);
  updateAuthUI();
}

function clearAuth() {
  currentUserId = null;
  currentUsername = null;
  localStorage.removeItem("er_user_id");
  localStorage.removeItem("er_username");
  updateAuthUI();
}

async function register() {
  const username = usernameInput?.value.trim();
  const password = passwordInput?.value ?? "";
  if (!username || password.length < 6) {
    setAuthStatus("Введите имя и пароль (минимум 6 символов).", true);
    return;
  }

  setAuthStatus("Создаем аккаунт...");
  const response = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    setAuthStatus("Не удалось зарегистрироваться.", true);
    return;
  }

  const data = await response.json();
  storeAuth(data.userId, username);
}

async function login() {
  const username = usernameInput?.value.trim();
  const password = passwordInput?.value ?? "";
  if (!username || !password) {
    setAuthStatus("Введите имя и пароль.", true);
    return;
  }

  setAuthStatus("Выполняется вход...");
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    setAuthStatus("Неверное имя пользователя или пароль.", true);
    return;
  }

  const data = await response.json();
  storeAuth(data.userId, username);
}

registerButton?.addEventListener("click", () => {
  register().catch(() => setAuthStatus("Ошибка регистрации.", true));
});

loginButton?.addEventListener("click", () => {
  login().catch(() => setAuthStatus("Ошибка входа.", true));
});

logoutButton?.addEventListener("click", () => {
  clearAuth();
});

const storedUserId = localStorage.getItem("er_user_id");
const storedUsername = localStorage.getItem("er_username");
if (storedUserId && storedUsername) {
  currentUserId = Number(storedUserId);
  currentUsername = storedUsername;
}
updateAuthUI();
