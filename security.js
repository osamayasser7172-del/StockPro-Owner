// ═══════════════════════════════════════════════════
//  StockPro — Security Module
//  JWT Token Management + Password Hashing
// ═══════════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ── Secrets (in production, use env vars) ──
const JWT_SECRET = process.env.SP_JWT_SECRET || 'StockPr0_2026!JWT_s3cR3t_K3y#Q9xW7mP';
const JWT_EXPIRY = '6h'; // Token expires in 6 hours
const BCRYPT_ROUNDS = 10;

// ═══════════════════════════════════════════════════
//  JWT Functions
// ═══════════════════════════════════════════════════

/**
 * Generate a signed JWT token
 * @param {Object} payload - Data to encode (serial, plan, deviceId, etc.)
 * @returns {string} Signed JWT token
 */
function generateJWT(payload) {
    return jwt.sign(
        {
            ...payload,
            serverTime: new Date().toISOString(),
            iat: Math.floor(Date.now() / 1000),
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {{ valid: boolean, payload?: Object, error?: string }}
 */
function verifyJWT(token) {
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        return { valid: true, payload };
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return { valid: false, error: 'token_expired' };
        }
        return { valid: false, error: 'token_invalid' };
    }
}

// ═══════════════════════════════════════════════════
//  Password Hashing (bcrypt)
// ═══════════════════════════════════════════════════

/**
 * Hash a plain-text password
 * @param {string} plain - Plain password
 * @returns {string} bcrypt hash
 */
function hashPassword(plain) {
    return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

/**
 * Compare plain password with bcrypt hash
 * @param {string} plain - Plain password
 * @param {string} hash - bcrypt hash
 * @returns {boolean} true if match
 */
function comparePassword(plain, hash) {
    // Support legacy plain-text passwords during migration
    if (!hash.startsWith('$2a$') && !hash.startsWith('$2b$')) {
        return plain === hash;
    }
    return bcrypt.compareSync(plain, hash);
}

/**
 * Check if a password is already hashed
 * @param {string} password
 * @returns {boolean}
 */
function isHashed(password) {
    return password.startsWith('$2a$') || password.startsWith('$2b$');
}

module.exports = {
    generateJWT,
    verifyJWT,
    hashPassword,
    comparePassword,
    isHashed,
    JWT_SECRET,
    JWT_EXPIRY,
};
