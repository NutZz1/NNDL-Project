const errorHandler = (err, req, res, next) => {
  console.error('[Error Handler]', err.stack || err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Server Error in CivicScan Processing',
  });
};

module.exports = errorHandler;
