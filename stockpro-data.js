// ═══════════════════════════════════════════════════
//  StockPro — Data Layer (Secure Edition)
//  Server-side validation + JWT + Heartbeat + Anti-tampering
// ═══════════════════════════════════════════════════

// ── Server Configuration ─────────────────────────
const SP_SERVER_URL = (function () {
    // Auto-detect server URL from current page origin
    if (location.protocol === 'file:') return 'http://localhost:3000';
    return location.origin;
})();

// ── Encryption Layer ─────────────────────────────
const _SP_EK = 'StockPr0_2026!sEcReT_kEy#x9Zq';

function spEncrypt(data, key) {
    try {
        const json = typeof data === 'string' ? data : JSON.stringify(data);
        const k = key || _SP_EK;
        let enc = '';
        for (let i = 0; i < json.length; i++) {
            enc += String.fromCharCode(json.charCodeAt(i) ^ k.charCodeAt(i % k.length));
        }
        return btoa(unescape(encodeURIComponent(enc)));
    } catch (e) { return ''; }
}

function spDecrypt(encoded, key) {
    try {
        const k = key || _SP_EK;
        const enc = decodeURIComponent(escape(atob(encoded)));
        let dec = '';
        for (let i = 0; i < enc.length; i++) {
            dec += String.fromCharCode(enc.charCodeAt(i) ^ k.charCodeAt(i % k.length));
        }
        return JSON.parse(dec);
    } catch (e) { return null; }
}

function spSetEncrypted(storageKey, data) {
    localStorage.setItem(storageKey, spEncrypt(data));
}

function spGetEncrypted(storageKey) {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const dec = spDecrypt(raw);
    if (dec !== null) return dec;
    try { const plain = JSON.parse(raw); spSetEncrypted(storageKey, plain); return plain; } catch (e) { return null; }
}

// ── Serial / License Management ──────────────────
const SP_SERIAL_KEY = 'sp_active_serial';
const SP_SERIAL_CLIENT = 'sp_active_client';
const SP_DEVICE_ID_KEY = 'sp_device_id';
const SP_JWT_KEY = 'sp_jwt_token';
const SP_HWM_KEY = 'sp_hwm'; // High-water mark (last known server time)
const SP_LAST_HB_KEY = 'sp_last_heartbeat';
const SP_GRACE_KEY = 'sp_grace_period_ms';

function getActiveSerial() {
    return localStorage.getItem(SP_SERIAL_KEY) || '';
}

// ── Master Serial ──
const MASTER_SERIAL = 'SP-MSTR-OWNR-2024-SPRO';

function getActiveClient() {
    try { return JSON.parse(localStorage.getItem(SP_SERIAL_CLIENT)) || null; }
    catch (e) { return null; }
}

function setActiveSerial(serial, clientInfo) {
    localStorage.setItem(SP_SERIAL_KEY, serial);
    if (clientInfo) localStorage.setItem(SP_SERIAL_CLIENT, JSON.stringify(clientInfo));
}

function clearActiveSerial() {
    localStorage.removeItem(SP_SERIAL_KEY);
    localStorage.removeItem(SP_SERIAL_CLIENT);
    localStorage.removeItem(SP_JWT_KEY);
    localStorage.removeItem(SP_HWM_KEY);
    localStorage.removeItem(SP_LAST_HB_KEY);
}

// ── Device ID (unique per browser) ───────────────
function getDeviceId() {
    let id = localStorage.getItem(SP_DEVICE_ID_KEY);
    if (!id) {
        id = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 12);
        localStorage.setItem(SP_DEVICE_ID_KEY, id);
    }
    return id;
}

// ═══════════════════════════════════════════════════
//  SERVER-SIDE LICENSE VALIDATION
// ═══════════════════════════════════════════════════

async function validateSerial(serial) {
    const deviceId = getDeviceId();

    try {
        // ── Try server validation first ──
        const response = await fetch(`${SP_SERVER_URL}/api/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serial, deviceId }),
        });
        const result = await response.json();

        if (result.valid) {
            // Save JWT token from server
            if (result.token) {
                localStorage.setItem(SP_JWT_KEY, result.token);
            }
            // Save server time as High-Water Mark
            if (result.serverTime) {
                localStorage.setItem(SP_HWM_KEY, new Date(result.serverTime).getTime().toString());
            }
            // Save grace period
            if (result.gracePeriodMs) {
                localStorage.setItem(SP_GRACE_KEY, result.gracePeriodMs.toString());
            }
            // Mark last heartbeat as now
            localStorage.setItem(SP_LAST_HB_KEY, Date.now().toString());
            // Cache license data
            localStorage.setItem('sp_cached_license', JSON.stringify({
                serial, data: result, ts: Date.now(), deviceId
            }));
            console.log('🔐 [Security] License validated via server');
        }

        return result;
    } catch (err) {
        console.warn('⚠️ [Security] Server unreachable, using offline fallback:', err.message);
        // ── Offline fallback: use cached data if within grace period ──
        return _offlineFallbackValidation(serial, deviceId);
    }
}

// ── Offline fallback (used when server is unreachable) ──
function _offlineFallbackValidation(serial, deviceId) {
    const cached = localStorage.getItem('sp_cached_license');
    if (!cached) return { valid: false, error: 'لا يمكن التحقق — لا يوجد اتصال بالسيرفر' };

    try {
        const { data } = JSON.parse(cached);
        if (!data || !data.valid) return { valid: false, error: 'بيانات مخزنة غير صالحة' };

        // Check grace period
        const lastHB = parseInt(localStorage.getItem(SP_LAST_HB_KEY) || '0');
        const gracePeriod = parseInt(localStorage.getItem(SP_GRACE_KEY) || '3600000');
        if (Date.now() - lastHB > gracePeriod) {
            return { valid: false, error: 'انتهت فترة السماح — يرجى الاتصال بالإنترنت' };
        }

        // Check high-water mark (anti-clock tampering)
        const hwm = parseInt(localStorage.getItem(SP_HWM_KEY) || '0');
        if (hwm > 0 && Date.now() < hwm - 300000) {
            return { valid: false, error: 'تم كشف تلاعب بساعة الجهاز' };
        }

        console.log('🔒 [Security] Using offline cached license (within grace period)');
        return data;
    } catch (e) {
        return { valid: false, error: 'خطأ في بيانات الترخيص المخزنة' };
    }
}

// ═══════════════════════════════════════════════════
//  HEARTBEAT SYSTEM (every 5 minutes)
// ═══════════════════════════════════════════════════

function _formatRemaining(ms) {
    if (!ms || ms <= 0) return '0m';
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    let parts = [];
    if (days > 0) parts.push(days + ' days');
    if (hours > 0) parts.push(hours + 'h');
    if (minutes > 0) parts.push(minutes + 'm');
    return parts.join(' ') || '< 1m';
}

let _heartbeatTimer = null;

function startHeartbeat() {
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    // First heartbeat immediately
    _doHeartbeat();
    // Then every 5 minutes
    _heartbeatTimer = setInterval(_doHeartbeat, 5 * 60 * 1000);
    console.log('💓 [Heartbeat] Started (every 5 minutes)');
}

function stopHeartbeat() {
    if (_heartbeatTimer) {
        clearInterval(_heartbeatTimer);
        _heartbeatTimer = null;
    }
}

async function _doHeartbeat() {
    const token = localStorage.getItem(SP_JWT_KEY);
    const deviceId = getDeviceId();

    if (!token) {
        console.warn('💓 [Heartbeat] No token, skipping');
        return;
    }

    try {
        const response = await fetch(`${SP_SERVER_URL}/api/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, deviceId }),
        });
        const data = await response.json();

        if (!data.valid) {
            console.error('💓 [Heartbeat] FAILED:', data.error);
            stopHeartbeat();
            // Dispatch event for UI to handle
            if (data.expired) {
                window.dispatchEvent(new CustomEvent('sp-license-expired', { detail: data }));
            } else if (data.deviceLocked) {
                window.dispatchEvent(new CustomEvent('sp-device-locked', { detail: data }));
            } else if (data.requireReauth) {
                window.dispatchEvent(new CustomEvent('sp-require-reauth', { detail: data }));
            }
            return;
        }

        // Update High-Water Mark
        if (data.serverTime) {
            localStorage.setItem(SP_HWM_KEY, new Date(data.serverTime).getTime().toString());
        }
        // Update last heartbeat time
        localStorage.setItem(SP_LAST_HB_KEY, Date.now().toString());
        // Refresh JWT token
        if (data.token) {
            localStorage.setItem(SP_JWT_KEY, data.token);
        }

        console.log('💓 [Heartbeat] OK | Remaining:', data.remainingMs
            ? _formatRemaining(data.remainingMs)
            : '∞');

    } catch (err) {
        console.warn('💓 [Heartbeat] Server unreachable:', err.message);
        // Check if we're past grace period
        _checkGracePeriod();
    }
}

// ═══════════════════════════════════════════════════
//  GRACE PERIOD & ANTI-TAMPERING CHECKS
// ═══════════════════════════════════════════════════

function _checkGracePeriod() {
    const lastHB = parseInt(localStorage.getItem(SP_LAST_HB_KEY) || '0');
    const gracePeriod = parseInt(localStorage.getItem(SP_GRACE_KEY) || '3600000'); // default 1 hour

    if (lastHB > 0 && Date.now() - lastHB > gracePeriod) {
        console.error('⏰ [Security] Grace period exceeded! Locking app.');
        stopHeartbeat();
        window.dispatchEvent(new CustomEvent('sp-grace-expired', {
            detail: { error: 'فترة السماح انتهت — يرجى الاتصال بالإنترنت' }
        }));
    }
}

function detectClockTampering() {
    const hwm = parseInt(localStorage.getItem(SP_HWM_KEY) || '0');
    // 5 minutes tolerance
    if (hwm > 0 && Date.now() < hwm - 300000) {
        console.error('🚨 [Security] Clock tampering detected!');
        window.dispatchEvent(new CustomEvent('sp-clock-tamper', {
            detail: { error: 'تم كشف تلاعب بساعة الجهاز — يرجى ضبط التاريخ والوقت' }
        }));
        return true;
    }
    return false;
}

// ═══════════════════════════════════════════════════
//  LICENSE EXPIRY CHECK (Server-aware)
// ═══════════════════════════════════════════════════

function checkLicenseExpiry() {
    const serial = getActiveSerial();
    if (!serial || serial === MASTER_SERIAL) return { expired: false };

    // Check clock tampering first
    if (detectClockTampering()) {
        return { expired: true, reason: 'تلاعب بالساعة' };
    }

    // Check grace period
    const lastHB = parseInt(localStorage.getItem(SP_LAST_HB_KEY) || '0');
    const gracePeriod = parseInt(localStorage.getItem(SP_GRACE_KEY) || '3600000');
    if (lastHB > 0 && Date.now() - lastHB > gracePeriod) {
        return { expired: true, reason: 'فترة السماح انتهت — يرجى الاتصال بالإنترنت' };
    }

    // Check cached license data
    const cached = localStorage.getItem('sp_cached_license');
    if (!cached) return { expired: false };

    try {
        const { data } = JSON.parse(cached);
        if (!data || !data.license) return { expired: false };

        const lic = data.license;
        if (lic.endDate && new Date(lic.endDate) < new Date()) {
            return { expired: true, endDate: lic.endDate };
        }

        return { expired: false };
    } catch (e) {
        return { expired: false };
    }
}

// ── Device Lock Check ────────────────────────────
function isDeviceLocked(serial) {
    if (!serial || serial === MASTER_SERIAL) return false;
    // Device lock is now primarily server-side
    // This is a client-side fallback for cached data
    const cached = localStorage.getItem('sp_cached_license');
    if (!cached) return false;
    try {
        const { data } = JSON.parse(cached);
        if (data && data.deviceLocked) return true;
        return false;
    } catch (e) { return false; }
}

// ── Self-Validating License Key Algorithm ──
const SP_SECRET = 'SPRO2024XK';
const SP_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SP_PLAN_FROM_CODE = { B: 'basic', P: 'premium', E: 'enterprise' };

function spHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) & 0x7FFFFFFF;
    return h;
}
function spChecksum(g1, g2, g3) {
    const h = spHash(g1 + g2 + g3 + SP_SECRET);
    let out = '';
    for (let i = 0; i < 4; i++) out += SP_CHARS[(h >> (i * 5)) % SP_CHARS.length];
    return out;
}
function spValidateKey(serial) {
    if (!serial || !serial.startsWith('SP-')) return null;
    const parts = serial.split('-');
    if (parts.length !== 5) return null;
    const [, g1, g2, g3, g4] = parts;
    if (!g1 || !g2 || !g3 || !g4) return null;
    if (g1.length !== 4 || g2.length !== 4 || g3.length !== 4 || g4.length !== 4) return null;
    const expected = spChecksum(g1, g2, g3);
    if (g4 !== expected) return null;
    return SP_PLAN_FROM_CODE[g3[0]] || 'basic';
}

// ── Dynamic DB Key (per serial) ──────────────────
function getDBKey() {
    // Master mode: use the selected client's license key
    const masterClientKey = localStorage.getItem('sp_master_client_key');
    if (masterClientKey && localStorage.getItem('sp_is_master') === '1') {
        const hash = masterClientKey.replace(/[^A-Z0-9]/g, '').slice(-8);
        return 'spdb_' + hash;
    }

    const serial = getActiveSerial();
    if (serial) {
        // Create a short hash from serial for the key
        const hash = serial.replace(/[^A-Z0-9]/g, '').slice(-8);
        return 'spdb_' + hash;
    }
    return 'stockpro_db'; // fallback for legacy data
}

const DB_VERSION = 1;

// ── Default Database Structure ───────────────────
function defaultDB() {
    return {
        version: DB_VERSION,
        settings: {
            companyName: '',
            phone: '',
            address: '',
            currency: 'EGP',
            currencySymbol: 'ج.م',
            taxRate: 14,
            theme: 'dark',
            lang: 'ar',
            receiptFooter: 'شكراً لتعاملكم معنا',
            pin: '',
            onboarded: false,
            invoiceCounter: 1000,
            purchaseCounter: 5000,
            roles: {
                admin: { name: 'مدير', permissions: ['all'] },
                cashier: { name: 'كاشير', permissions: ['pos', 'sales', 'customers'] },
                viewer: { name: 'مشاهد', permissions: ['reports', 'inventory_view'] }
            },
            activeRole: 'admin'
        },
        warehouses: [],
        categories: [],
        products: [],
        customers: [],
        suppliers: [],
        sales: [],
        purchases: [],
        returns: [],
        stockMovements: [],
        expenses: [],
        users: []
    };
}

// ── localStorage Helpers ─────────────────────────
function loadDB() {
    try {
        const raw = localStorage.getItem(getDBKey());
        if (!raw) return defaultDB();
        const db = JSON.parse(raw);
        if (db.version !== DB_VERSION) {
            return migrateDB(db);
        }
        return db;
    } catch (e) {
        console.error('DB load error:', e);
        return defaultDB();
    }
}

function saveDB(db) {
    try {
        localStorage.setItem(getDBKey(), JSON.stringify(db));
    } catch (e) {
        console.error('DB save error:', e);
    }
}

function migrateDB(db) {
    // Future migration logic
    db.version = DB_VERSION;
    saveDB(db);
    return db;
}

function resetDB() {
    localStorage.removeItem(getDBKey());
    return defaultDB();
}

// ── CRUD Helpers ─────────────────────────────────
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function addRecord(collection, record) {
    const db = loadDB();
    record.id = generateId();
    record.createdAt = new Date().toISOString();
    record.updatedAt = new Date().toISOString();
    db[collection].push(record);
    saveDB(db);
    return record;
}

function updateRecord(collection, id, updates) {
    const db = loadDB();
    const idx = db[collection].findIndex(r => r.id === id);
    if (idx === -1) return null;
    updates.updatedAt = new Date().toISOString();
    db[collection][idx] = { ...db[collection][idx], ...updates };
    saveDB(db);
    return db[collection][idx];
}

function deleteRecord(collection, id) {
    const db = loadDB();
    db[collection] = db[collection].filter(r => r.id !== id);
    saveDB(db);
}

function getRecord(collection, id) {
    const db = loadDB();
    return db[collection].find(r => r.id === id) || null;
}

function getAllRecords(collection) {
    const db = loadDB();
    return db[collection] || [];
}

function getSettings() {
    return loadDB().settings;
}

function updateSettings(updates) {
    const db = loadDB();
    db.settings = { ...db.settings, ...updates };
    saveDB(db);
    return db.settings;
}

function getNextInvoiceNumber() {
    const db = loadDB();
    const num = db.settings.invoiceCounter + 1;
    db.settings.invoiceCounter = num;
    saveDB(db);
    return 'INV-' + num;
}

function getNextPurchaseNumber() {
    const db = loadDB();
    const num = db.settings.purchaseCounter + 1;
    db.settings.purchaseCounter = num;
    saveDB(db);
    return 'PO-' + num;
}

// ── Stock Helpers ────────────────────────────────
function adjustStock(productId, warehouseId, qty, type, refId) {
    const db = loadDB();
    const product = db.products.find(p => p.id === productId);
    if (!product) return;

    // Update product stock
    if (!product.stock) product.stock = {};
    if (!product.stock[warehouseId]) product.stock[warehouseId] = 0;
    product.stock[warehouseId] += qty;
    product.updatedAt = new Date().toISOString();

    // Log movement
    db.stockMovements.push({
        id: generateId(),
        productId,
        warehouseId,
        qty,
        type, // 'in', 'out', 'transfer', 'adjustment'
        refId,
        date: new Date().toISOString()
    });

    saveDB(db);
}

function getTotalStock(productId) {
    const db = loadDB();
    const product = db.products.find(p => p.id === productId);
    if (!product || !product.stock) return 0;
    return Object.values(product.stock).reduce((sum, v) => sum + v, 0);
}

function getLowStockProducts() {
    const db = loadDB();
    return db.products.filter(p => {
        const total = p.stock ? Object.values(p.stock).reduce((s, v) => s + v, 0) : 0;
        return p.minStock && total <= p.minStock;
    });
}

// ── Report Helpers ───────────────────────────────
function getSalesByPeriod(period) {
    const db = loadDB();
    const now = new Date();
    let start;

    switch (period) {
        case 'today':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case 'week':
            start = new Date(now.getTime() - 7 * 86400000);
            break;
        case 'month':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'year':
            start = new Date(now.getFullYear(), 0, 1);
            break;
        default:
            start = new Date(0);
    }

    return db.sales.filter(s => new Date(s.date) >= start);
}

function getProfitByProduct() {
    const db = loadDB();
    const profits = {};
    db.sales.forEach(sale => {
        (sale.items || []).forEach(item => {
            if (!profits[item.productId]) {
                const p = db.products.find(pr => pr.id === item.productId);
                profits[item.productId] = {
                    name: p ? p.name : 'محذوف',
                    revenue: 0,
                    cost: 0,
                    qty: 0
                };
            }
            profits[item.productId].revenue += item.price * item.qty;
            profits[item.productId].cost += (item.costPrice || 0) * item.qty;
            profits[item.productId].qty += item.qty;
        });
    });

    return Object.entries(profits).map(([id, data]) => ({
        productId: id,
        ...data,
        profit: data.revenue - data.cost
    })).sort((a, b) => b.profit - a.profit);
}

function getTopCustomers(limit = 10) {
    const db = loadDB();
    const spending = {};
    db.sales.forEach(sale => {
        if (sale.customerId) {
            if (!spending[sale.customerId]) spending[sale.customerId] = 0;
            spending[sale.customerId] += sale.total || 0;
        }
    });

    return Object.entries(spending)
        .map(([id, total]) => {
            const c = db.customers.find(cu => cu.id === id);
            return { customerId: id, name: c ? c.name : 'محذوف', total };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, limit);
}

function getDailySales(days = 30) {
    const db = loadDB();
    const result = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const dayStr = d.toISOString().split('T')[0];
        const daySales = db.sales.filter(s => s.date && s.date.startsWith(dayStr));
        result.push({
            date: dayStr,
            total: daySales.reduce((sum, s) => sum + (s.total || 0), 0),
            count: daySales.length
        });
    }
    return result;
}

// ── Export Helpers ────────────────────────────────
function exportToCSV(data, filename) {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csv = [
        headers.join(','),
        ...data.map(row => headers.map(h => {
            let val = row[h];
            if (typeof val === 'string') val = '"' + val.replace(/"/g, '""') + '"';
            if (typeof val === 'object') val = '"' + JSON.stringify(val).replace(/"/g, '""') + '"';
            return val;
        }).join(','))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function exportDBBackup() {
    const db = loadDB();
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stockpro_backup_' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importDBBackup(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const db = JSON.parse(e.target.result);
                if (db.version) {
                    saveDB(db);
                    resolve(true);
                } else {
                    reject('ملف غير صالح');
                }
            } catch (err) {
                reject('خطأ في قراءة الملف');
            }
        };
        reader.readAsText(file);
    });
}

// ── WhatsApp Invoice Share ───────────────────────
function shareInvoiceWhatsApp(sale, phone) {
    const settings = getSettings();
    let text = `*فاتورة ${sale.invoiceNumber}*\n`;
    text += `${settings.companyName}\n`;
    text += `التاريخ: ${new Date(sale.date).toLocaleDateString('ar-EG')}\n`;
    text += `───────────\n`;
    (sale.items || []).forEach(item => {
        text += `${item.name} × ${item.qty} = ${(item.price * item.qty).toFixed(2)} ${settings.currencySymbol}\n`;
    });
    text += `───────────\n`;
    if (sale.discount) text += `خصم: ${sale.discount.toFixed(2)} ${settings.currencySymbol}\n`;
    if (sale.tax) text += `ضريبة: ${sale.tax.toFixed(2)} ${settings.currencySymbol}\n`;
    text += `*الإجمالي: ${sale.total.toFixed(2)} ${settings.currencySymbol}*\n`;
    text += `\n${settings.receiptFooter}`;

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
}

// ── Seed Sample Data ─────────────────────────────
function seedSampleData() {
    const db = loadDB();

    // Warehouses
    db.warehouses = [
        { id: 'wh1', name: 'المخزن الرئيسي', location: 'القاهرة', createdAt: new Date().toISOString() },
        { id: 'wh2', name: 'مخزن الفرع', location: 'الجيزة', createdAt: new Date().toISOString() }
    ];

    // Categories
    db.categories = [
        { id: 'cat1', name: 'بقالة', icon: '🛒', color: '#22c55e' },
        { id: 'cat2', name: 'أجهزة كهربائية', icon: '⚡', color: '#3b82f6' },
        { id: 'cat3', name: 'ملابس', icon: '👕', color: '#a855f7' },
        { id: 'cat4', name: 'مستلزمات مكتبية', icon: '📎', color: '#f59e0b' },
        { id: 'cat5', name: 'مواد تنظيف', icon: '🧹', color: '#06b6d4' }
    ];

    // Products
    db.products = [
        { id: 'p1', name: 'أرز بسمتي 1 كجم', code: 'RIC001', barcode: '6221234560001', categoryId: 'cat1', unit: 'كجم', costPrice: 35, retailPrice: 45, wholesalePrice: 40, minStock: 20, stock: { wh1: 150, wh2: 50 }, image: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'p2', name: 'سكر أبيض 1 كجم', code: 'SUG001', barcode: '6221234560002', categoryId: 'cat1', unit: 'كجم', costPrice: 22, retailPrice: 30, wholesalePrice: 26, minStock: 30, stock: { wh1: 200, wh2: 80 }, image: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'p3', name: 'زيت عباد الشمس 1 لتر', code: 'OIL001', barcode: '6221234560003', categoryId: 'cat1', unit: 'لتر', costPrice: 55, retailPrice: 70, wholesalePrice: 62, minStock: 15, stock: { wh1: 100, wh2: 30 }, image: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'p4', name: 'شاي أحمر 250 جم', code: 'TEA001', barcode: '6221234560004', categoryId: 'cat1', unit: 'علبة', costPrice: 18, retailPrice: 25, wholesalePrice: 21, minStock: 25, stock: { wh1: 300, wh2: 100 }, image: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'p5', name: 'خلاط كهربائي', code: 'BLN001', barcode: '6221234560005', categoryId: 'cat2', unit: 'قطعة', costPrice: 450, retailPrice: 650, wholesalePrice: 550, minStock: 5, stock: { wh1: 25, wh2: 10 }, image: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'p6', name: 'مكواة بخار', code: 'IRN001', barcode: '6221234560006', categoryId: 'cat2', unit: 'قطعة', costPrice: 380, retailPrice: 520, wholesalePrice: 460, minStock: 3, stock: { wh1: 15, wh2: 8 }, image: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'p7', name: 'تيشيرت قطن', code: 'TSH001', barcode: '6221234560007', categoryId: 'cat3', unit: 'قطعة', costPrice: 80, retailPrice: 130, wholesalePrice: 100, minStock: 10, stock: { wh1: 60, wh2: 40 }, image: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'p8', name: 'بنطلون جينز', code: 'JNS001', barcode: '6221234560008', categoryId: 'cat3', unit: 'قطعة', costPrice: 180, retailPrice: 280, wholesalePrice: 230, minStock: 8, stock: { wh1: 40, wh2: 20 }, image: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'p9', name: 'أقلام حبر (عبوة 12)', code: 'PEN001', barcode: '6221234560009', categoryId: 'cat4', unit: 'عبوة', costPrice: 15, retailPrice: 25, wholesalePrice: 19, minStock: 20, stock: { wh1: 100, wh2: 50 }, image: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'p10', name: 'ورق A4 (رزمة 500)', code: 'PAP001', barcode: '6221234560010', categoryId: 'cat4', unit: 'رزمة', costPrice: 110, retailPrice: 150, wholesalePrice: 130, minStock: 10, stock: { wh1: 80, wh2: 30 }, image: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'p11', name: 'صابون سائل 1 لتر', code: 'SOP001', barcode: '6221234560011', categoryId: 'cat5', unit: 'زجاجة', costPrice: 20, retailPrice: 32, wholesalePrice: 26, minStock: 15, stock: { wh1: 120, wh2: 60 }, image: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'p12', name: 'معطر جو', code: 'AIR001', barcode: '6221234560012', categoryId: 'cat5', unit: 'علبة', costPrice: 35, retailPrice: 50, wholesalePrice: 42, minStock: 10, stock: { wh1: 80, wh2: 25 }, image: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    ];

    // Customers
    db.customers = [
        { id: 'c1', name: 'أحمد محمود', phone: '01012345678', email: 'ahmed@email.com', address: 'القاهرة - مدينة نصر', balance: 0, notes: 'عميل جملة', type: 'wholesale', createdAt: new Date().toISOString() },
        { id: 'c2', name: 'محمد علي', phone: '01098765432', email: 'mohamed@email.com', address: 'الجيزة - الهرم', balance: 500, notes: '', type: 'retail', createdAt: new Date().toISOString() },
        { id: 'c3', name: 'سارة حسن', phone: '01155566677', email: 'sara@email.com', address: 'الإسكندرية', balance: 0, notes: 'عميلة مميزة', type: 'wholesale', createdAt: new Date().toISOString() },
        { id: 'c4', name: 'خالد إبراهيم', phone: '01234567890', email: '', address: 'المنصورة', balance: 1200, notes: 'عليه رصيد', type: 'retail', createdAt: new Date().toISOString() },
        { id: 'c5', name: 'فاطمة عبدالله', phone: '01567891234', email: 'fatma@email.com', address: 'طنطا', balance: 0, notes: '', type: 'wholesale', createdAt: new Date().toISOString() }
    ];

    // Suppliers
    db.suppliers = [
        { id: 's1', name: 'شركة الأمل للتوريدات', phone: '0227654321', email: 'info@alamal.com', address: 'القاهرة - العباسية', balance: 0, notes: 'مورد بقالة رئيسي', createdAt: new Date().toISOString() },
        { id: 's2', name: 'مصنع النور للأجهزة', phone: '0236543210', email: 'sales@alnour.com', address: 'العاشر من رمضان', balance: 3000, notes: 'أجهزة كهربائية', createdAt: new Date().toISOString() },
        { id: 's3', name: 'توكيل الياسمين للملابس', phone: '0245678901', email: '', address: 'المحلة الكبرى', balance: 0, notes: '', createdAt: new Date().toISOString() }
    ];

    // Sample sales (last 30 days)
    const now = new Date();
    db.sales = [];
    for (let i = 0; i < 45; i++) {
        const daysAgo = Math.floor(Math.random() * 30);
        const d = new Date(now.getTime() - daysAgo * 86400000);
        const numItems = 1 + Math.floor(Math.random() * 4);
        const items = [];
        const usedProducts = new Set();

        for (let j = 0; j < numItems; j++) {
            const p = db.products[Math.floor(Math.random() * db.products.length)];
            if (usedProducts.has(p.id)) continue;
            usedProducts.add(p.id);
            const qty = 1 + Math.floor(Math.random() * 5);
            items.push({
                productId: p.id,
                name: p.name,
                qty,
                price: p.retailPrice,
                costPrice: p.costPrice
            });
        }

        const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
        const discount = Math.random() > 0.7 ? Math.round(subtotal * 0.05) : 0;
        const taxRate = db.settings.taxRate / 100;
        const tax = Math.round((subtotal - discount) * taxRate);
        const total = subtotal - discount + tax;
        const customer = Math.random() > 0.4 ? db.customers[Math.floor(Math.random() * db.customers.length)] : null;

        db.sales.push({
            id: generateId(),
            invoiceNumber: 'INV-' + (1000 + i + 1),
            date: d.toISOString(),
            items,
            subtotal,
            discount,
            tax,
            total,
            customerId: customer ? customer.id : null,
            customerName: customer ? customer.name : 'عميل نقدي',
            paymentMethod: Math.random() > 0.3 ? 'cash' : 'card',
            warehouseId: Math.random() > 0.5 ? 'wh1' : 'wh2',
            status: 'completed',
            notes: '',
            createdAt: d.toISOString()
        });
    }
    db.settings.invoiceCounter = 1045;

    // Sample purchases
    db.purchases = [
        {
            id: generateId(), poNumber: 'PO-5001', date: new Date(now.getTime() - 15 * 86400000).toISOString(),
            supplierId: 's1', supplierName: 'شركة الأمل للتوريدات',
            items: [
                { productId: 'p1', name: 'أرز بسمتي 1 كجم', qty: 100, price: 35 },
                { productId: 'p2', name: 'سكر أبيض 1 كجم', qty: 150, price: 22 },
                { productId: 'p4', name: 'شاي أحمر 250 جم', qty: 200, price: 18 }
            ],
            subtotal: 10400, tax: 1456, total: 11856, warehouseId: 'wh1',
            status: 'received', notes: '', createdAt: new Date(now.getTime() - 15 * 86400000).toISOString()
        },
        {
            id: generateId(), poNumber: 'PO-5002', date: new Date(now.getTime() - 5 * 86400000).toISOString(),
            supplierId: 's2', supplierName: 'مصنع النور للأجهزة',
            items: [
                { productId: 'p5', name: 'خلاط كهربائي', qty: 10, price: 450 },
                { productId: 'p6', name: 'مكواة بخار', qty: 8, price: 380 }
            ],
            subtotal: 7540, tax: 1055.6, total: 8595.6, warehouseId: 'wh1',
            status: 'received', notes: '', createdAt: new Date(now.getTime() - 5 * 86400000).toISOString()
        }
    ];
    db.settings.purchaseCounter = 5002;

    saveDB(db);
    return db;
}
