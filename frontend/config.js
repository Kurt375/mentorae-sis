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
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(window.location.hostname) ||
    window.location.hostname === "0.0.0.0"
  )
    ? `http://${window.location.hostname && window.location.hostname !== "" ? window.location.hostname : "localhost"}:5000`
    : (localStorage.getItem('MENTORAE_API_URL') || "https://mentorae-sis-backend.vercel.app")
};

// Automatically mount universal input restrictions and sanitizers across all portal pages
try {
  if (typeof document !== 'undefined' && !window.MentoraeValidators) {
    const scripts = document.getElementsByTagName('script');
    let configSrc = '';
    for (let i = 0; i < scripts.length; i++) {
      if (scripts[i].src && scripts[i].src.includes('config.js')) {
        configSrc = scripts[i].src;
        break;
      }
    }
    const inputScriptUrl = configSrc ? configSrc.replace('config.js', 'input_restrictions.js') : 'input_restrictions.js';
    const script = document.createElement('script');
    script.src = inputScriptUrl;
    script.defer = true;
    document.head.appendChild(script);
  }
} catch (e) {
  console.warn('Could not auto-inject input_restrictions.js:', e);
}