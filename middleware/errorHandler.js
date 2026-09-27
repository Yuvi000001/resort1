module.exports = (err, req, res, next) => {
  const status = Number(err.statusCode) || Number(err.status) || 500;
  const message = err.publicMessage || err.message || err.error?.description || err.description || 'Server error';
  console.error('API error:', { status, code: err.code || err.error?.code || 'unknown', message, stack: err.stack || 'unavailable' });
  res.status(status).json({
    message,
  });
};
