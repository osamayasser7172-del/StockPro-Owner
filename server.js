// ═══════════════════════════════════════════════════
//  StockPro — License Management Server (PostgreSQL)
//  Run: node server.js
// ═══════════════════════════════════════════════════
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { generateJWT, verifyJWT, hashPassword, comparePassword, isHashed } = require('./security');

const app = express();
const PORT = process.env.PORT || 3000;
const MASTER_KEY = 'STOCKPRO-OWNER-2024';
const MASTER_SERIAL = 'SP-MSTR-OWNR-2024-SPRO';
const GRACE_PERIOD_MS = 60 * 60 * 1000; // 1 hour offline grace

// ── Middleware ──
app.use(cors());
app.use(express.json());

// Serve static files (admin.html, stockpro.html, etc.)
app.use(express.static(path.join(__dirname)));

// Redirect root to main app
app.get('/', (req, res) => res.redirect('/stockpro.html'));

// ── PostgreSQL Database Setup ──
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_uDXLpoB2s3lO@ep-lively-boat-ai5c94ko-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
});

// ── Initialize Database Tables ──
async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                company TEXT NOT NULL,
                phone TEXT DEFAULT '',
                email TEXT DEFAULT '',
                "maxUsers" INTEGER DEFAULT 5,
                "maxWarehouses" INTEGER DEFAULT 1,
                features TEXT DEFAULT '{"sales":true,"inventory":true,"reports":true}',
                plan TEXT DEFAULT 'basic',
                "startDate" TEXT,
                "endDate" TEXT,
                status TEXT DEFAULT 'active',
                "licenseKey" TEXT UNIQUE,
                "createdAt" TEXT DEFAULT (NOW()::TEXT)
            );
            CREATE TABLE IF NOT EXISTS licenses (
                id TEXT PRIMARY KEY,
                "clientId" TEXT,
                "licenseKey" TEXT UNIQUE NOT NULL,
                plan TEXT DEFAULT 'basic',
                "startDate" TEXT,
                "endDate" TEXT,
                status TEXT DEFAULT 'active',
                "deviceId" TEXT DEFAULT NULL,
                "deviceFingerprint" TEXT DEFAULT NULL,
                "lockedAt" TEXT DEFAULT NULL,
                "createdAt" TEXT DEFAULT (NOW()::TEXT),
                FOREIGN KEY ("clientId") REFERENCES clients(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY,
                "clientId" TEXT,
                "deviceName" TEXT NOT NULL,
                "deviceType" TEXT DEFAULT 'desktop',
                "deviceId" TEXT DEFAULT NULL,
                "lastSeen" TEXT,
                status TEXT DEFAULT 'offline',
                FOREIGN KEY ("clientId") REFERENCES clients(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS admin_users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT DEFAULT 'admin',
                email TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                "createdAt" TEXT DEFAULT (NOW()::TEXT)
            );
        `);

        // ── Seed default admin users ──
        const { rows } = await client.query('SELECT COUNT(*) as c FROM admin_users');
        if (parseInt(rows[0].c) === 0) {
            await client.query(
                'INSERT INTO admin_users (id, username, password, name, role, email, phone) VALUES ($1,$2,$3,$4,$5,$6,$7)',
                ['au1', 'admin', hashPassword('admin123'), 'مدير النظام', 'super_admin', 'admin@stockpro.com', '01000000000']
            );
            await client.query(
                'INSERT INTO admin_users (id, username, password, name, role, email, phone) VALUES ($1,$2,$3,$4,$5,$6,$7)',
                ['au2', 'support', hashPassword('support123'), 'دعم فني', 'support', 'support@stockpro.com', '01111111111']
            );
            console.log('✅ Default admin users created (bcrypt hashed)');
        }

        // ── Migrate plain-text passwords to bcrypt ──
        const { rows: allUsers } = await client.query('SELECT id, password FROM admin_users');
        for (const u of allUsers) {
            if (!isHashed(u.password)) {
                await client.query('UPDATE admin_users SET password = $1 WHERE id = $2', [hashPassword(u.password), u.id]);
                console.log(`🔐 Migrated password to bcrypt for user: ${u.id}`);
            }
        }

        console.log('✅ PostgreSQL database initialized');
    } finally {
        client.release();
    }
}

// ── Helper: query shorthand ──
async function dbGet(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows[0] || null;
}
async function dbAll(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows;
}
async function dbRun(sql, params = []) {
    await pool.query(sql, params);
}

// ── Auth Middleware ──
function requireMasterKey(req, res, next) {
    const key = req.headers['x-master-key'] || req.query.masterKey;
    if (key !== MASTER_KEY) {
        return res.status(403).json({ error: 'مفتاح المالك غير صحيح' });
    }
    next();
}

// ── Helper: Generate Self-Validating License Key ──
const SP_SECRET = 'SPRO2024XK';
const SP_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SP_PLAN_CODE = { basic: 'B', premium: 'P', enterprise: 'E' };

function spHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return Math.abs(h);
}

function spChecksum(g1, g2, g3) {
    const h = spHash(SP_SECRET + g1 + g2 + g3);
    let ck = '';
    for (let i = 0; i < 4; i++) ck += SP_CHARS[(h >> (i * 5)) % SP_CHARS.length];
    return ck;
}

function genLicenseKey(plan = 'basic') {
    const rnd = () => { let s = ''; for (let i = 0; i < 4; i++) s += SP_CHARS[Math.floor(Math.random() * SP_CHARS.length)]; return s; };
    const g1 = rnd();
    const g2 = rnd();
    const planCode = SP_PLAN_CODE[plan] || 'B';
    const g3 = planCode + rnd().slice(1);
    const g4 = spChecksum(g1, g2, g3);
    return `SP-${g1}-${g2}-${g3}-${g4}`;
}

// ═══════════════════════════════════════════════════
//  PUBLIC API — Server Time (anti-tampering)
// ═══════════════════════════════════════════════════
app.get('/api/time', (req, res) => {
    res.json({
        serverTime: new Date().toISOString(),
        timestamp: Date.now()
    });
});

// ═══════════════════════════════════════════════════
//  PUBLIC API — License Validation + JWT Token
// ═══════════════════════════════════════════════════
app.post('/api/validate', async (req, res) => {
    try {
        const { serial, deviceId } = req.body;
        if (!serial) return res.status(400).json({ valid: false, error: 'مفتاح الترخيص مطلوب' });

        // ── Master Serial: owner can access any client ──
        if (serial === MASTER_SERIAL) {
            const clients = await dbAll('SELECT id, name, company, "licenseKey", plan, status FROM clients ORDER BY company');
            const token = generateJWT({
                serial: MASTER_SERIAL,
                isMaster: true,
                plan: 'enterprise',
                deviceId: deviceId || null,
            });
            return res.json({
                valid: true,
                isMaster: true,
                license: { licenseKey: MASTER_SERIAL, plan: 'enterprise', status: 'active' },
                client: { id: 'master', name: 'مالك البرنامج', company: 'StockPro Owner' },
                clients: clients,
                token: token,
                serverTime: new Date().toISOString(),
                gracePeriodMs: GRACE_PERIOD_MS,
            });
        }

        // ── Regular license validation ──
        const license = await dbGet('SELECT * FROM licenses WHERE "licenseKey" = $1', [serial]);
        if (!license) return res.json({ valid: false, error: 'مفتاح غير صالح' });
        if (license.status !== 'active') return res.json({ valid: false, error: 'الترخيص موقوف' });

        // Check expiry using SERVER TIME
        if (license.endDate && new Date(license.endDate) < new Date()) {
            await dbRun('UPDATE licenses SET status = $1 WHERE id = $2', ['expired', license.id]);
            await dbRun('UPDATE clients SET status = $1 WHERE id = $2', ['expired', license.clientId]);
            return res.json({ valid: false, error: 'الترخيص منتهي الصلاحية' });
        }

        // ── Device Lock Check ──
        if (deviceId && license.deviceId && license.deviceId !== deviceId) {
            return res.json({
                valid: false,
                error: 'الترخيص مقفول على جهاز آخر — تواصل مع الأدمن لفك القفل',
                deviceLocked: true,
            });
        }

        // ── Lock device on first use ──
        if (deviceId && !license.deviceId) {
            await dbRun('UPDATE licenses SET "deviceId" = $1, "lockedAt" = $2 WHERE id = $3',
                [deviceId, new Date().toISOString(), license.id]);
            console.log(`🔒 License ${serial} locked to device: ${deviceId}`);
        }

        const client = await dbGet('SELECT * FROM clients WHERE id = $1', [license.clientId]);

        // Generate JWT token with server time
        const token = generateJWT({
            serial: license.licenseKey,
            licenseId: license.id,
            clientId: license.clientId,
            plan: license.plan,
            deviceId: deviceId || license.deviceId,
            endDate: license.endDate,
        });

        res.json({
            valid: true,
            isMaster: false,
            license: {
                id: license.id,
                licenseKey: license.licenseKey,
                plan: license.plan,
                startDate: license.startDate,
                endDate: license.endDate,
                status: license.status
            },
            client: client ? {
                id: client.id,
                name: client.name,
                company: client.company,
                phone: client.phone,
                maxUsers: client.maxUsers,
                maxWarehouses: client.maxWarehouses,
                features: JSON.parse(client.features || '{}')
            } : null,
            token: token,
            serverTime: new Date().toISOString(),
            gracePeriodMs: GRACE_PERIOD_MS,
        });
    } catch (err) {
        console.error('❌ Validate error:', err.message);
        res.status(500).json({ valid: false, error: 'خطأ داخلي في السيرفر' });
    }
});

// ═══════════════════════════════════════════════════
//  PUBLIC API — Heartbeat (every 5 minutes)
// ═══════════════════════════════════════════════════
app.post('/api/heartbeat', async (req, res) => {
    try {
        const { token, deviceId } = req.body;
        if (!token) return res.status(400).json({ valid: false, error: 'token مطلوب' });

        // Verify JWT
        const jwt = verifyJWT(token);
        if (!jwt.valid) {
            return res.json({
                valid: false,
                error: jwt.error === 'token_expired' ? 'انتهت الجلسة — سجل دخول مرة أخرى' : 'جلسة غير صالحة',
                requireReauth: true,
            });
        }

        const { serial, isMaster } = jwt.payload;

        // Master serial always valid
        if (isMaster || serial === MASTER_SERIAL) {
            return res.json({
                valid: true,
                serverTime: new Date().toISOString(),
                timestamp: Date.now(),
            });
        }

        // Re-check license in DB (live status)
        const license = await dbGet('SELECT * FROM licenses WHERE "licenseKey" = $1', [serial]);
        if (!license) return res.json({ valid: false, error: 'ترخيص غير موجود', requireReauth: true });
        if (license.status !== 'active') return res.json({ valid: false, error: 'الترخيص موقوف', expired: true });

        // Re-check expiry using SERVER TIME
        if (license.endDate && new Date(license.endDate) < new Date()) {
            await dbRun('UPDATE licenses SET status = $1 WHERE id = $2', ['expired', license.id]);
            await dbRun('UPDATE clients SET status = $1 WHERE id = $2', ['expired', license.clientId]);
            return res.json({ valid: false, error: 'الترخيص منتهي الصلاحية', expired: true });
        }

        // Re-check device lock
        if (deviceId && license.deviceId && license.deviceId !== deviceId) {
            return res.json({ valid: false, error: 'الترخيص مقفول على جهاز آخر', deviceLocked: true });
        }

        // Calculate remaining time
        const remainingMs = license.endDate
            ? Math.max(0, new Date(license.endDate).getTime() - Date.now())
            : null;

        // Update device lastSeen
        if (deviceId) {
            const existingDevice = await dbGet('SELECT id FROM devices WHERE "deviceId" = $1', [deviceId]);
            if (existingDevice) {
                await dbRun('UPDATE devices SET "lastSeen" = $1, status = $2 WHERE id = $3',
                    [new Date().toISOString(), 'online', existingDevice.id]);
            }
        }

        // Issue fresh token
        const newToken = generateJWT({
            serial: license.licenseKey,
            licenseId: license.id,
            clientId: license.clientId,
            plan: license.plan,
            deviceId: deviceId || license.deviceId,
            endDate: license.endDate,
        });

        res.json({
            valid: true,
            serverTime: new Date().toISOString(),
            timestamp: Date.now(),
            remainingMs: remainingMs,
            endDate: license.endDate,
            token: newToken,
        });
    } catch (err) {
        console.error('❌ Heartbeat error:', err.message);
        res.status(500).json({ valid: false, error: 'خطأ داخلي' });
    }
});

// ═══════════════════════════════════════════════════
//  ADMIN API — Requires Master Key
// ═══════════════════════════════════════════════════

// ── Admin Auth (bcrypt) ──
app.post('/api/admin/login', requireMasterKey, async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await dbGet('SELECT * FROM admin_users WHERE username = $1', [username]);
        if (!user) return res.status(401).json({ error: 'بيانات خاطئة' });
        if (!comparePassword(password, user.password)) return res.status(401).json({ error: 'بيانات خاطئة' });
        if (user.role !== 'super_admin') return res.status(403).json({ error: 'لوحة الأدمن متاحة فقط لمالك البرنامج' });

        const token = generateJWT({ userId: user.id, role: user.role, isAdmin: true });
        res.json({
            user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email, phone: user.phone },
            token: token,
        });
    } catch (err) {
        console.error('❌ Login error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

// ── Dashboard ──
app.get('/api/admin/dashboard', requireMasterKey, async (req, res) => {
    try {
        const totalClients = (await dbGet('SELECT COUNT(*) as c FROM clients')).c;
        const activeClients = (await dbGet("SELECT COUNT(*) as c FROM clients WHERE status = 'active'")).c;
        const expiredClients = (await dbGet("SELECT COUNT(*) as c FROM clients WHERE status = 'expired'")).c;
        const totalDevices = (await dbGet('SELECT COUNT(*) as c FROM devices')).c;
        const onlineDevices = (await dbGet("SELECT COUNT(*) as c FROM devices WHERE status = 'online'")).c;
        const activeLicenses = (await dbGet("SELECT COUNT(*) as c FROM licenses WHERE status = 'active'")).c;
        const recentClients = await dbAll('SELECT * FROM clients ORDER BY "createdAt" DESC LIMIT 5');
        const recentDevices = await dbAll('SELECT d.*, c.company FROM devices d LEFT JOIN clients c ON d."clientId" = c.id ORDER BY d."lastSeen" DESC LIMIT 5');

        res.json({
            totalClients: parseInt(totalClients),
            activeClients: parseInt(activeClients),
            expiredClients: parseInt(expiredClients),
            totalDevices: parseInt(totalDevices),
            onlineDevices: parseInt(onlineDevices),
            activeLicenses: parseInt(activeLicenses),
            recentClients,
            recentDevices
        });
    } catch (err) {
        console.error('❌ Dashboard error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

// ── Clients CRUD ──
app.get('/api/admin/clients', requireMasterKey, async (req, res) => {
    try {
        const clients = await dbAll('SELECT * FROM clients ORDER BY "createdAt" DESC');
        clients.forEach(c => { try { c.features = JSON.parse(c.features); } catch { c.features = {}; } });
        res.json(clients);
    } catch (err) {
        console.error('❌ Get clients error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

app.get('/api/admin/clients/:id', requireMasterKey, async (req, res) => {
    try {
        const client = await dbGet('SELECT * FROM clients WHERE id = $1', [req.params.id]);
        if (!client) return res.status(404).json({ error: 'العميل غير موجود' });
        try { client.features = JSON.parse(client.features); } catch { client.features = {}; }
        const devices = await dbAll('SELECT * FROM devices WHERE "clientId" = $1', [req.params.id]);
        const licenses = await dbAll('SELECT * FROM licenses WHERE "clientId" = $1', [req.params.id]);
        res.json({ client, devices, licenses });
    } catch (err) {
        console.error('❌ Get client error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

app.post('/api/admin/clients', requireMasterKey, async (req, res) => {
    try {
        const { name, company, phone, email, maxUsers, maxWarehouses, features, plan, startDate, endDate, status } = req.body;
        if (!name || !company) return res.status(400).json({ error: 'الاسم والشركة مطلوبين' });

        const id = 'c_' + uuidv4().slice(0, 8);
        const licenseKey = genLicenseKey(plan || 'basic');
        const sDate = startDate || new Date().toISOString();
        const eDate = endDate || (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString(); })();
        const now = new Date().toISOString();

        await dbRun(
            `INSERT INTO clients (id, name, company, phone, email, "maxUsers", "maxWarehouses", features, plan, "startDate", "endDate", status, "licenseKey", "createdAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [id, name, company, phone || '', email || '', maxUsers || 5, maxWarehouses || 1,
                JSON.stringify(features || { sales: true, inventory: true, reports: true }),
                plan || 'basic', sDate, eDate, status || 'active', licenseKey, now]
        );

        // Auto-create license
        const licId = 'l_' + uuidv4().slice(0, 8);
        await dbRun(
            'INSERT INTO licenses (id, "clientId", "licenseKey", plan, "startDate", "endDate", status, "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [licId, id, licenseKey, plan || 'basic', sDate, eDate, 'active', now]
        );

        const client = await dbGet('SELECT * FROM clients WHERE id = $1', [id]);
        try { client.features = JSON.parse(client.features); } catch { client.features = {}; }
        res.json(client);
    } catch (err) {
        console.error('❌ Create client error:', err.message);
        res.status(500).json({ error: 'خطأ في إنشاء العميل' });
    }
});

app.put('/api/admin/clients/:id', requireMasterKey, async (req, res) => {
    try {
        const { name, company, phone, email, maxUsers, maxWarehouses, features, plan, startDate, endDate, status } = req.body;
        const existing = await dbGet('SELECT * FROM clients WHERE id = $1', [req.params.id]);
        if (!existing) return res.status(404).json({ error: 'العميل غير موجود' });

        await dbRun(
            `UPDATE clients SET name=$1, company=$2, phone=$3, email=$4, "maxUsers"=$5, "maxWarehouses"=$6, features=$7, plan=$8, "startDate"=$9, "endDate"=$10, status=$11 WHERE id=$12`,
            [name || existing.name, company || existing.company, phone ?? existing.phone, email ?? existing.email,
            maxUsers || existing.maxUsers, maxWarehouses || existing.maxWarehouses,
            JSON.stringify(features || JSON.parse(existing.features || '{}')),
            plan || existing.plan, startDate || existing.startDate, endDate || existing.endDate,
            status || existing.status, req.params.id]
        );

        const client = await dbGet('SELECT * FROM clients WHERE id = $1', [req.params.id]);
        try { client.features = JSON.parse(client.features); } catch { client.features = {}; }
        res.json(client);
    } catch (err) {
        console.error('❌ Update client error:', err.message);
        res.status(500).json({ error: 'خطأ في تحديث العميل' });
    }
});

app.delete('/api/admin/clients/:id', requireMasterKey, async (req, res) => {
    try {
        await dbRun('DELETE FROM devices WHERE "clientId" = $1', [req.params.id]);
        await dbRun('DELETE FROM licenses WHERE "clientId" = $1', [req.params.id]);
        await dbRun('DELETE FROM clients WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Delete client error:', err.message);
        res.status(500).json({ error: 'خطأ في حذف العميل' });
    }
});

// ── Licenses CRUD ──
app.get('/api/admin/licenses', requireMasterKey, async (req, res) => {
    try {
        const licenses = await dbAll('SELECT l.*, c.company, c.name as "clientName" FROM licenses l LEFT JOIN clients c ON l."clientId" = c.id ORDER BY l."createdAt" DESC');
        res.json(licenses);
    } catch (err) {
        console.error('❌ Get licenses error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

app.post('/api/admin/licenses', requireMasterKey, async (req, res) => {
    try {
        const { clientId, plan, months } = req.body;
        const client = await dbGet('SELECT * FROM clients WHERE id = $1', [clientId]);
        if (!client) return res.status(404).json({ error: 'العميل غير موجود' });

        const id = 'l_' + uuidv4().slice(0, 8);
        const licenseKey = genLicenseKey(plan || 'basic');
        const start = new Date().toISOString();
        const end = new Date(); end.setMonth(end.getMonth() + (months || 12));

        await dbRun(
            'INSERT INTO licenses (id, "clientId", "licenseKey", plan, "startDate", "endDate", status, "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [id, clientId, licenseKey, plan || 'basic', start, end.toISOString(), 'active', start]
        );

        // Update client
        await dbRun(
            'UPDATE clients SET "licenseKey"=$1, plan=$2, "startDate"=$3, "endDate"=$4, status=$5 WHERE id=$6',
            [licenseKey, plan || 'basic', start, end.toISOString(), 'active', clientId]
        );

        res.json({ id, clientId, licenseKey, plan: plan || 'basic', startDate: start, endDate: end.toISOString(), status: 'active' });
    } catch (err) {
        console.error('❌ Create license error:', err.message);
        res.status(500).json({ error: 'خطأ في إنشاء الترخيص' });
    }
});

app.put('/api/admin/licenses/:id/renew', requireMasterKey, async (req, res) => {
    try {
        const { months } = req.body;
        const license = await dbGet('SELECT * FROM licenses WHERE id = $1', [req.params.id]);
        if (!license) return res.status(404).json({ error: 'الترخيص غير موجود' });

        const end = new Date(); end.setMonth(end.getMonth() + (months || 12));
        await dbRun('UPDATE licenses SET "endDate" = $1, status = $2 WHERE id = $3', [end.toISOString(), 'active', req.params.id]);
        await dbRun('UPDATE clients SET "endDate" = $1, status = $2 WHERE id = $3', [end.toISOString(), 'active', license.clientId]);

        res.json({ success: true, endDate: end.toISOString() });
    } catch (err) {
        console.error('❌ Renew license error:', err.message);
        res.status(500).json({ error: 'خطأ في تجديد الترخيص' });
    }
});

app.put('/api/admin/licenses/:id/revoke', requireMasterKey, async (req, res) => {
    try {
        const license = await dbGet('SELECT * FROM licenses WHERE id = $1', [req.params.id]);
        if (!license) return res.status(404).json({ error: 'الترخيص غير موجود' });

        await dbRun('UPDATE licenses SET status = $1 WHERE id = $2', ['revoked', req.params.id]);
        await dbRun('UPDATE clients SET status = $1 WHERE id = $2', ['suspended', license.clientId]);

        res.json({ success: true });
    } catch (err) {
        console.error('❌ Revoke license error:', err.message);
        res.status(500).json({ error: 'خطأ في إلغاء الترخيص' });
    }
});

// ── Device Unlock (Admin) ──
app.put('/api/admin/licenses/:id/unlock-device', requireMasterKey, async (req, res) => {
    try {
        const license = await dbGet('SELECT * FROM licenses WHERE id = $1', [req.params.id]);
        if (!license) return res.status(404).json({ error: 'الترخيص غير موجود' });

        await dbRun('UPDATE licenses SET "deviceId" = NULL, "deviceFingerprint" = NULL, "lockedAt" = NULL WHERE id = $1', [req.params.id]);

        console.log(`🔓 Device unlocked for license: ${license.licenseKey}`);
        res.json({ success: true, message: 'تم فك قفل الجهاز بنجاح' });
    } catch (err) {
        console.error('❌ Unlock device error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

// ── Get device lock info ──
app.get('/api/admin/licenses/:id/device-info', requireMasterKey, async (req, res) => {
    try {
        const license = await dbGet('SELECT * FROM licenses WHERE id = $1', [req.params.id]);
        if (!license) return res.status(404).json({ error: 'الترخيص غير موجود' });
        res.json({
            deviceId: license.deviceId,
            deviceFingerprint: license.deviceFingerprint,
            lockedAt: license.lockedAt,
            isLocked: !!license.deviceId,
        });
    } catch (err) {
        console.error('❌ Device info error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

// ── Devices CRUD ──
app.get('/api/admin/devices', requireMasterKey, async (req, res) => {
    try {
        const devices = await dbAll('SELECT d.*, c.company FROM devices d LEFT JOIN clients c ON d."clientId" = c.id ORDER BY d."lastSeen" DESC');
        res.json(devices);
    } catch (err) {
        console.error('❌ Get devices error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

app.post('/api/admin/devices', requireMasterKey, async (req, res) => {
    try {
        const { deviceName, deviceType, clientId, status } = req.body;
        if (!deviceName) return res.status(400).json({ error: 'اسم الجهاز مطلوب' });
        const id = 'd_' + uuidv4().slice(0, 8);
        await dbRun(
            'INSERT INTO devices (id, "clientId", "deviceName", "deviceType", "lastSeen", status) VALUES ($1,$2,$3,$4,$5,$6)',
            [id, clientId, deviceName, deviceType || 'desktop', new Date().toISOString(), status || 'offline']
        );
        res.json({ id, clientId, deviceName, deviceType, status });
    } catch (err) {
        console.error('❌ Create device error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

app.put('/api/admin/devices/:id', requireMasterKey, async (req, res) => {
    try {
        const { deviceName, deviceType, clientId, status } = req.body;
        await dbRun(
            'UPDATE devices SET "deviceName"=$1, "deviceType"=$2, "clientId"=$3, status=$4, "lastSeen"=$5 WHERE id=$6',
            [deviceName, deviceType, clientId, status, new Date().toISOString(), req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Update device error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

app.delete('/api/admin/devices/:id', requireMasterKey, async (req, res) => {
    try {
        await dbRun('DELETE FROM devices WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Delete device error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

// ── Admin Users ──
app.get('/api/admin/users', requireMasterKey, async (req, res) => {
    try {
        const users = await dbAll('SELECT id, username, name, role, email, phone, "createdAt" FROM admin_users');
        res.json(users);
    } catch (err) {
        console.error('❌ Get users error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

app.post('/api/admin/users', requireMasterKey, async (req, res) => {
    try {
        const { username, password, name, role, email, phone } = req.body;
        if (!username || !password || !name) return res.status(400).json({ error: 'بيانات ناقصة' });
        const id = 'au_' + uuidv4().slice(0, 8);
        await dbRun(
            'INSERT INTO admin_users (id, username, password, name, role, email, phone) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [id, username, hashPassword(password), name, role || 'admin', email || '', phone || '']
        );
        res.json({ id, username, name, role });
    } catch (err) {
        console.error('❌ Create user error:', err.message);
        res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
});

app.put('/api/admin/users/:id', requireMasterKey, async (req, res) => {
    try {
        const { name, password, role, email, phone } = req.body;
        const user = await dbGet('SELECT * FROM admin_users WHERE id = $1', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

        const newPassword = password ? hashPassword(password) : user.password;
        await dbRun(
            'UPDATE admin_users SET name=$1, password=$2, role=$3, email=$4, phone=$5 WHERE id=$6',
            [name || user.name, newPassword, role || user.role, email ?? user.email, phone ?? user.phone, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Update user error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

app.delete('/api/admin/users/:id', requireMasterKey, async (req, res) => {
    try {
        await dbRun('DELETE FROM admin_users WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Delete user error:', err.message);
        res.status(500).json({ error: 'خطأ داخلي' });
    }
});

// ═══════════════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════════════
initDB().then(() => {
    app.listen(PORT, () => {
        console.log('');
        console.log('═══════════════════════════════════════════════════');
        console.log('  🚀 StockPro License Server (PostgreSQL)');
        console.log('═══════════════════════════════════════════════════');
        console.log(`  📡 Server:     http://localhost:${PORT}`);
        console.log(`  🛡️  Admin:      http://localhost:${PORT}/admin.html`);
        console.log(`  📱 Client:     http://localhost:${PORT}/stockpro.html`);
        console.log(`  🔑 Master Key: ${MASTER_KEY}`);
        console.log(`  🔐 Master Serial: ${MASTER_SERIAL}`);
        console.log(`  🗄️  Database:   PostgreSQL (Neon)`);
        console.log(`  🔒 Security:   JWT + bcrypt + Device Lock`);
        console.log(`  ⏰ Grace Period: ${GRACE_PERIOD_MS / 60000} minutes`);
        console.log('═══════════════════════════════════════════════════');
        console.log('');
    });
}).catch(err => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
});
