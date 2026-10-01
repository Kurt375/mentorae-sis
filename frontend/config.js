// Global Environment Configuration
// When running locally, connects to localhost:5000
// When deployed on Vercel or live online, connects to your Render backend
window.MENTORAE_CONFIG = {
  API_BASE_URL: (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "" ||
    window.location.protocol === "file:" ||
    window.location.hostname.startsWith("192.168.") ||
    window.location.hostname.startsWith("10.") ||
    window.location.hostname === "0.0.0.0"
  )
    ? `http://${window.location.hostname && window.location.hostname !== "" ? window.location.hostname : "localhost"}:5000`
    : (localStorage.getItem('MENTORAE_API_URL') || "https://mentorae-sis-backend.onrender.com")
};