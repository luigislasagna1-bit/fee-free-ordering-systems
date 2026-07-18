// Empty stand-in for Next-only marker modules (e.g. "server-only") so tsx
// scripts can import server libs outside the Next runtime. See the
// Module._resolveFilename patch in scripts that need it.
module.exports = {};
