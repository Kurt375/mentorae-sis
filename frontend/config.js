// Edit this before you deploy.
window.MENTORAE_CONFIG = {
  API_BASE_URL: (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:5000"
    : "https://YOUR-DEPLOYED-BACKEND-URL.up.railway.app" // Replace with your live backend URL
};
