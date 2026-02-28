// ═══════════════════════════════════════════════════
//  StockPro — License Management Server (Secure)
//  Run: node server.js
// ═══════════════════════════════════════════════════
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
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

// ── Database Setup ──
const db = new Database(path.join(__dirname, 'stockpro.db'));
db.pragma('journal_mode = WAL');

// Create tables (with device lock columns)
db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        company TEXT NOT NULL,
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        maxUsers INTEGER DEFAULT 5,
        maxWarehouses INTEGER DEFAULT 1,
        features TEXT DEFAULT '{"sales":true,"inventory":true,"reports":true}',
        plan TEXT DEFAULT 'basic',
        startDate TEXT,
        endDate TEXT,
        status TEXT DEFAULT 'active',
        licenseKey TEXT UNIQUE,
        createdAt TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS licenses (
        id TEXT PRIMARY KEY,
        clientId TEXT,
        licenseKey TEXT UNIQUE NOT NULL,
        plan TEXT DEFAULT 'basic',
        startDate TEXT,
        endDate TEXT,
        status TEXT DEFAULT 'active',
        deviceId TEXT DEFAULT NULL,
        deviceFingerprint TEXT DEFAULT NULL,
        lockedAt TEXT DEFAULT NULL,
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        clientId TEXT,
        deviceName TEXT NOT NULL,
        deviceType TEXT DEFAULT 'desktop',
        deviceId TEXT DEFAULT NULL,
        lastSeen TEXT,
        status TEXT DEFAULT 'offline',
        FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        email TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        createdAt TEXT DEFAULT (datetime('now'))
    );
`);

// ── Add missing columns if upgrading from old schema ──
try { db.exec('ALTER TABLE licenses ADD COLUMN deviceId TEXT DEFAULT NULL'); } catch (e) { /* column exists */ }
try { db.exec('ALTER TABLE licenses ADD COLUMN deviceFingerprint TEXT DEFAULT NULL'); } catch (e) { /* column exists */ }
try { db.exec('ALTER TABLE licenses ADD COLUMN lockedAt TEXT DEFAULT NULL'); } catch (e) { /* column exists */ }
try { db.exec('ALTER TABLE devices ADD COLUMN deviceId TEXT DEFAULT NULL'); } catch (e) { /* column exists */ }

// ── Seed default admin user (with bcrypt hash) ──
const adminCount = db.prepare('SELECT COUNT(*) as c FROM admin_users').get().c;
if (adminCount === 0) {
    const stmt = db.prepare('INSERT INTO admin_users (id, username, password, name, role, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)');
    stmt.run('au1', 'admin', hashPassword('admin123'), 'مدير النظام', 'super_admin', 'admin@stockpro.com', '01000000000');
    stmt.run('au2', 'support', hashPassword('support123'), 'دعم فني', 'support', 'support@stockpro.com', '01111111111');
    console.log('✅ Default admin users created (bcrypt hashed)');
}

// ── Migrate plain-text passwords to bcrypt ──
const allUsers = db.prepare('SELECT id, password FROM admin_users').all();
allUsers.forEach(u => {
    if (!isHashed(u.password)) {
        db.prepare('UPDATE admin_users SET password = ? WHERE id = ?').run(hashPassword(u.password), u.id);
        console.log(`🔐 Migrated password to bcrypt for user: ${u.id}`);
    }
});

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
app.post('/api/validate', (req, res) => {
    const { serial, deviceId } = req.body;
    if (!serial) return res.status(400).json({ valid: false, error: 'مفتاح الترخيص مطلوب' });

    // ── Master Serial: owner can access any client ──
    if (serial === MASTER_SERIAL) {
        const clients = db.prepare('SELECT id, name, company, licenseKey, plan, status FROM clients ORDER BY company').all();
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
    const license = db.prepare('SELECT * FROM licenses WHERE licenseKey = ?').get(serial);
    if (!license) return res.json({ valid: false, error: 'مفتاح غير صالح' });
    if (license.status !== 'active') return res.json({ valid: false, error: 'الترخيص موقوف' });

    // Check expiry using SERVER TIME
    if (license.endDate && new Date(license.endDate) < new Date()) {
        db.prepare('UPDATE licenses SET status = ? WHERE id = ?').run('expired', license.id);
        db.prepare('UPDATE clients SET status = ? WHERE id = ?').run('expired', license.clientId);
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
        db.prepare('UPDATE licenses SET deviceId = ?, lockedAt = ? WHERE id = ?')
            .run(deviceId, new Date().toISOString(), license.id);
        console.log(`🔒 License ${serial} locked to device: ${deviceId}`);
    }

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(license.clientId);

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
});

// ═══════════════════════════════════════════════════
//  PUBLIC API — Heartbeat (every 5 minutes)
// ═══════════════════════════════════════════════════
app.post('/api/heartbeat', (req, res) => {
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
    const license = db.prepare('SELECT * FROM licenses WHERE licenseKey = ?').get(serial);
    if (!license) return res.json({ valid: false, error: 'ترخيص غير موجود', requireReauth: true });
    if (license.status !== 'active') return res.json({ valid: false, error: 'الترخيص موقوف', expired: true });

    // Re-check expiry using SERVER TIME
    if (license.endDate && new Date(license.endDate) < new Date()) {
        db.prepare('UPDATE licenses SET status = ? WHERE id = ?').run('expired', license.id);
        db.prepare('UPDATE clients SET status = ? WHERE id = ?').run('expired', license.clientId);
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
        const existingDevice = db.prepare('SELECT id FROM devices WHERE deviceId = ?').get(deviceId);
        if (existingDevice) {
            db.prepare('UPDATE devices SET lastSeen = ?, status = ? WHERE id = ?')
                .run(new Date().toISOString(), 'online', existingDevice.id);
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
        token: newToken, // Refresh token
    });
});

// ═══════════════════════════════════════════════════
//  ADMIN API — Requires Master Key
// ═══════════════════════════════════════════════════

// ── Admin Auth (bcrypt) ──
app.post('/api/admin/login', requireMasterKey, (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'بيانات خاطئة' });
    if (!comparePassword(password, user.password)) return res.status(401).json({ error: 'بيانات خاطئة' });
    if (user.role !== 'super_admin') return res.status(403).json({ error: 'لوحة الأدمن متاحة فقط لمالك البرنامج' });

    // Generate admin JWT
    const token = generateJWT({ userId: user.id, role: user.role, isAdmin: true });
    res.json({
        user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email, phone: user.phone },
        token: token,
    });
});

// ── Dashboard ──
app.get('/api/admin/dashboard', requireMasterKey, (req, res) => {
    const totalClients = db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
    const activeClients = db.prepare("SELECT COUNT(*) as c FROM clients WHERE status = 'active'").get().c;
    const expiredClients = db.prepare("SELECT COUNT(*) as c FROM clients WHERE status = 'expired'").get().c;
    const totalDevices = db.prepare('SELECT COUNT(*) as c FROM devices').get().c;
    const onlineDevices = db.prepare("SELECT COUNT(*) as c FROM devices WHERE status = 'online'").get().c;
    const activeLicenses = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE status = 'active'").get().c;
    const recentClients = db.prepare('SELECT * FROM clients ORDER BY createdAt DESC LIMIT 5').all();
    const recentDevices = db.prepare('SELECT d.*, c.company FROM devices d LEFT JOIN clients c ON d.clientId = c.id ORDER BY d.lastSeen DESC LIMIT 5').all();

    res.json({ totalClients, activeClients, expiredClients, totalDevices, onlineDevices, activeLicenses, recentClients, recentDevices });
});

// ── Clients CRUD ──
app.get('/api/admin/clients', requireMasterKey, (req, res) => {
    const clients = db.prepare('SELECT * FROM clients ORDER BY createdAt DESC').all();
    clients.forEach(c => { try { c.features = JSON.parse(c.features); } catch { c.features = {}; } });
    res.json(clients);
});

app.get('/api/admin/clients/:id', requireMasterKey, (req, res) => {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'العميل غير موجود' });
    try { client.features = JSON.parse(client.features); } catch { client.features = {}; }
    const devices = db.prepare('SELECT * FROM devices WHERE clientId = ?').all(req.params.id);
    const licenses = db.prepare('SELECT * FROM licenses WHERE clientId = ?').all(req.params.id);
    res.json({ client, devices, licenses });
});

app.post('/api/admin/clients', requireMasterKey, (req, res) => {
    const { name, company, phone, email, maxUsers, maxWarehouses, features, plan, startDate, endDate, status } = req.body;
    if (!name || !company) return res.status(400).json({ error: 'الاسم والشركة مطلوبين' });

    const id = 'c_' + uuidv4().slice(0, 8);
    const licenseKey = genLicenseKey(plan || 'basic');
    const sDate = startDate || new Date().toISOString();
    const eDate = endDate || (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString(); })();

    db.prepare(`INSERT INTO clients (id, name, company, phone, email, maxUsers, maxWarehouses, features, plan, startDate, endDate, status, licenseKey)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, name, company, phone || '', email || '', maxUsers || 5, maxWarehouses || 1,
            JSON.stringify(features || { sales: true, inventory: true, reports: true }),
            plan || 'basic', sDate, eDate, status || 'active', licenseKey);

    // Auto-create license
    const licId = 'l_' + uuidv4().slice(0, 8);
    db.prepare('INSERT INTO licenses (id, clientId, licenseKey, plan, startDate, endDate, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(licId, id, licenseKey, plan || 'basic', sDate, eDate, 'active');

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    try { client.features = JSON.parse(client.features); } catch { client.features = {}; }
    res.json(client);
});

app.put('/api/admin/clients/:id', requireMasterKey, (req, res) => {
    const { name, company, phone, email, maxUsers, maxWarehouses, features, plan, startDate, endDate, status } = req.body;
    const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'العميل غير موجود' });

    db.prepare(`UPDATE clients SET name=?, company=?, phone=?, email=?, maxUsers=?, maxWarehouses=?, features=?, plan=?, startDate=?, endDate=?, status=? WHERE id=?`)
        .run(name || existing.name, company || existing.company, phone ?? existing.phone, email ?? existing.email,
            maxUsers || existing.maxUsers, maxWarehouses || existing.maxWarehouses,
            JSON.stringify(features || JSON.parse(existing.features || '{}')),
            plan || existing.plan, startDate || existing.startDate, endDate || existing.endDate,
            status || existing.status, req.params.id);

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    try { client.features = JSON.parse(client.features); } catch { client.features = {}; }
    res.json(client);
});

app.delete('/api/admin/clients/:id', requireMasterKey, (req, res) => {
    db.prepare('DELETE FROM devices WHERE clientId = ?').run(req.params.id);
    db.prepare('DELETE FROM licenses WHERE clientId = ?').run(req.params.id);
    db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// ── Licenses CRUD ──
app.get('/api/admin/licenses', requireMasterKey, (req, res) => {
    const licenses = db.prepare('SELECT l.*, c.company, c.name as clientName FROM licenses l LEFT JOIN clients c ON l.clientId = c.id ORDER BY l.createdAt DESC').all();
    res.json(licenses);
});

app.post('/api/admin/licenses', requireMasterKey, (req, res) => {
    const { clientId, plan, months } = req.body;
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!client) return res.status(404).json({ error: 'العميل غير موجود' });

    const id = 'l_' + uuidv4().slice(0, 8);
    const licenseKey = genLicenseKey(plan || 'basic');
    const start = new Date().toISOString();
    const end = new Date(); end.setMonth(end.getMonth() + (months || 12));

    db.prepare('INSERT INTO licenses (id, clientId, licenseKey, plan, startDate, endDate, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, clientId, licenseKey, plan || 'basic', start, end.toISOString(), 'active');

    // Update client
    db.prepare('UPDATE clients SET licenseKey=?, plan=?, startDate=?, endDate=?, status=? WHERE id=?')
        .run(licenseKey, plan || 'basic', start, end.toISOString(), 'active', clientId);

    res.json({ id, clientId, licenseKey, plan: plan || 'basic', startDate: start, endDate: end.toISOString(), status: 'active' });
});

app.put('/api/admin/licenses/:id/renew', requireMasterKey, (req, res) => {
    const { months } = req.body;
    const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id);
    if (!license) return res.status(404).json({ error: 'الترخيص غير موجود' });

    const end = new Date(); end.setMonth(end.getMonth() + (months || 12));
    db.prepare('UPDATE licenses SET endDate = ?, status = ? WHERE id = ?').run(end.toISOString(), 'active', req.params.id);
    db.prepare('UPDATE clients SET endDate = ?, status = ? WHERE id = ?').run(end.toISOString(), 'active', license.clientId);

    res.json({ success: true, endDate: end.toISOString() });
});

app.put('/api/admin/licenses/:id/revoke', requireMasterKey, (req, res) => {
    const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id);
    if (!license) return res.status(404).json({ error: 'الترخيص غير موجود' });

    db.prepare('UPDATE licenses SET status = ? WHERE id = ?').run('revoked', req.params.id);
    db.prepare('UPDATE clients SET status = ? WHERE id = ?').run('suspended', license.clientId);

    res.json({ success: true });
});

// ── Device Unlock (Admin) ──
app.put('/api/admin/licenses/:id/unlock-device', requireMasterKey, (req, res) => {
    const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id);
    if (!license) return res.status(404).json({ error: 'الترخيص غير موجود' });

    db.prepare('UPDATE licenses SET deviceId = NULL, deviceFingerprint = NULL, lockedAt = NULL WHERE id = ?')
        .run(req.params.id);

    console.log(`🔓 Device unlocked for license: ${license.licenseKey}`);
    res.json({ success: true, message: 'تم فك قفل الجهاز بنجاح' });
});

// ── Get device lock info for a license ──
app.get('/api/admin/licenses/:id/device-info', requireMasterKey, (req, res) => {
    const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id);
    if (!license) return res.status(404).json({ error: 'الترخيص غير موجود' });

    res.json({
        deviceId: license.deviceId,
        deviceFingerprint: license.deviceFingerprint,
        lockedAt: license.lockedAt,
        isLocked: !!license.deviceId,
    });
});

// ── Devices CRUD ──
app.get('/api/admin/devices', requireMasterKey, (req, res) => {
    const devices = db.prepare('SELECT d.*, c.company FROM devices d LEFT JOIN clients c ON d.clientId = c.id ORDER BY d.lastSeen DESC').all();
    res.json(devices);
});

app.post('/api/admin/devices', requireMasterKey, (req, res) => {
    const { deviceName, deviceType, clientId, status } = req.body;
    if (!deviceName) return res.status(400).json({ error: 'اسم الجهاز مطلوب' });
    const id = 'd_' + uuidv4().slice(0, 8);
    db.prepare('INSERT INTO devices (id, clientId, deviceName, deviceType, lastSeen, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, clientId, deviceName, deviceType || 'desktop', new Date().toISOString(), status || 'offline');
    res.json({ id, clientId, deviceName, deviceType, status });
});

app.put('/api/admin/devices/:id', requireMasterKey, (req, res) => {
    const { deviceName, deviceType, clientId, status } = req.body;
    db.prepare('UPDATE devices SET deviceName=?, deviceType=?, clientId=?, status=?, lastSeen=? WHERE id=?')
        .run(deviceName, deviceType, clientId, status, new Date().toISOString(), req.params.id);
    res.json({ success: true });
});

app.delete('/api/admin/devices/:id', requireMasterKey, (req, res) => {
    db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// ── Admin Users ──
app.get('/api/admin/users', requireMasterKey, (req, res) => {
    const users = db.prepare('SELECT id, username, name, role, email, phone, createdAt FROM admin_users').all();
    res.json(users);
});

app.post('/api/admin/users', requireMasterKey, (req, res) => {
    const { username, password, name, role, email, phone } = req.body;
    if (!username || !password || !name) return res.status(400).json({ error: 'بيانات ناقصة' });
    const id = 'au_' + uuidv4().slice(0, 8);
    try {
        db.prepare('INSERT INTO admin_users (id, username, password, name, role, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(id, username, hashPassword(password), name, role || 'admin', email || '', phone || '');
        res.json({ id, username, name, role });
    } catch (e) {
        res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
});

app.put('/api/admin/users/:id', requireMasterKey, (req, res) => {
    const { name, password, role, email, phone } = req.body;
    const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const newPassword = password ? hashPassword(password) : user.password;
    db.prepare('UPDATE admin_users SET name=?, password=?, role=?, email=?, phone=? WHERE id=?')
        .run(name || user.name, newPassword, role || user.role, email ?? user.email, phone ?? user.phone, req.params.id);
    res.json({ success: true });
});

app.delete('/api/admin/users/:id', requireMasterKey, (req, res) => {
    db.prepare('DELETE FROM admin_users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════════════
app.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('  🚀 StockPro License Server (Secure)');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  📡 Server:     http://localhost:${PORT}`);
    console.log(`  🛡️  Admin:      http://localhost:${PORT}/admin.html`);
    console.log(`  📱 Client:     http://localhost:${PORT}/stockpro.html`);
    console.log(`  🔑 Master Key: ${MASTER_KEY}`);
    console.log(`  🔐 Master Serial: ${MASTER_SERIAL}`);
    console.log(`  🔒 Security:   JWT + bcrypt + Device Lock`);
    console.log(`  ⏰ Grace Period: ${GRACE_PERIOD_MS / 60000} minutes`);
    console.log('═══════════════════════════════════════════════════');
    console.log('');
});
