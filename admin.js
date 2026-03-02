// ═══════════════════════════════════════════════════
//  StockPro Admin Panel — admin.js (Local Mode)
// ═══════════════════════════════════════════════════

const ADMIN = { screen: 'dashboard', user: null, cache: {} };
const MASTER_KEY_HEADER = 'STOCKPRO-OWNER-2024';

// ── Helpers ──
function $(id) { return document.getElementById(id); }
function fmt(n) { return Number(n || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م'; }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; }

function adminToast(msg, type = 'success') {
    const c = $('admin-toast');
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' error' : '');
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// ── Server API Layer (connects to Render server) ──
const SP_ADMIN_SERVER = (function () {
    if (location.protocol === 'file:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
        return 'https://stockpro-owner.onrender.com';
    }
    return location.origin;
})();

async function api(endpoint, method = 'GET', body = null) {
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'x-master-key': MASTER_KEY_HEADER
        }
    };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    const res = await fetch(SP_ADMIN_SERVER + endpoint, opts);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'خطأ في الاتصال بالسيرفر' }));
        throw new Error(err.error || 'خطأ غير معروف');
    }
    return res.json();
}

// ── Self-Validating License Key (uses spHash, spChecksum, SP_SECRET, SP_CHARS from stockpro-data.js) ──
const SP_PLAN_CODE = { basic: 'B', premium: 'P', enterprise: 'E' };

function genLicenseKey(plan) {
    plan = plan || 'basic';
    const rnd = () => { let s = ''; for (let i = 0; i < 4; i++) s += SP_CHARS[Math.floor(Math.random() * SP_CHARS.length)]; return s; };
    const g1 = rnd();
    const g2 = rnd();
    const planCode = SP_PLAN_CODE[plan] || 'B';
    const g3 = planCode + rnd().slice(1);
    const g4 = spChecksum(g1, g2, g3);
    return 'SP-' + g1 + '-' + g2 + '-' + g3 + '-' + g4;
}

// ── RBAC ──
const ROLES = {
    super_admin: { label: 'Super Admin', icon: '👑', permissions: ['all'] },
    admin: { label: 'Admin', icon: '🔧', permissions: ['manage_clients', 'manage_devices', 'manage_licenses', 'view_all'] },
    support: { label: 'Support', icon: '🎧', permissions: ['view_all'] },
    client_admin: { label: 'Client Admin', icon: '👤', permissions: ['manage_own_users'] },
};

function can(action) {
    if (!ADMIN.user) return false;
    const role = ROLES[ADMIN.user.role];
    if (!role) return false;
    if (role.permissions.includes('all')) return true;
    return role.permissions.includes(action);
}
function canEdit() { return can('all') || can('manage_clients'); }
function canDelete() { return can('all'); }

// ── Auth (Server) ──
async function adminLogin() {
    const username = $('login-user').value.trim();
    const password = $('login-pass').value;
    const masterKey = $('login-master-key').value.trim();

    if (!masterKey || masterKey !== MASTER_KEY_HEADER) {
        adminToast('❌ مفتاح المالك غير صحيح', 'error');
        $('login-master-key').value = '';
        return;
    }

    try {
        const result = await fetch(SP_ADMIN_SERVER + '/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-master-key': MASTER_KEY_HEADER },
            body: JSON.stringify({ username, password })
        });
        const data = await result.json();
        if (!result.ok) {
            adminToast('❌ ' + (data.error || 'بيانات خاطئة'), 'error');
            $('login-pass').value = '';
            return;
        }

        ADMIN.user = data.user;
        ADMIN.token = data.token;

        $('login-screen').style.display = 'none';
        $('admin-app').style.display = 'flex';
        $('admin-user-name').textContent = data.user.name;
        $('admin-user-role').textContent = ROLES[data.user.role]?.label || data.user.role;
        $('sidebar-user-info').textContent = ROLES[data.user.role]?.icon + ' ' + data.user.name;

        const permNav = document.querySelector('[data-nav="permissions"]');
        if (permNav) permNav.style.display = (data.user.role === 'super_admin') ? '' : 'none';

        adminToast('✅ مرحباً ' + data.user.name);
        renderAdminScreen();
    } catch (err) {
        adminToast('❌ تعذر الاتصال بالسيرفر', 'error');
    }
}

function adminLogout() {
    ADMIN.user = null;
    $('admin-app').style.display = 'none';
    $('login-screen').style.display = 'flex';
    $('login-pass').value = '';
}

// ── Navigation ──
function adminNav(screen) {
    if (screen === 'permissions' && (!ADMIN.user || ADMIN.user.role !== 'super_admin')) {
        adminToast('❌ هذا القسم متاح فقط لـ Super Admin', 'error');
        return;
    }
    ADMIN.screen = screen;
    document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === screen));
    const titles = { dashboard: 'لوحة التحكم', clients: 'العملاء', devices: 'الأجهزة', licenses: 'التراخيص', permissions: 'الصلاحيات' };
    $('admin-title').textContent = titles[screen] || '';
    renderAdminScreen();
}

function renderAdminScreen() {
    const c = $('admin-content');
    switch (ADMIN.screen) {
        case 'dashboard': renderAdminDash(c); break;
        case 'clients': renderClients(c); break;
        case 'devices': renderDevices(c); break;
        case 'licenses': renderLicenses(c); break;
        case 'permissions': renderPermissions(c); break;
    }
}

// ── Modal ──
function openAdminModal(html) {
    $('admin-modal-box').innerHTML = html;
    $('admin-modal').classList.add('show');
}
function closeAdminModal() { $('admin-modal').classList.remove('show'); }

function planLabel(p) {
    return { basic: 'أساسي', premium: 'بريميوم', enterprise: 'مؤسسي' }[p] || p || '—';
}

// ═══════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════
async function renderAdminDash(c) {
    c.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">⏳ جاري التحميل...</div>';
    try {
        const d = await api('/api/admin/dashboard');
        c.innerHTML = `
        <div class="admin-stats">
            <div class="admin-stat"><div class="admin-stat-icon purple">👥</div><div><div class="admin-stat-value">${d.totalClients}</div><div class="admin-stat-label">إجمالي العملاء</div></div></div>
            <div class="admin-stat"><div class="admin-stat-icon green">✅</div><div><div class="admin-stat-value">${d.activeClients}</div><div class="admin-stat-label">عملاء نشطين</div></div></div>
            <div class="admin-stat"><div class="admin-stat-icon red">⛔</div><div><div class="admin-stat-value">${d.expiredClients}</div><div class="admin-stat-label">اشتراكات منتهية</div></div></div>
            <div class="admin-stat"><div class="admin-stat-icon blue">💻</div><div><div class="admin-stat-value">${d.onlineDevices} / ${d.totalDevices}</div><div class="admin-stat-label">أجهزة متصلة</div></div></div>
            <div class="admin-stat"><div class="admin-stat-icon yellow">📜</div><div><div class="admin-stat-value">${d.activeLicenses}</div><div class="admin-stat-label">تراخيص فعالة</div></div></div>
        </div>
        <div class="client-detail-grid">
            <div class="client-detail-card"><h4>📋 آخر العملاء</h4>
                ${d.recentClients.map(cl => `<div class="toggle-wrap"><span class="toggle-label">${cl.company} — ${cl.name}</span><span class="badge ${cl.status === 'active' ? 'badge-green' : 'badge-red'}">${cl.status === 'active' ? 'نشط' : 'منتهي'}</span></div>`).join('') || '<div class="empty-state">لا يوجد عملاء</div>'}
            </div>
            <div class="client-detail-card"><h4>💻 آخر الأجهزة</h4>
                ${d.recentDevices.map(dv => `<div class="toggle-wrap"><span class="toggle-label">${dv.deviceName} — ${dv.company || '—'}</span><span class="badge ${dv.status === 'online' ? 'badge-green' : 'badge-red'}">${dv.status === 'online' ? 'متصل' : 'غير متصل'}</span></div>`).join('') || '<div class="empty-state">لا يوجد أجهزة</div>'}
            </div>
        </div>`;
    } catch (e) { c.innerHTML = '<div class="empty-state">❌ تعذر تحميل البيانات — تأكد من تشغيل السيرفر</div>'; }
}

// ═══════════════════════════════════════════════════
//  CLIENTS
// ═══════════════════════════════════════════════════
async function renderClients(c) {
    c.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">⏳ جاري التحميل...</div>';
    try {
        ADMIN.cache.clients = await api('/api/admin/clients');
        c.innerHTML = `
        <div class="admin-toolbar">
            <input class="admin-search" placeholder="🔍 بحث بالاسم أو الشركة..." oninput="filterClients(this.value)">
            ${canEdit() ? '<button class="btn btn-primary" onclick="openClientForm()">➕ إضافة عميل</button>' : ''}
        </div>
        <div class="admin-table-wrap">
            <table class="admin-table"><thead><tr>
                <th>الشركة</th><th>العميل</th><th>الهاتف</th><th>الخطة</th><th>الحالة</th><th>مفتاح الترخيص</th><th>إجراءات</th>
            </tr></thead><tbody id="clients-tbody"></tbody></table>
        </div>`;
        renderClientRows(ADMIN.cache.clients);
    } catch (e) { c.innerHTML = '<div class="empty-state">❌ تعذر تحميل العملاء</div>'; }
}

ADMIN.clientSearch = '';
function filterClients(q) { ADMIN.clientSearch = q; renderClientRows(ADMIN.cache.clients || []); }

function renderClientRows(clients) {
    const q = ADMIN.clientSearch || '';
    let filtered = clients;
    if (q) filtered = filtered.filter(cl => cl.name.includes(q) || cl.company.includes(q) || (cl.phone || '').includes(q));
    const tbody = $('clients-tbody');
    if (!tbody) return;
    tbody.innerHTML = filtered.map(cl => `<tr>
        <td><strong>${cl.company}</strong></td>
        <td>${cl.name}</td>
        <td style="direction:ltr;text-align:right">${cl.phone || '—'}</td>
        <td><span class="badge badge-purple">${planLabel(cl.plan)}</span></td>
        <td><span class="badge ${cl.status === 'active' ? 'badge-green' : 'badge-red'}">${cl.status === 'active' ? 'نشط' : cl.status === 'suspended' ? 'معلق' : 'منتهي'}</span></td>
        <td><code style="font-size:10px;color:var(--accent)">${cl.licenseKey || '—'}</code></td>
        <td><div class="action-row">
            <button class="action-btn" onclick="viewClient('${cl.id}')" title="عرض">👁️</button>
            ${canEdit() ? `<button class="action-btn" onclick="openClientForm('${cl.id}')" title="تعديل">✏️</button>` : ''}
            ${canDelete() ? `<button class="action-btn del" onclick="deleteClient('${cl.id}')" title="حذف">🗑️</button>` : ''}
        </div></td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty-state">لا يوجد عملاء</td></tr>';
}

function openClientForm(id) {
    const cl = id && ADMIN.cache.clients ? ADMIN.cache.clients.find(c => c.id === id) : null;
    const isEdit = !!cl;
    openAdminModal(`
    <div class="modal-header"><div class="modal-title">${isEdit ? '✏️ تعديل عميل' : '➕ عميل جديد'}</div><button class="modal-close" onclick="closeAdminModal()">✕</button></div>
    <div class="modal-body">
        <div class="section-title">بيانات العميل</div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">الاسم</label><input class="form-input" id="cf-name" value="${cl?.name || ''}"></div>
            <div class="form-group"><label class="form-label">الشركة</label><input class="form-input" id="cf-company" value="${cl?.company || ''}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">الهاتف</label><input class="form-input" id="cf-phone" value="${cl?.phone || ''}"></div>
            <div class="form-group"><label class="form-label">البريد</label><input class="form-input" id="cf-email" value="${cl?.email || ''}"></div>
        </div>
        <div class="section-title">الاشتراك</div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">الخطة</label><select class="form-select" id="cf-plan"><option value="basic" ${cl?.plan === 'basic' ? 'selected' : ''}>أساسي</option><option value="premium" ${cl?.plan === 'premium' ? 'selected' : ''}>بريميوم</option><option value="enterprise" ${cl?.plan === 'enterprise' ? 'selected' : ''}>مؤسسي</option></select></div>
            <div class="form-group"><label class="form-label">الحالة</label><select class="form-select" id="cf-status"><option value="active" ${cl?.status === 'active' ? 'selected' : ''}>نشط</option><option value="expired" ${cl?.status === 'expired' ? 'selected' : ''}>منتهي</option><option value="suspended" ${cl?.status === 'suspended' ? 'selected' : ''}>معلق</option></select></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">بداية الاشتراك</label><input type="date" class="form-input" id="cf-start" value="${cl?.startDate?.split('T')[0] || new Date().toISOString().split('T')[0]}"></div>
            <div class="form-group"><label class="form-label">نهاية الاشتراك</label><input type="date" class="form-input" id="cf-end" value="${cl?.endDate?.split('T')[0] || ''}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">عدد المستخدمين</label><input type="number" class="form-input" id="cf-users" value="${cl?.maxUsers || 5}" min="1"></div>
            <div class="form-group"><label class="form-label">عدد المخازن</label><input type="number" class="form-input" id="cf-wh" value="${cl?.maxWarehouses || 1}" min="1"></div>
        </div>
    </div>
    <div class="modal-footer">
        <button class="btn btn-primary" onclick="saveClient('${id || ''}')">${isEdit ? '💾 حفظ التعديلات' : '➕ إضافة'}</button>
        <button class="btn btn-ghost" onclick="closeAdminModal()">إلغاء</button>
    </div>`);
}

async function saveClient(id) {
    const data = {
        name: $('cf-name').value.trim(),
        company: $('cf-company').value.trim(),
        phone: $('cf-phone').value.trim(),
        email: $('cf-email').value.trim(),
        plan: $('cf-plan').value,
        status: $('cf-status').value,
        startDate: $('cf-start').value ? new Date($('cf-start').value).toISOString() : new Date().toISOString(),
        endDate: $('cf-end').value ? new Date($('cf-end').value).toISOString() : '',
        maxUsers: parseInt($('cf-users').value) || 5,
        maxWarehouses: parseInt($('cf-wh').value) || 1,
        features: { sales: true, inventory: true, reports: true }
    };
    if (!data.name || !data.company) { adminToast('أدخل الاسم والشركة', 'error'); return; }

    try {
        if (id) {
            await api('/api/admin/clients/' + id, 'PUT', data);
            adminToast('✅ تم تحديث العميل');
        } else {
            const result = await api('/api/admin/clients', 'POST', data);
            // Show serial prominently
            alert('✅ تم إنشاء العميل بنجاح!\n\nالسيريال: ' + result.licenseKey + '\n\nانسخه وأعطيه للعميل');
            adminToast('✅ تم إضافة العميل — المفتاح: ' + result.licenseKey);
        }
        closeAdminModal();
        renderAdminScreen();
    } catch (err) {
        alert('❌ خطأ في إنشاء العميل!\n\nالسبب: ' + err.message + '\n\nالسيرفر: ' + SP_ADMIN_SERVER);
        adminToast('❌ ' + err.message, 'error');
    }
}

async function deleteClient(id) {
    if (!confirm('حذف هذا العميل وجميع بياناته؟')) return;
    try {
        await api('/api/admin/clients/' + id, 'DELETE');
        adminToast('🗑️ تم حذف العميل');
        renderAdminScreen();
    } catch (err) { adminToast('❌ ' + err.message, 'error'); }
}

async function viewClient(id) {
    try {
        const { client: cl, devices, licenses } = await api('/api/admin/clients/' + id);
        const daysLeft = cl.endDate ? Math.ceil((new Date(cl.endDate) - new Date()) / 86400000) : 0;
        const progress = cl.endDate && cl.startDate ?
            Math.max(0, Math.min(100, ((new Date() - new Date(cl.startDate)) / (new Date(cl.endDate) - new Date(cl.startDate))) * 100)) : 0;

        openAdminModal(`
        <div class="modal-header"><div class="modal-title">👤 ${cl.company}</div><button class="modal-close" onclick="closeAdminModal()">✕</button></div>
        <div class="modal-body">
            <div class="client-detail-grid">
                <div class="client-detail-card"><h4>📋 البيانات</h4>
                    <div class="toggle-wrap"><span>الاسم</span><strong>${cl.name}</strong></div>
                    <div class="toggle-wrap"><span>الهاتف</span><strong>${cl.phone}</strong></div>
                    <div class="toggle-wrap"><span>البريد</span><strong>${cl.email || '—'}</strong></div>
                    <div class="toggle-wrap"><span>مفتاح الترخيص</span><strong style="font-family:monospace;font-size:11px">${cl.licenseKey}</strong></div>
                </div>
                <div class="client-detail-card"><h4>⚙️ الحدود</h4>
                    <div class="toggle-wrap"><span>المستخدمين</span><strong>${cl.maxUsers}</strong></div>
                    <div class="toggle-wrap"><span>المخازن</span><strong>${cl.maxWarehouses}</strong></div>
                </div>
            </div>
            <div class="client-detail-card" style="margin-top:16px"><h4>📜 الاشتراك</h4>
                <div class="toggle-wrap"><span>الخطة</span><span class="badge badge-purple">${planLabel(cl.plan)}</span></div>
                <div class="toggle-wrap"><span>البداية</span><strong>${fmtDate(cl.startDate)}</strong></div>
                <div class="toggle-wrap"><span>النهاية</span><strong>${fmtDate(cl.endDate)}</strong></div>
                <div class="toggle-wrap"><span>المتبقي</span><strong style="color:${daysLeft > 30 ? 'var(--green)' : daysLeft > 0 ? 'var(--yellow)' : 'var(--red)'}">${daysLeft > 0 ? daysLeft + ' يوم' : 'منتهي'}</strong></div>
                <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:${progress}%"></div></div>
            </div>
            ${devices.length ? `<div class="client-detail-card" style="margin-top:16px"><h4>💻 الأجهزة (${devices.length})</h4>
                ${devices.map(d => `<div class="toggle-wrap"><span>${d.deviceName} (${d.deviceType})</span><span class="badge ${d.status === 'online' ? 'badge-green' : 'badge-red'}">${d.status === 'online' ? 'متصل' : 'غير متصل'}</span></div>`).join('')}
            </div>` : ''}
        </div>`);
    } catch (err) { adminToast('❌ ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════════════
//  DEVICES
// ═══════════════════════════════════════════════════
async function renderDevices(c) {
    c.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">⏳ جاري التحميل...</div>';
    try {
        ADMIN.cache.devices = await api('/api/admin/devices');
        c.innerHTML = `
        <div class="admin-toolbar">
            <input class="admin-search" placeholder="🔍 بحث..." oninput="filterDevices(this.value)">
            ${canEdit() ? '<button class="btn btn-primary" onclick="openDeviceForm()">➕ إضافة جهاز</button>' : ''}
        </div>
        <div class="admin-table-wrap">
            <table class="admin-table"><thead><tr>
                <th>اسم الجهاز</th><th>النوع</th><th>العميل</th><th>آخر اتصال</th><th>الحالة</th><th>إجراءات</th>
            </tr></thead><tbody id="devices-tbody"></tbody></table>
        </div>`;
        renderDeviceRows(ADMIN.cache.devices);
    } catch (e) { c.innerHTML = '<div class="empty-state">❌ تعذر تحميل الأجهزة</div>'; }
}

ADMIN.deviceSearch = '';
function filterDevices(q) { ADMIN.deviceSearch = q; renderDeviceRows(ADMIN.cache.devices || []); }

function renderDeviceRows(devices) {
    const q = ADMIN.deviceSearch || '';
    let filtered = devices;
    if (q) filtered = filtered.filter(d => d.deviceName.includes(q));
    const tbody = $('devices-tbody');
    if (!tbody) return;
    const typeIcons = { desktop: '🖥️', tablet: '📱', laptop: '💻', mobile: '📲' };
    tbody.innerHTML = filtered.map(d => `<tr>
        <td><strong>${d.deviceName}</strong></td>
        <td>${typeIcons[d.deviceType] || '💻'} ${d.deviceType}</td>
        <td>${d.company || '—'}</td>
        <td>${fmtDate(d.lastSeen)}</td>
        <td><span class="badge ${d.status === 'online' ? 'badge-green' : 'badge-red'}">${d.status === 'online' ? 'متصل' : 'غير متصل'}</span></td>
        <td><div class="action-row">
            ${canDelete() ? `<button class="action-btn del" onclick="deleteDevice('${d.id}')" title="حذف">🗑️</button>` : ''}
        </div></td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty-state">لا يوجد أجهزة</td></tr>';
}

async function deleteDevice(id) {
    if (!confirm('حذف هذا الجهاز؟')) return;
    try {
        await api('/api/admin/devices/' + id, 'DELETE');
        adminToast('🗑️ تم الحذف');
        renderAdminScreen();
    } catch (err) { adminToast('❌ ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════════════
//  LICENSES
// ═══════════════════════════════════════════════════
async function renderLicenses(c) {
    c.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">⏳ جاري التحميل...</div>';
    try {
        ADMIN.cache.licenses = await api('/api/admin/licenses');
        c.innerHTML = `
        <div class="admin-toolbar">
            <input class="admin-search" placeholder="🔍 بحث بمفتاح الترخيص..." oninput="filterLicenses(this.value)">
            ${canEdit() ? '<button class="btn btn-primary" onclick="openLicenseForm()">➕ ترخيص جديد</button>' : ''}
        </div>
        <div class="admin-table-wrap">
            <table class="admin-table"><thead><tr>
                <th>مفتاح الترخيص</th><th>العميل</th><th>الخطة</th><th>البداية</th><th>النهاية</th><th>الحالة</th><th>إجراءات</th>
            </tr></thead><tbody id="licenses-tbody"></tbody></table>
        </div>`;
        renderLicenseRows(ADMIN.cache.licenses);
    } catch (e) { c.innerHTML = '<div class="empty-state">❌ تعذر تحميل التراخيص</div>'; }
}

ADMIN.licenseSearch = '';
function filterLicenses(q) { ADMIN.licenseSearch = q; renderLicenseRows(ADMIN.cache.licenses || []); }

function renderLicenseRows(licenses) {
    const q = ADMIN.licenseSearch || '';
    let filtered = licenses;
    if (q) filtered = filtered.filter(l => (l.licenseKey || '').includes(q.toUpperCase()));
    const tbody = $('licenses-tbody');
    if (!tbody) return;
    tbody.innerHTML = filtered.map(l => `<tr>
        <td><code style="font-size:11px;color:var(--accent)">${l.licenseKey}</code></td>
        <td>${l.company || l.clientName || '—'}</td>
        <td><span class="badge badge-purple">${planLabel(l.plan)}</span></td>
        <td>${fmtDate(l.startDate)}</td>
        <td>${fmtDate(l.endDate)}</td>
        <td><span class="badge ${l.status === 'active' ? 'badge-green' : 'badge-red'}">${l.status === 'active' ? 'فعال' : l.status === 'revoked' ? 'ملغي' : 'منتهي'}</span></td>
        <td><div class="action-row">
            ${canEdit() ? `<button class="action-btn" onclick="renewLicense('${l.id}')" title="تجديد">🔄</button>` : ''}
            ${canDelete() ? `<button class="action-btn del" onclick="revokeLicense('${l.id}')" title="إلغاء">⛔</button>` : ''}
        </div></td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty-state">لا يوجد تراخيص</td></tr>';
}

async function openLicenseForm() {
    try {
        const clients = ADMIN.cache.clients || await api('/api/admin/clients');
        openAdminModal(`
        <div class="modal-header"><div class="modal-title">➕ ترخيص جديد</div><button class="modal-close" onclick="closeAdminModal()">✕</button></div>
        <div class="modal-body">
            <div class="form-group"><label class="form-label">العميل</label><select class="form-select" id="lf-client">${clients.map(cl => `<option value="${cl.id}">${cl.company}</option>`).join('')}</select></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">الخطة</label><select class="form-select" id="lf-plan"><option value="basic">أساسي</option><option value="premium">بريميوم</option><option value="enterprise">مؤسسي</option></select></div>
                <div class="form-group"><label class="form-label">المدة (أيام)</label><input type="number" class="form-input" id="lf-days" value="365" min="1"></div>
            </div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" onclick="saveLicense()">➕ إنشاء</button><button class="btn btn-ghost" onclick="closeAdminModal()">إلغاء</button></div>`);
    } catch (err) { adminToast('❌ ' + err.message, 'error'); }
}

async function saveLicense() {
    try {
        const result = await api('/api/admin/licenses', 'POST', {
            clientId: $('lf-client').value,
            plan: $('lf-plan').value,
            days: parseInt($('lf-days').value) || 365
        });
        adminToast('✅ تم إنشاء الترخيص: ' + result.licenseKey);
        closeAdminModal();
        renderAdminScreen();
    } catch (err) { adminToast('❌ ' + err.message, 'error'); }
}

async function renewLicense(id) {
    const days = parseInt(prompt('مدة التجديد بالأيام:', '365'));
    if (!days || days <= 0) return;
    try {
        await api('/api/admin/licenses/' + id + '/renew', 'PUT', { days });
        adminToast('✅ تم التجديد');
        renderAdminScreen();
    } catch (err) { adminToast('❌ ' + err.message, 'error'); }
}

async function revokeLicense(id) {
    if (!confirm('إلغاء هذا الترخيص؟ العميل لن يستطيع الدخول بعد الآن.')) return;
    try {
        await api('/api/admin/licenses/' + id + '/revoke', 'PUT');
        adminToast('⛔ تم إلغاء الترخيص');
        renderAdminScreen();
    } catch (err) { adminToast('❌ ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════════════
//  PERMISSIONS (RBAC)
// ═══════════════════════════════════════════════════
async function renderPermissions(c) {
    c.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">⏳ جاري التحميل...</div>';
    try {
        const adminUsers = await api('/api/admin/users');

        function roleDesc(key) {
            return { super_admin: 'صلاحيات كاملة', admin: 'إدارة العملاء والأجهزة', support: 'عرض فقط', client_admin: 'إدارة موظفين العميل' }[key] || '';
        }
        function permCheck(role, perm) {
            const r = ROLES[role];
            if (r.permissions.includes('all')) return 'rbac-check';
            if (perm === 'view_all') return r.permissions.includes('view_all') || r.permissions.includes('manage_clients') ? 'rbac-check' : 'rbac-cross';
            if (['delete', 'manage_permissions'].includes(perm)) return r.permissions.includes('all') ? 'rbac-check' : 'rbac-cross';
            return r.permissions.includes(perm) ? 'rbac-check' : 'rbac-cross';
        }
        function permIcon(role, perm) { return permCheck(role, perm) === 'rbac-check' ? '✅' : '❌'; }

        c.innerHTML = `
        <div class="section-title" style="margin-top:0">🔐 الأدوار والصلاحيات</div>
        <div class="rbac-grid">
            ${Object.entries(ROLES).map(([key, role]) => `
            <div class="rbac-card">
                <div class="rbac-role">${role.icon} ${role.label}</div>
                <div class="rbac-desc">${roleDesc(key)}</div>
                <ul class="rbac-perm-list">
                    <li><span class="${permCheck(key, 'manage_clients')}">${permIcon(key, 'manage_clients')}</span> إدارة العملاء</li>
                    <li><span class="${permCheck(key, 'manage_devices')}">${permIcon(key, 'manage_devices')}</span> إدارة الأجهزة</li>
                    <li><span class="${permCheck(key, 'manage_licenses')}">${permIcon(key, 'manage_licenses')}</span> إدارة التراخيص</li>
                    <li><span class="${permCheck(key, 'view_all')}">${permIcon(key, 'view_all')}</span> عرض الكل</li>
                    <li><span class="${permCheck(key, 'delete')}">${permIcon(key, 'delete')}</span> حذف السجلات</li>
                </ul>
            </div>`).join('')}
        </div>

        <div class="section-title" style="margin-top:24px">👤 مستخدمي الأدمن</div>
        <div class="admin-table-wrap">
            <table class="admin-table"><thead><tr>
                <th>الاسم</th><th>اسم المستخدم</th><th>الدور</th><th>البريد</th><th>الهاتف</th>
            </tr></thead><tbody>
            ${adminUsers.map(u => `<tr>
                <td><strong>${u.name}</strong></td>
                <td>${u.username}</td>
                <td><span class="badge badge-purple">${ROLES[u.role]?.icon || ''} ${ROLES[u.role]?.label || u.role}</span></td>
                <td>${u.email || '—'}</td>
                <td>${u.phone || '—'}</td>
            </tr>`).join('')}
            </tbody></table>
        </div>`;
    } catch (e) { c.innerHTML = '<div class="empty-state">❌ تعذر تحميل البيانات</div>'; }
}
