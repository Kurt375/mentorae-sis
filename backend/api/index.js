let app;
let initError = null;

try {
  app = require('../server');
} catch (err) {
  initError = err;
  console.error('[FATAL] Backend server initialization error:', err);
}

module.exports = (req, res) => {
  if (initError) {
    console.error('[FATAL] Returning init error to client:', initError);
    return res.status(500).json({
      success: false,
      error: 'Backend initialization failed',
      message: initError.message,
      stack: initError.stack
    });
  }
  return app(req, res);
};
