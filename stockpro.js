// ===================================================
//  OS Communication — stockpro.js  (Part 1: Core + Navigation)
// ===================================================

let APP = { screen: 'dashboard', charts: {}, lockPin: '', lockAttempts: 0 };

// ── Plan-Based Feature Restrictions ──
const PLAN_FEATURES = {
    basic: ['dashboard', 'inventory', 'sales', 'customers', 'settings'],
    premium: ['dashboard', 'inventory', 'sales', 'purchases', 'customers', 'suppliers', 'returns', 'expenses', 'reports', 'settings'],
    enterprise: ['dashboard', 'inventory', 'sales', 'purchases', 'customers', 'suppliers', 'returns', 'damaged', 'expenses', 'reports', 'settings'],
};

function getClientPlan() {
    try {
        const cached = JSON.parse(localStorage.getItem('sp_cached_license'));
        if (cached && cached.data && cached.data.license) return cached.data.license.plan || 'basic';
    } catch (e) { }
    return 'enterprise'; // Default full access if no plan info
}

// ── Role-Based Access Control ──
const ROLE_ACCESS = {
    super_admin: ['dashboard', 'inventory', 'sales', 'purchases', 'customers', 'suppliers', 'returns', 'damaged', 'expenses', 'reports', 'settings'],
    admin: ['dashboard', 'inventory', 'sales', 'purchases', 'customers', 'suppliers', 'returns', 'damaged', 'expenses', 'reports', 'settings'],
    client_admin: ['dashboard', 'inventory', 'sales', 'purchases', 'customers', 'suppliers', 'returns', 'damaged', 'expenses', 'reports', 'settings'],
    cashier: ['dashboard', 'sales', 'customers'],
    viewer: ['dashboard', 'inventory', 'reports'],
};

function canAccess(screen) {
    // Check plan first
    const plan = getClientPlan();
    const planAllowed = PLAN_FEATURES[plan] || PLAN_FEATURES.enterprise;
    if (!planAllowed.includes(screen) && screen !== 'settings') return false;

    // Then check role
    if (!currentAdmin) return true;
    const role = currentAdmin.role || 'admin';
    const allowed = ROLE_ACCESS[role] || ROLE_ACCESS.admin;
    return allowed.includes(screen);
}

function isReadOnly() {
    return currentAdmin && currentAdmin.role === 'viewer';
}

function getPlanLabel() {
    const plan = getClientPlan();
    return { basic: '🟢 أساسي', premium: '🟣 بريميوم', enterprise: '🔵 مؤسسي' }[plan] || plan;
}

// ── Helpers ──
function $(id) { return document.getElementById(id); }
function fmt(n) { const s = getSettings(); return Number(n || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + s.currencySymbol; }
function fmtN(n) { return Number(n || 0).toLocaleString('ar-EG'); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); }
function fmtDateTime(iso) { return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

function toast(msg, type = 'success') {
    const c = $('toast-container');
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.innerHTML = (type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️') + ' ' + msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-10px)'; setTimeout(() => t.remove(), 300); }, 3000);
}

function openModal(html, cls = '') {
    const root = $('modal-root');
    root.innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal ${cls}">${html}</div></div>`;
}
function closeModal() { $('modal-root').innerHTML = ''; }

// ── Navigation ──
function navigate(screen) {
    if (!canAccess(screen)) {
        // Check if it's a plan restriction vs role restriction
        const plan = getClientPlan();
        const planAllowed = PLAN_FEATURES[plan] || PLAN_FEATURES.enterprise;
        if (!planAllowed.includes(screen)) {
            toast('🔒 هذه الميزة متاحة في الخطة الأعلى — خطتك الحالية: ' + getPlanLabel(), 'error');
        } else {
            toast('⛔ ليس لديك صلاحية للوصول لهذا القسم', 'error');
        }
        return;
    }
    APP.screen = screen;
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.nav === screen);
        if (n.dataset.nav) {
            const plan = getClientPlan();
            const planAllowed = PLAN_FEATURES[plan] || PLAN_FEATURES.enterprise;
            const planLocked = !planAllowed.includes(n.dataset.nav) && n.dataset.nav !== 'settings';
            const roleHidden = currentAdmin && !(ROLE_ACCESS[currentAdmin.role] || ROLE_ACCESS.admin).includes(n.dataset.nav);

            if (roleHidden) {
                n.style.display = 'none';
            } else if (planLocked) {
                n.style.display = '';
                n.style.opacity = '0.4';
                n.style.pointerEvents = 'auto';
                // Add lock icon if not already
                if (!n.dataset.locked) {
                    n.dataset.locked = '1';
                    const lockBadge = document.createElement('span');
                    lockBadge.textContent = '🔒';
                    lockBadge.style.cssText = 'font-size:10px;margin-right:4px';
                    n.appendChild(lockBadge);
                }
            } else {
                n.style.display = '';
                n.style.opacity = '';
            }
        }
    });
    const titles = { dashboard: 'لوحة التحكم', inventory: 'المخزون', sales: 'المبيعات', purchases: 'المشتريات', customers: 'العملاء', suppliers: 'الموردين', returns: 'المرتجعات', damaged: 'التالف', expenses: 'المصاريف', reports: 'التقارير', settings: 'الإعدادات' };
    $('header-title').textContent = titles[screen] || '';
    renderScreen();
}

function renderScreen() {
    const c = $('content');
    switch (APP.screen) {
        case 'dashboard': renderDashboard(c); break;
        case 'inventory': renderInventory(c); break;
        case 'sales': renderSales(c); break;
        case 'purchases': renderPurchases(c); break;
        case 'customers': renderCustomers(c); break;
        case 'suppliers': renderSuppliers(c); break;
        case 'returns': renderReturns(c); break;
        case 'damaged': renderDamaged(c); break;
        case 'expenses': renderExpenses(c); break;
        case 'reports': renderReports(c); break;
        case 'settings': renderSettings(c); break;
    }
    updateAlerts();
}

function updateAlerts() {
    const low = getLowStockProducts();
    const badge = $('low-stock-badge');
    const dot = $('notif-dot');
    if (low.length > 0) {
        badge.textContent = low.length;
        badge.classList.remove('hidden');
        dot.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
        dot.classList.add('hidden');
    }
}

// ── Custom Confirm Dialog ──
function confirmAction(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px)';
    overlay.innerHTML = `
        <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:28px;max-width:360px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.4)">
            <div style="font-size:40px;margin-bottom:8px">⚠️</div>
            <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:8px">${message}</div>
            <div style="font-size:12px;color:var(--muted);margin-bottom:20px">هذا الإجراء لا يمكن التراجع عنه</div>
            <div style="display:flex;gap:10px;justify-content:center">
                <button onclick="this.closest('div[style]').parentElement.remove()" style="padding:10px 24px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:14px;cursor:pointer;font-family:Cairo,sans-serif;font-weight:600">❌ إلغاء</button>
                <button id="confirm-yes-btn" style="padding:10px 24px;border-radius:10px;border:none;background:linear-gradient(135deg,#ef4444,#dc2626);color:white;font-size:14px;cursor:pointer;font-family:Cairo,sans-serif;font-weight:600;box-shadow:0 4px 12px rgba(239,68,68,0.3)">🗑️ تأكيد الحذف</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-yes-btn').onclick = () => { overlay.remove(); onConfirm(); };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

// ── Theme ──
function toggleTheme() {
    const current = document.body.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = next;
    updateSettings({ theme: next });
    // Re-render charts
    if (APP.screen === 'dashboard' || APP.screen === 'reports') renderScreen();
}

// ── Lock Screen ──
function lockApp() {
    const s = getSettings();
    if (!s.pin) { toast('لم يتم تعيين رمز دخول — اذهب للإعدادات', 'warning'); return; }
    APP.lockPin = '';
    APP.lockAttempts = 0;
    $('lock-screen').classList.remove('hidden');
    $('lock-error').textContent = '';
    updateLockDots();
}

function lockKey(k) {
    if (APP.lockPin.length >= 4) return;
    APP.lockPin += k;
    updateLockDots();
    if (APP.lockPin.length === 4) {
        const s = getSettings();
        if (APP.lockPin === s.pin) {
            $('lock-screen').classList.add('hidden');
            APP.lockPin = '';
            // If not logged in, show login instead of app
            if (!currentAdmin) {
                $('admin-login-screen').classList.remove('hidden');
                $('app').classList.add('hidden');
            }
        } else {
            APP.lockAttempts++;
            $('lock-error').textContent = 'رمز خاطئ! المحاولة ' + APP.lockAttempts + ' من 5';
            APP.lockPin = '';
            updateLockDots();
            document.querySelector('.lock-box').style.animation = 'none';
            setTimeout(() => document.querySelector('.lock-box').style.animation = '', 10);
            if (APP.lockAttempts >= 5) {
                $('lock-error').textContent = 'تم الحظر لمدة 30 ثانية';
                document.querySelectorAll('.lock-key').forEach(k => k.disabled = true);
                setTimeout(() => {
                    document.querySelectorAll('.lock-key').forEach(k => k.disabled = false);
                    APP.lockAttempts = 0;
                    $('lock-error').textContent = '';
                }, 30000);
            }
        }
    }
}
function lockDel() { APP.lockPin = APP.lockPin.slice(0, -1); updateLockDots(); }
function updateLockDots() { for (let i = 0; i < 4; i++) $('dot-' + i).classList.toggle('filled', i < APP.lockPin.length); }

// ── Onboarding ──
function obValidate() { $('ob-start').disabled = !$('ob-company').value.trim(); }

function finishOnboarding() {
    const sel = $('ob-currency');
    const sym = sel.options[sel.selectedIndex].dataset.sym;
    updateSettings({
        companyName: $('ob-company').value.trim(),
        phone: $('ob-phone').value.trim(),
        address: $('ob-address').value.trim(),
        currency: sel.value,
        currencySymbol: sym,
        taxRate: parseFloat($('ob-tax').value) || 14,
        onboarded: true
    });
    // Client starts with clean, empty database — no sample data
    $('onboarding').classList.add('hidden');

    // After onboarding, require login before showing app
    if (!currentAdmin) {
        $('admin-login-screen').classList.remove('hidden');
        $('app').classList.add('hidden');
        return;
    }

    $('app').classList.remove('hidden');
    $('brand-name').textContent = $('ob-company').value.trim();
    navigate('dashboard');
    toast('🎉 مرحباً بك في OS Communication!');
}

// ── Notifications ──
function showNotifications() {
    const low = getLowStockProducts();
    let html = `<div class="modal-header"><div class="modal-title">🔔 التنبيهات</div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body">`;
    if (low.length === 0) html += '<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-title">لا توجد تنبيهات</div></div>';
    else {
        html += '<div class="alert-list">';
        low.forEach(p => {
            const total = p.stock ? Object.values(p.stock).reduce((s, v) => s + v, 0) : 0;
            html += `<div class="alert-item warning"><span class="alert-icon">⚠️</span><div><strong>${p.name}</strong><br><span style="font-size:12px">المتبقي: ${total} — الحد الأدنى: ${p.minStock}</span></div></div>`;
        });
        html += '</div>';
    }
    html += '</div>';
    openModal(html);
}

// ══════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════
function renderDashboard(c) {
    const sales = getSalesByPeriod('month');
    const allSales = getAllRecords('sales');
    const products = getAllRecords('products');
    const totalRevenue = sales.reduce((s, v) => s + (v.total || 0), 0);
    const totalCost = sales.reduce((s, v) => s + v.items.reduce((ss, it) => ss + (it.costPrice || 0) * it.qty, 0), 0);
    const totalProfit = totalRevenue - totalCost;
    const totalItems = sales.reduce((s, v) => s + v.items.reduce((ss, it) => ss + it.qty, 0), 0);
    const low = getLowStockProducts();
    // Expenses this month
    const expenses = getAllRecords('expenses') || [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthExpenses = expenses.filter(e => new Date(e.date) >= monthStart).reduce((s, e) => s + (e.amount || 0), 0);
    const netProfit = totalProfit - monthExpenses;

    c.innerHTML = `
    <div class="stats-grid">
        <div class="stat-card accent"><div class="stat-icon accent">💰</div><div class="stat-value">${fmt(totalRevenue)}</div><div class="stat-label">إيرادات الشهر</div></div>
        <div class="stat-card green"><div class="stat-icon green">📈</div><div class="stat-value">${fmt(netProfit)}</div><div class="stat-label">صافي الربح</div></div>
        <div class="stat-card blue"><div class="stat-icon blue">🧾</div><div class="stat-value">${fmtN(sales.length)}</div><div class="stat-label">عدد الفواتير</div></div>
        <div class="stat-card purple"><div class="stat-icon purple">📦</div><div class="stat-value">${fmtN(totalItems)}</div><div class="stat-label">قطعة مباعة</div></div>
        <div class="stat-card" style="--card-accent:#f59e0b"><div class="stat-icon" style="background:rgba(245,158,11,0.15);color:#f59e0b">💸</div><div class="stat-value">${fmt(monthExpenses)}</div><div class="stat-label">مصاريف الشهر</div></div>
    </div>
    ${low.length ? `<div class="card" style="margin-bottom:20px;border-color:var(--yellow)"><div class="card-header"><div class="card-title">⚠️ تنبيهات نقص المخزون (${low.length})</div></div><div class="alert-list">${low.map(p => {
        const t = p.stock ? Object.values(p.stock).reduce((s, v) => s + v, 0) : 0;
        return `<div class="alert-item warning"><span class="alert-icon">⚠️</span><div><strong>${p.name}</strong> — المتبقي: ${t} (الحد: ${p.minStock})</div></div>`;
    }).join('')}</div></div>` : ''}
    <div class="dashboard-grid">
        <div class="chart-card"><div class="card-header"><div class="card-title">📊 مبيعات آخر 30 يوم</div></div><canvas id="chart-sales"></canvas></div>
        <div class="chart-card"><div class="card-header"><div class="card-title">🏆 أكثر المنتجات ربحاً</div></div><canvas id="chart-profit"></canvas></div>
        <div class="card" style="grid-column:1/-1"><div class="card-header"><div class="card-title">🕐 آخر الحركات</div></div><div class="activity-list">${allSales.slice(-8).reverse().map(s => `<div class="activity-item"><div class="activity-dot sale"></div><div class="activity-text"><strong>${s.invoiceNumber}</strong> — ${s.customerName || 'عميل نقدي'} — ${fmt(s.total)}</div><div class="activity-time">${fmtDate(s.date)}</div></div>`).join('')
        }</div></div>
    </div>`;

    // Charts
    setTimeout(() => {
        const daily = getDailySales(30);
        const isDark = document.body.dataset.theme === 'dark';
        const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        const textColor = isDark ? '#8ba3bc' : '#44596e';

        if (APP.charts.sales) APP.charts.sales.destroy();
        const ctx1 = $('chart-sales');
        if (ctx1) APP.charts.sales = new Chart(ctx1, {
            type: 'line',
            data: { labels: daily.map(d => d.date.slice(5)), datasets: [{ label: 'المبيعات', data: daily.map(d => d.total), borderColor: '#0ea5a0', backgroundColor: 'rgba(14,165,160,0.1)', fill: true, tension: 0.4, pointRadius: 2 }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor }, grid: { color: gridColor } } } }
        });

        const profitData = getProfitByProduct().slice(0, 6);
        if (APP.charts.profit) APP.charts.profit.destroy();
        const ctx2 = $('chart-profit');
        if (ctx2) APP.charts.profit = new Chart(ctx2, {
            type: 'bar',
            data: { labels: profitData.map(p => p.name.slice(0, 15)), datasets: [{ label: 'الربح', data: profitData.map(p => p.profit), backgroundColor: ['#0ea5a0', '#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444'] }] },
            options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor, font: { family: 'Cairo' } }, grid: { display: false } } } }
        });
    }, 100);
}

// ══════════════════════════════════════════════════
//  INVENTORY
// ══════════════════════════════════════════════════
function renderInventory(c) {
    const products = getAllRecords('products');
    const categories = getAllRecords('categories');
    const warehouses = getAllRecords('warehouses');

    c.innerHTML = `
    <div class="table-toolbar">
        <div class="table-search"><input type="text" placeholder="🔍 بحث بالاسم أو الكود أو الباركود..." oninput="filterInventory(this.value)" id="inv-search"></div>
        <div class="table-filters">
            <button class="filter-chip active" onclick="filterInvCat('all',this)">الكل</button>
            ${categories.map(cat => `<button class="filter-chip" onclick="filterInvCat('${cat.id}',this)">${cat.icon} ${cat.name}</button>`).join('')}
        </div>
        <button class="btn btn-primary" onclick="openProductForm()">➕ إضافة صنف</button>
        <button class="btn btn-ghost" onclick="exportProductsCSV()">📥 تصدير Excel</button>
    </div>
    <div class="quick-stats">
        <div class="quick-stat">إجمالي الأصناف: <strong>${products.length}</strong></div>
        <div class="quick-stat">إجمالي المخزون: <strong>${products.reduce((s, p) => s + (p.stock ? Object.values(p.stock).reduce((a, b) => a + b, 0) : 0), 0)}</strong></div>
        <div class="quick-stat" style="color:var(--yellow)">نقص مخزون: <strong>${getLowStockProducts().length}</strong></div>
    </div>
    <div class="table-container">
        <table class="data-table" id="inv-table">
            <thead><tr>
                <th>الصنف</th><th>الكود</th><th>التصنيف</th><th>سعر التكلفة</th><th>سعر القطاعي</th><th>سعر الجملة</th><th>المخزون</th><th>الحالة</th><th>إجراءات</th>
            </tr></thead>
            <tbody id="inv-tbody"></tbody>
        </table>
    </div>`;
    renderInvRows(products, categories, warehouses);
}

APP.invCatFilter = 'all';
APP.invSearch = '';

function renderInvRows(products, categories, warehouses) {
    let filtered = products;
    if (APP.invCatFilter !== 'all') filtered = filtered.filter(p => p.categoryId === APP.invCatFilter);
    if (APP.invSearch) {
        const q = APP.invSearch.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q) || (p.barcode || '').includes(q));
    }
    const tbody = $('inv-tbody');
    if (!tbody) return;
    tbody.innerHTML = filtered.map(p => {
        const cat = (categories || getAllRecords('categories')).find(c => c.id === p.categoryId);
        const total = p.stock ? Object.values(p.stock).reduce((s, v) => s + v, 0) : 0;
        const isLow = p.minStock && total <= p.minStock;
        return `<tr>
            <td><strong>${p.name}</strong></td>
            <td style="font-family:monospace;color:var(--text-muted)">${p.code || '-'}</td>
            <td>${cat ? `<span class="badge" style="background:${cat.color}20;color:${cat.color}">${cat.icon} ${cat.name}</span>` : '-'}</td>
            <td>${fmt(p.costPrice)}</td><td>${fmt(p.retailPrice)}</td><td>${fmt(p.wholesalePrice)}</td>
            <td><strong>${fmtN(total)}</strong> ${p.unit || ''}</td>
            <td>${isLow ? '<span class="badge badge-red">⚠️ نقص</span>' : '<span class="badge badge-green">متوفر</span>'}</td>
            <td><div class="action-row">
                <button class="action-btn edit" onclick="openProductForm('${p.id}')" title="تعديل">✏️</button>
                <button class="action-btn delete" onclick="deleteProduct('${p.id}')" title="حذف">🗑️</button>
            </div></td>
        </tr>`;
    }).join('');
}

function filterInventory(q) { APP.invSearch = q; renderInvRows(getAllRecords('products')); }
function filterInvCat(catId, el) {
    APP.invCatFilter = catId;
    document.querySelectorAll('.table-filters .filter-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    renderInvRows(getAllRecords('products'));
}

function openProductForm(id) {
    const p = id ? getRecord('products', id) : null;
    const cats = getAllRecords('categories');
    const whs = getAllRecords('warehouses');
    const title = p ? 'تعديل صنف' : 'إضافة صنف جديد';

    let html = `<div class="modal-header"><div class="modal-title">${title}</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
        <div class="form-row"><div class="form-group"><label class="form-label">اسم الصنف *</label><input class="form-input" id="pf-name" value="${p ? p.name : ''}"></div>
        <div class="form-group"><label class="form-label">الكود</label><input class="form-input" id="pf-code" value="${p ? p.code : ''}"></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">الباركود</label><input class="form-input" id="pf-barcode" value="${p ? p.barcode : ''}"></div>
        <div class="form-group"><label class="form-label">التصنيف</label><select class="form-select" id="pf-cat">${cats.map(c => `<option value="${c.id}" ${p && p.categoryId === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}</select></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">الوحدة</label><input class="form-input" id="pf-unit" value="${p ? p.unit : 'قطعة'}" placeholder="قطعة / كجم / لتر"></div>
        <div class="form-group"><label class="form-label">الحد الأدنى للمخزون</label><input type="number" class="form-input" id="pf-min" value="${p ? p.minStock : 10}" min="0"></div></div>
        <div class="form-row-3"><div class="form-group"><label class="form-label">سعر التكلفة *</label><input type="number" class="form-input" id="pf-cost" value="${p ? p.costPrice : 0}" min="0" step="0.01"></div>
        <div class="form-group"><label class="form-label">سعر القطاعي *</label><input type="number" class="form-input" id="pf-retail" value="${p ? p.retailPrice : 0}" min="0" step="0.01"></div>
        <div class="form-group"><label class="form-label">سعر الجملة</label><input type="number" class="form-input" id="pf-wholesale" value="${p ? p.wholesalePrice : 0}" min="0" step="0.01"></div></div>
        ${!p ? `<div class="form-row">${whs.map(w => `<div class="form-group"><label class="form-label">كمية في ${w.name}</label><input type="number" class="form-input" id="pf-stock-${w.id}" value="0" min="0"></div>`).join('')}</div>` : ''}
    </div>
    <div class="modal-footer"><button class="btn btn-primary" onclick="saveProduct('${id || ''}')">${p ? 'حفظ التعديلات' : 'إضافة الصنف'}</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button></div>`;
    openModal(html, 'modal-lg');
}

function saveProduct(id) {
    const name = $('pf-name').value.trim();
    if (!name) { toast('اسم الصنف مطلوب', 'error'); return; }
    const data = {
        name, code: $('pf-code').value.trim(), barcode: $('pf-barcode').value.trim(),
        categoryId: $('pf-cat').value, unit: $('pf-unit').value.trim(),
        minStock: parseInt($('pf-min').value) || 0,
        costPrice: parseFloat($('pf-cost').value) || 0,
        retailPrice: parseFloat($('pf-retail').value) || 0,
        wholesalePrice: parseFloat($('pf-wholesale').value) || 0,
    };
    if (id) {
        updateRecord('products', id, data);
        toast('تم تعديل الصنف بنجاح');
    } else {
        const whs = getAllRecords('warehouses');
        data.stock = {};
        whs.forEach(w => { data.stock[w.id] = parseInt($('pf-stock-' + w.id)?.value) || 0; });
        data.image = '';
        addRecord('products', data);
        toast('تم إضافة الصنف بنجاح');
    }
    closeModal();
    renderScreen();
}

function deleteProduct(id) {
    confirmAction('هل أنت متأكد من حذف هذا الصنف؟', () => {
        deleteRecord('products', id);
        toast('تم حذف الصنف', 'warning');
        renderScreen();
    });
}

function exportProductsCSV() {
    const prods = getAllRecords('products');
    const data = prods.map(p => ({
        الاسم: p.name, الكود: p.code, الباركود: p.barcode,
        'سعر التكلفة': p.costPrice, 'سعر القطاعي': p.retailPrice, 'سعر الجملة': p.wholesalePrice,
        المخزون: p.stock ? Object.values(p.stock).reduce((s, v) => s + v, 0) : 0,
        'الحد الأدنى': p.minStock
    }));
    exportToCSV(data, 'products_' + new Date().toISOString().split('T')[0]);
    toast('تم تصدير قائمة الأصناف');
}

// ══════════════════════════════════════════════════
//  SALES — FULL POS SCREEN
// ══════════════════════════════════════════════════
APP.salesTab = 'pos';
APP.posSearch = '';
APP.posCat = 'all';

function renderSales(c) {
    // Init sale state if empty
    if (!APP.saleItems) APP.saleItems = [];
    if (APP.saleDiscount === undefined) APP.saleDiscount = 0;
    if (APP.saleShipping === undefined) APP.saleShipping = 0;
    if (!APP.salePriceType) APP.salePriceType = 'retail';
    if (!APP.salePayment) APP.salePayment = 'cash';
    if (!APP.saleCustomerId) APP.saleCustomerId = '';
    const warehouses = getAllRecords('warehouses');
    if (!APP.saleWarehouse) APP.saleWarehouse = warehouses[0]?.id || '';

    c.innerHTML = `
    <div class="pos-tabs">
        <button class="pos-tab ${APP.salesTab === 'pos' ? 'active' : ''}" onclick="APP.salesTab='pos';renderScreen()">🧾 نقطة البيع</button>
        <button class="pos-tab ${APP.salesTab === 'history' ? 'active' : ''}" onclick="APP.salesTab='history';renderScreen()">📋 سجل الفواتير</button>
    </div>
    <div id="pos-content"></div>`;

    if (APP.salesTab === 'history') {
        renderSalesHistory();
    } else {
        renderPOSScreen();
    }
}

function renderSalesHistory() {
    const sales = getAllRecords('sales');
    const pc = $('pos-content');
    if (!pc) return;
    pc.innerHTML = `
    <div class="table-toolbar" style="margin-top:12px">
        <div class="table-search"><input type="text" placeholder="🔍 بحث برقم الفاتورة أو اسم العميل..." oninput="filterSales(this.value)"></div>
        <button class="btn btn-ghost" onclick="exportSalesCSV()">📥 تصدير</button>
    </div>
    <div class="table-container">
        <table class="data-table"><thead><tr>
            <th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>الأصناف</th><th>الإجمالي</th><th>الدفع</th><th>الحالة</th><th>إجراءات</th>
        </tr></thead><tbody id="sales-tbody"></tbody></table>
    </div>`;
    renderSalesRows(sales);
}

function renderPOSScreen() {
    const products = getAllRecords('products');
    const categories = getAllRecords('categories');
    const customers = getAllRecords('customers');
    const warehouses = getAllRecords('warehouses');
    const pc = $('pos-content');
    if (!pc) return;

    pc.innerHTML = `
    <div class="pos-layout">
        <!-- LEFT: Products -->
        <div class="pos-products">
            <div class="pos-barcode">
                <input type="text" class="form-input" id="pos-barcode-input" placeholder="📷 امسح الباركود أو ابحث بالاسم..." autofocus
                    oninput="APP.posSearch=this.value;renderPOSProducts()"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();posBarcodeScan(this.value)}">
            </div>
            <div class="pos-cats">
                <button class="pos-cat-btn ${APP.posCat === 'all' ? 'active' : ''}" onclick="APP.posCat='all';renderPOSProducts()">الكل</button>
                ${categories.map(cat => `<button class="pos-cat-btn ${APP.posCat === cat.id ? 'active' : ''}" onclick="APP.posCat='${cat.id}';renderPOSProducts()">${cat.icon} ${cat.name}</button>`).join('')}
            </div>
            <div class="pos-grid" id="pos-grid"></div>
        </div>

        <!-- RIGHT: Cart -->
        <div class="pos-cart">
            <div class="pos-cart-header">
                <div class="pos-cart-title">🛒 الفاتورة</div>
                <button class="btn btn-ghost btn-sm" onclick="APP.saleItems=[];renderPOSCart()" title="مسح الكل">🗑️ مسح</button>
            </div>

            <div class="pos-cart-controls">
                <select class="form-select" id="pos-customer" onchange="APP.saleCustomerId=this.value">
                    <option value="">👤 عميل نقدي</option>
                    ${customers.map(cu => `<option value="${cu.id}" ${APP.saleCustomerId === cu.id ? 'selected' : ''}>${cu.name}</option>`).join('')}
                </select>
                <div class="pos-ctrl-row">
                    <select class="form-select" onchange="APP.salePriceType=this.value;renderPOSCart()">
                        <option value="retail" ${APP.salePriceType === 'retail' ? 'selected' : ''}>💵 قطاعي</option>
                        <option value="wholesale" ${APP.salePriceType === 'wholesale' ? 'selected' : ''}>📦 جملة</option>
                    </select>
                    <select class="form-select" onchange="APP.salePayment=this.value">
                        <option value="cash" ${APP.salePayment === 'cash' ? 'selected' : ''}>💰 نقدي</option>
                        <option value="card" ${APP.salePayment === 'card' ? 'selected' : ''}>💳 بطاقة</option>
                    </select>
                </div>
            </div>

            <div class="pos-cart-items" id="pos-cart-items">
                <!-- Cart items rendered here -->
            </div>

            <div class="pos-cart-footer">
                <div class="pos-extras">
                    <div class="pos-extra-field">
                        <label>خصم</label>
                        <input type="number" class="form-input" id="pos-discount" value="${APP.saleDiscount || 0}" min="0" step="0.01"
                            oninput="APP.saleDiscount=parseFloat(this.value)||0;renderPOSTotals()">
                    </div>
                    <div class="pos-extra-field">
                        <label>🚚 شحن</label>
                        <input type="number" class="form-input" id="pos-shipping" value="${APP.saleShipping || 0}" min="0" step="0.01"
                            oninput="APP.saleShipping=parseFloat(this.value)||0;renderPOSTotals()">
                    </div>
                </div>
                <div class="pos-totals" id="pos-totals"></div>
                <div class="pos-btn-row">
                    <button class="pos-checkout-btn" onclick="posSaveSale(false)">
                        💾 حفظ الفاتورة
                    </button>
                    <button class="pos-checkout-btn print" onclick="posSaveSale(true)">
                        🖨️ حفظ وطباعة
                    </button>
                </div>
            </div>
        </div>
    </div>`;

    renderPOSProducts();
    renderPOSCart();
}

function renderPOSProducts() {
    const products = getAllRecords('products');
    const categories = getAllRecords('categories');
    const grid = $('pos-grid');
    if (!grid) return;
    let filtered = products;
    if (APP.posCat !== 'all') filtered = filtered.filter(p => p.categoryId === APP.posCat);
    if (APP.posSearch) {
        const q = APP.posSearch.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q) || (p.barcode || '').includes(q));
    }
    grid.innerHTML = filtered.map(p => {
        const cat = categories.find(c => c.id === p.categoryId);
        const total = p.stock ? Object.values(p.stock).reduce((s, v) => s + v, 0) : 0;
        const price = APP.salePriceType === 'wholesale' ? p.wholesalePrice : p.retailPrice;
        const inCart = APP.saleItems?.find(i => i.productId === p.id);
        return `<div class="pos-product-card ${inCart ? 'in-cart' : ''} ${total <= 0 ? 'out-of-stock' : ''}" onclick="posAddProduct('${p.id}')">
            <div class="pos-prod-icon">${cat ? cat.icon : '📦'}</div>
            <div class="pos-prod-name">${p.name}</div>
            <div class="pos-prod-price">${fmt(price)}</div>
            <div class="pos-prod-stock">${total > 0 ? fmtN(total) + ' ' + (p.unit || '') : '⛔ نفذ'}</div>
            ${inCart ? `<div class="pos-prod-qty">${inCart.qty}</div>` : ''}
        </div>`;
    }).join('') || '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📭</div><div class="empty-title">لا توجد أصناف</div></div>';
}

function posAddProduct(pid) {
    const p = getRecord('products', pid);
    if (!p) return;
    const price = APP.salePriceType === 'wholesale' ? p.wholesalePrice : p.retailPrice;
    const existing = APP.saleItems.find(i => i.productId === pid);
    if (existing) { existing.qty += 1; }
    else { APP.saleItems.push({ productId: pid, name: p.name, qty: 1, price, costPrice: p.costPrice }); }
    renderPOSCart();
    renderPOSProducts();
}

function posBarcodeScan(val) {
    if (!val || !val.trim()) return;
    val = val.trim();
    const products = getAllRecords('products');
    const p = products.find(pr => pr.barcode === val || pr.code === val);
    if (p) {
        posAddProduct(p.id);
        toast('✅ ' + p.name);
    } else {
        toast('❌ لم يتم العثور على: ' + val, 'error');
    }
    const input = $('pos-barcode-input');
    if (input) { input.value = ''; APP.posSearch = ''; renderPOSProducts(); input.focus(); }
}

function renderPOSCart() {
    // Update prices based on price type
    const products = getAllRecords('products');
    APP.saleItems.forEach(item => {
        const p = products.find(pr => pr.id === item.productId);
        if (p) item.price = APP.salePriceType === 'wholesale' ? p.wholesalePrice : p.retailPrice;
    });

    const cart = $('pos-cart-items');
    if (!cart) return;
    if (APP.saleItems.length === 0) {
        cart.innerHTML = '<div class="pos-cart-empty"><div class="empty-icon">🛒</div><div>الفاتورة فارغة</div><div style="font-size:12px;color:var(--text-muted)">اضغط على صنف لإضافته</div></div>';
    } else {
        cart.innerHTML = APP.saleItems.map((it, i) => `
            <div class="pos-cart-item">
                <div class="pos-ci-info">
                    <div class="pos-ci-name">${it.name}</div>
                    <div class="pos-ci-price">${fmt(it.price)} × ${it.qty} = ${fmt(it.price * it.qty)}</div>
                </div>
                <div class="pos-ci-actions">
                    <button class="pos-qty-btn" onclick="posChangeQty(${i},-1)">−</button>
                    <span class="pos-ci-qty">${it.qty}</span>
                    <button class="pos-qty-btn" onclick="posChangeQty(${i},1)">+</button>
                    <button class="pos-qty-btn del" onclick="APP.saleItems.splice(${i},1);renderPOSCart();renderPOSProducts()">✕</button>
                </div>
            </div>`).join('');
    }
    renderPOSTotals();
}

function posChangeQty(idx, delta) {
    APP.saleItems[idx].qty += delta;
    if (APP.saleItems[idx].qty <= 0) APP.saleItems.splice(idx, 1);
    renderPOSCart();
    renderPOSProducts();
}

function renderPOSTotals() {
    const s = getSettings();
    const subtotal = APP.saleItems.reduce((sum, it) => sum + it.price * it.qty, 0);
    const discount = APP.saleDiscount || 0;
    const shipping = APP.saleShipping || 0;
    const taxable = subtotal - discount;
    const tax = taxable * (s.taxRate / 100);
    const total = taxable + tax + shipping;
    const itemCount = APP.saleItems.reduce((s, it) => s + it.qty, 0);
    const el = $('pos-totals');
    if (!el) return;
    el.innerHTML = `
        <div class="pos-total-line"><span>المجموع (${itemCount} قطعة)</span><span>${fmt(subtotal)}</span></div>
        ${discount ? `<div class="pos-total-line"><span>الخصم</span><span style="color:var(--red)">- ${fmt(discount)}</span></div>` : ''}
        <div class="pos-total-line"><span>الضريبة (${s.taxRate}%)</span><span>${fmt(tax)}</span></div>
        ${shipping ? `<div class="pos-total-line"><span>🚚 الشحن</span><span>${fmt(shipping)}</span></div>` : ''}
        <div class="pos-total-grand"><span>الإجمالي</span><span>${fmt(total)}</span></div>`;
}

function posSaveSale(shouldPrint) {
    if (APP.saleItems.length === 0) { toast('أضف صنف واحد على الأقل', 'error'); return; }
    const s = getSettings();
    const subtotal = APP.saleItems.reduce((sum, it) => sum + it.price * it.qty, 0);
    const discount = APP.saleDiscount || 0;
    const shipping = APP.saleShipping || 0;
    const tax = (subtotal - discount) * (s.taxRate / 100);
    const total = subtotal - discount + tax + shipping;
    const customer = APP.saleCustomerId ? getRecord('customers', APP.saleCustomerId) : null;

    const sale = {
        invoiceNumber: getNextInvoiceNumber(),
        date: new Date().toISOString(),
        items: APP.saleItems.map(i => ({ ...i })),
        subtotal, discount, shipping, tax, total,
        customerId: APP.saleCustomerId || null,
        customerName: customer ? customer.name : 'عميل نقدي',
        paymentMethod: APP.salePayment,
        warehouseId: APP.saleWarehouse,
        status: 'completed', notes: ''
    };
    addRecord('sales', sale);
    APP.saleItems.forEach(it => { adjustStock(it.productId, APP.saleWarehouse, -it.qty, 'out', sale.invoiceNumber); });

    // Reset cart
    APP.saleItems = [];
    APP.saleDiscount = 0;
    APP.saleShipping = 0;
    APP.saleCustomerId = '';

    toast('✅ تم حفظ الفاتورة ' + sale.invoiceNumber);
    renderScreen();

    if (shouldPrint) {
        printInvoice(sale.id);
    }
}

// Keep old openSaleForm as alias for backward compat
function openSaleForm() { APP.salesTab = 'pos'; navigate('sales'); }

APP.salesSearch = '';
function filterSales(q) { APP.salesSearch = q; renderSalesRows(getAllRecords('sales')); }

function renderSalesRows(sales) {
    const q = APP.salesSearch || '';
    let filtered = sales;
    if (q) filtered = filtered.filter(s => (s.invoiceNumber || '').includes(q) || (s.customerName || '').includes(q));
    const tbody = $('sales-tbody');
    if (!tbody) return;
    tbody.innerHTML = filtered.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 100).map(s => `<tr>
        <td><strong style="color:var(--accent)">${s.invoiceNumber}</strong></td>
        <td>${fmtDate(s.date)}</td>
        <td>${s.customerName || 'عميل نقدي'}</td>
        <td>${s.items.length} صنف</td>
        <td><strong>${fmt(s.total)}</strong></td>
        <td><span class="badge ${s.paymentMethod === 'cash' ? 'badge-green' : 'badge-blue'}">${s.paymentMethod === 'cash' ? 'نقدي' : 'بطاقة'}</span></td>
        <td><span class="badge badge-green">مكتمل</span></td>
        <td><div class="action-row">
            <button class="action-btn view" onclick="viewSale('${s.id}')" title="عرض">👁️</button>
            <button class="action-btn" onclick="printInvoice('${s.id}')" title="طباعة">🖨️</button>
            <button class="action-btn whatsapp" onclick="whatsappSale('${s.id}')" title="WhatsApp">💬</button>
        </div></td>
    </tr>`).join('');
}

function addSaleItem() {
    const pid = $('sf-product').value;
    const qty = parseInt($('sf-qty').value) || 1;
    const p = getRecord('products', pid);
    if (!p) return;
    const price = APP.salePriceType === 'wholesale' ? p.wholesalePrice : p.retailPrice;
    const existing = APP.saleItems.find(i => i.productId === pid);
    if (existing) { existing.qty += qty; }
    else { APP.saleItems.push({ productId: pid, name: p.name, qty, price, costPrice: p.costPrice }); }
    updateSaleItems();
}

function updateSaleItems() {
    const products = getAllRecords('products');
    APP.saleItems.forEach(item => {
        const p = products.find(pr => pr.id === item.productId);
        if (p) item.price = APP.salePriceType === 'wholesale' ? p.wholesalePrice : p.retailPrice;
    });
    const tbody = $('sf-items');
    if (!tbody) return;
    tbody.innerHTML = APP.saleItems.map((it, i) => `<tr class="invoice-item-row">
        <td>${it.name}</td><td><input type="number" class="form-input" value="${it.qty}" min="1" style="width:70px" onchange="APP.saleItems[${i}].qty=parseInt(this.value)||1;updateSaleTotals()"></td>
        <td>${fmt(it.price)}</td><td>${fmt(it.price * it.qty)}</td>
        <td><button class="action-btn delete" onclick="APP.saleItems.splice(${i},1);updateSaleItems()">🗑️</button></td>
    </tr>`).join('');
    updateSaleTotals();
}

function updateSaleTotals() {
    const s = getSettings();
    const subtotal = APP.saleItems.reduce((sum, it) => sum + it.price * it.qty, 0);
    const discount = APP.saleDiscount || 0;
    const shipping = APP.saleShipping || 0;
    const taxable = subtotal - discount;
    const tax = taxable * (s.taxRate / 100);
    const total = taxable + tax + shipping;
    const el = $('sf-totals');
    if (!el) return;
    el.innerHTML = `
        <div class="invoice-total-row"><span>المجموع</span><span>${fmt(subtotal)}</span></div>
        ${discount ? `<div class="invoice-total-row"><span>الخصم</span><span style="color:var(--red)">- ${fmt(discount)}</span></div>` : ''}
        <div class="invoice-total-row"><span>الضريبة (${s.taxRate}%)</span><span>${fmt(tax)}</span></div>
        ${shipping ? `<div class="invoice-total-row"><span>🚚 الشحن</span><span>${fmt(shipping)}</span></div>` : ''}
        <div class="invoice-total-row grand"><span>الإجمالي</span><span>${fmt(total)}</span></div>`;
}

function saveSale() {
    if (APP.saleItems.length === 0) { toast('أضف صنف واحد على الأقل', 'error'); return; }
    const s = getSettings();
    const subtotal = APP.saleItems.reduce((sum, it) => sum + it.price * it.qty, 0);
    const discount = APP.saleDiscount || 0;
    const shipping = APP.saleShipping || 0;
    const tax = (subtotal - discount) * (s.taxRate / 100);
    const total = subtotal - discount + tax + shipping;
    const customer = APP.saleCustomerId ? getRecord('customers', APP.saleCustomerId) : null;

    const sale = {
        invoiceNumber: getNextInvoiceNumber(),
        date: new Date().toISOString(),
        items: APP.saleItems.map(i => ({ ...i })),
        subtotal, discount, shipping, tax, total,
        customerId: APP.saleCustomerId || null,
        customerName: customer ? customer.name : 'عميل نقدي',
        paymentMethod: APP.salePayment,
        warehouseId: APP.saleWarehouse,
        status: 'completed', notes: ''
    };
    addRecord('sales', sale);
    // Decrease stock
    APP.saleItems.forEach(it => { adjustStock(it.productId, APP.saleWarehouse, -it.qty, 'out', sale.invoiceNumber); });
    closeModal();
    toast('✅ تم حفظ الفاتورة ' + sale.invoiceNumber);
    renderScreen();
}

function viewSale(id) {
    const s = getRecord('sales', id);
    if (!s) return;
    const settings = getSettings();
    let html = `<div class="modal-header"><div class="modal-title">فاتورة ${s.invoiceNumber}</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
        <div style="display:flex;justify-content:space-between;margin-bottom:16px"><div><strong>${settings.companyName}</strong><br><span style="color:var(--text-muted)">${settings.phone} | ${settings.address}</span></div><div style="text-align:left"><strong>${s.invoiceNumber}</strong><br>${fmtDateTime(s.date)}</div></div>
        <div style="margin-bottom:12px">العميل: <strong>${s.customerName || 'عميل نقدي'}</strong></div>
        <table class="invoice-items-table"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>
        ${s.items.map(it => `<tr><td>${it.name}</td><td>${it.qty}</td><td>${fmt(it.price)}</td><td>${fmt(it.price * it.qty)}</td></tr>`).join('')}
        </tbody></table>
        <div class="invoice-totals">
            <div class="invoice-total-row"><span>المجموع</span><span>${fmt(s.subtotal)}</span></div>
            ${s.discount ? `<div class="invoice-total-row"><span>الخصم</span><span style="color:var(--red)">- ${fmt(s.discount)}</span></div>` : ''}
            <div class="invoice-total-row"><span>الضريبة</span><span>${fmt(s.tax)}</span></div>
            <div class="invoice-total-row grand"><span>الإجمالي</span><span>${fmt(s.total)}</span></div>
        </div>
    </div>
    <div class="modal-footer">
        <button class="btn btn-ghost" onclick="printInvoice('${id}')">🖨️ طباعة</button>
        <button class="btn btn-ghost" onclick="whatsappSale('${id}')">💬 WhatsApp</button>
        <button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>
    </div>`;
    openModal(html, 'modal-lg');
}

function printInvoice(id) {
    const s = getRecord('sales', id);
    if (!s) return;
    const settings = getSettings();
    const sym = settings.currencySymbol;
    const pi = $('print-invoice');
    const logoHtml = settings.logo ? `<img src="${settings.logo}" style="max-height:60px;max-width:160px;margin-bottom:8px;object-fit:contain" alt="logo">` : '';
    pi.innerHTML = `
    <div class="pi-header">
        ${logoHtml}
        <div class="pi-company">${settings.companyName}</div>
        <div class="pi-sub">${settings.phone ? settings.phone + ' | ' : ''}${settings.address || ''}</div>
    </div>
    <div class="pi-info-row">
        <div>رقم الفاتورة: <strong>${s.invoiceNumber}</strong></div>
        <div>التاريخ: ${fmtDateTime(s.date)}</div>
    </div>
    <div class="pi-customer">العميل: <strong>${s.customerName || 'عميل نقدي'}</strong>
        ${s.paymentMethod ? ' | الدفع: <strong>' + (s.paymentMethod === 'cash' ? 'نقدي' : 'بطاقة') + '</strong>' : ''}
    </div>
    <table>
        <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>
        ${s.items.map((it, i) => `<tr>
            <td>${i + 1}</td><td>${it.name}</td><td>${it.qty}</td>
            <td>${Number(it.price).toFixed(2)} ${sym}</td>
            <td>${(it.price * it.qty).toFixed(2)} ${sym}</td>
        </tr>`).join('')}
        </tbody>
    </table>
    <div class="pi-totals">
        <div class="pi-total-row"><span>المجموع</span><span>${Number(s.subtotal).toFixed(2)} ${sym}</span></div>
        ${s.discount ? `<div class="pi-total-row"><span>الخصم</span><span>- ${Number(s.discount).toFixed(2)} ${sym}</span></div>` : ''}
        <div class="pi-total-row"><span>الضريبة (${settings.taxRate}%)</span><span>${Number(s.tax).toFixed(2)} ${sym}</span></div>
        ${s.shipping ? `<div class="pi-total-row"><span>🚚 الشحن</span><span>${Number(s.shipping).toFixed(2)} ${sym}</span></div>` : ''}
        <div class="pi-total-grand"><span>الإجمالي</span><span>${Number(s.total).toFixed(2)} ${sym}</span></div>
    </div>
    <div class="pi-footer">
        <div class="pi-thanks">${settings.receiptFooter || 'شكراً لتعاملكم معنا'}</div>
        <div>📞 ${settings.phone || ''} | ${settings.companyName} | ${new Date().getFullYear()}</div>
    </div>`;
    setTimeout(() => window.print(), 200);
}

function whatsappSale(id) {
    const s = getRecord('sales', id);
    if (!s) return;
    const customer = s.customerId ? getRecord('customers', s.customerId) : null;
    const phone = customer ? customer.phone : '';
    if (!phone) {
        const p = prompt('أدخل رقم الهاتف (مع كود الدولة مثل 201012345678):');
        if (p) shareInvoiceWhatsApp(s, p);
    } else {
        shareInvoiceWhatsApp(s, '2' + phone);
    }
}

function exportSalesCSV() {
    const sales = getAllRecords('sales');
    const data = sales.map(s => ({
        'رقم الفاتورة': s.invoiceNumber, التاريخ: s.date?.split('T')[0],
        العميل: s.customerName, الأصناف: s.items.length,
        المجموع: s.subtotal, الخصم: s.discount, الضريبة: s.tax, الإجمالي: s.total,
        'طريقة الدفع': s.paymentMethod === 'cash' ? 'نقدي' : 'بطاقة'
    }));
    exportToCSV(data, 'sales_' + new Date().toISOString().split('T')[0]);
    toast('تم تصدير المبيعات');
}

// ══════════════════════════════════════════════════
//  PURCHASES
// ══════════════════════════════════════════════════
function renderPurchases(c) {
    const purchases = getAllRecords('purchases');
    c.innerHTML = `
    <div class="table-toolbar">
        <div class="table-search"><input placeholder="🔍 بحث..." oninput="filterPurchases(this.value)"></div>
        <button class="btn btn-primary" onclick="openPurchaseForm()">➕ فاتورة شراء جديدة</button>
    </div>
    <div class="table-container">
        <table class="data-table"><thead><tr>
            <th>رقم الأمر</th><th>التاريخ</th><th>المورد</th><th>الأصناف</th><th>الإجمالي</th><th>الحالة</th><th>إجراءات</th>
        </tr></thead><tbody id="purchases-tbody"></tbody></table>
    </div>`;
    renderPurchaseRows(purchases);
}

function renderPurchaseRows(purchases) {
    const tbody = $('purchases-tbody');
    if (!tbody) return;
    tbody.innerHTML = purchases.sort((a, b) => new Date(b.date) - new Date(a.date)).map(p => `<tr>
        <td><strong style="color:var(--blue)">${p.poNumber}</strong></td>
        <td>${fmtDate(p.date)}</td>
        <td>${p.supplierName || '-'}</td>
        <td>${(p.items || []).length} صنف</td>
        <td><strong>${fmt(p.total)}</strong></td>
        <td><span class="badge badge-green">مستلم</span></td>
        <td><button class="action-btn view" onclick="viewPurchase('${p.id}')" title="عرض">👁️</button></td>
    </tr>`).join('');
}

function filterPurchases(q) {
    const all = getAllRecords('purchases');
    const filtered = q ? all.filter(p => (p.poNumber || '').includes(q) || (p.supplierName || '').includes(q)) : all;
    renderPurchaseRows(filtered);
}

function openPurchaseForm() {
    const products = getAllRecords('products');
    const suppliers = getAllRecords('suppliers');
    const warehouses = getAllRecords('warehouses');
    APP.purchaseItems = [];

    let html = `<div class="modal-header"><div class="modal-title">🛒 فاتورة شراء جديدة</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
        <div class="form-row">
            <div class="form-group"><label class="form-label">المورد</label><select class="form-select" id="puf-supplier">${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label">المخزن</label><select class="form-select" id="puf-wh">${warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}</select></div>
        </div>
        <div class="invoice-add-row">
            <div class="form-group" style="flex:2;margin:0"><label class="form-label">الصنف</label><select class="form-select" id="puf-product">${products.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
            <div class="form-group" style="flex:0.5;margin:0"><label class="form-label">الكمية</label><input type="number" class="form-input" id="puf-qty" value="1" min="1"></div>
            <div class="form-group" style="flex:0.7;margin:0"><label class="form-label">سعر الشراء</label><input type="number" class="form-input" id="puf-price" value="0" min="0" step="0.01"></div>
            <button class="btn btn-primary btn-sm" onclick="addPurchaseItem()" style="align-self:flex-end;padding:10px 16px">➕</button>
        </div>
        <table class="invoice-items-table"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead><tbody id="puf-items"></tbody></table>
        <div class="invoice-totals" id="puf-totals"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-primary btn-lg" onclick="savePurchase()">💾 حفظ أمر الشراء</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button></div>`;
    openModal(html, 'modal-xl');
    updatePurchaseTotals();
}

function addPurchaseItem() {
    const pid = $('puf-product').value;
    const qty = parseInt($('puf-qty').value) || 1;
    const price = parseFloat($('puf-price').value) || 0;
    const p = getRecord('products', pid);
    if (!p) return;
    APP.purchaseItems.push({ productId: pid, name: p.name, qty, price });
    renderPurchaseItems();
}

function renderPurchaseItems() {
    const tbody = $('puf-items');
    if (!tbody) return;
    tbody.innerHTML = APP.purchaseItems.map((it, i) => `<tr><td>${it.name}</td><td>${it.qty}</td><td>${fmt(it.price)}</td><td>${fmt(it.price * it.qty)}</td><td><button class="action-btn delete" onclick="APP.purchaseItems.splice(${i},1);renderPurchaseItems()">🗑️</button></td></tr>`).join('');
    updatePurchaseTotals();
}

function updatePurchaseTotals() {
    const s = getSettings();
    const subtotal = APP.purchaseItems.reduce((sum, it) => sum + it.price * it.qty, 0);
    const tax = subtotal * (s.taxRate / 100);
    const el = $('puf-totals');
    if (!el) return;
    el.innerHTML = `<div class="invoice-total-row"><span>المجموع</span><span>${fmt(subtotal)}</span></div>
    <div class="invoice-total-row"><span>الضريبة (${s.taxRate}%)</span><span>${fmt(tax)}</span></div>
    <div class="invoice-total-row grand"><span>الإجمالي</span><span>${fmt(subtotal + tax)}</span></div>`;
}

function savePurchase() {
    if (APP.purchaseItems.length === 0) { toast('أضف صنف واحد على الأقل', 'error'); return; }
    const s = getSettings();
    const subtotal = APP.purchaseItems.reduce((sum, it) => sum + it.price * it.qty, 0);
    const tax = subtotal * (s.taxRate / 100);
    const supplier = getRecord('suppliers', $('puf-supplier').value);
    const whId = $('puf-wh').value;

    const purchase = {
        poNumber: getNextPurchaseNumber(), date: new Date().toISOString(),
        supplierId: supplier ? supplier.id : null, supplierName: supplier ? supplier.name : '',
        items: APP.purchaseItems.map(i => ({ ...i })),
        subtotal, tax, total: subtotal + tax, warehouseId: whId, status: 'received', notes: ''
    };
    addRecord('purchases', purchase);
    APP.purchaseItems.forEach(it => { adjustStock(it.productId, whId, it.qty, 'in', purchase.poNumber); });
    closeModal();
    toast('✅ تم حفظ أمر الشراء ' + purchase.poNumber);
    renderScreen();
}

function viewPurchase(id) {
    const p = getRecord('purchases', id);
    if (!p) return;
    let html = `<div class="modal-header"><div class="modal-title">أمر شراء ${p.poNumber}</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
        <div style="margin-bottom:12px">المورد: <strong>${p.supplierName}</strong> | التاريخ: ${fmtDateTime(p.date)}</div>
        <table class="invoice-items-table"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>
        ${(p.items || []).map(it => `<tr><td>${it.name}</td><td>${it.qty}</td><td>${fmt(it.price)}</td><td>${fmt(it.price * it.qty)}</td></tr>`).join('')}
        </tbody></table>
        <div class="invoice-totals">
            <div class="invoice-total-row"><span>المجموع</span><span>${fmt(p.subtotal)}</span></div>
            <div class="invoice-total-row"><span>الضريبة</span><span>${fmt(p.tax)}</span></div>
            <div class="invoice-total-row grand"><span>الإجمالي</span><span>${fmt(p.total)}</span></div>
        </div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">إغلاق</button></div>`;
    openModal(html, 'modal-lg');
}

// ══════════════════════════════════════════════════
//  CUSTOMERS
// ══════════════════════════════════════════════════
function renderCustomers(c) {
    const customers = getAllRecords('customers');
    c.innerHTML = `
    <div class="table-toolbar">
        <div class="table-search"><input placeholder="🔍 بحث بالاسم أو الهاتف..." oninput="filterCustomers(this.value)"></div>
        <button class="btn btn-primary" onclick="openCustomerForm()">➕ إضافة عميل</button>
        <button class="btn btn-ghost" onclick="exportCustomersCSV()">📥 تصدير</button>
    </div>
    <div class="table-container">
        <table class="data-table"><thead><tr>
            <th>الاسم</th><th>الهاتف</th><th>البريد</th><th>العنوان</th><th>النوع</th><th>الرصيد</th><th>إجراءات</th>
        </tr></thead><tbody id="cust-tbody"></tbody></table>
    </div>`;
    renderCustRows(customers);
}

function renderCustRows(customers) {
    const tbody = $('cust-tbody');
    if (!tbody) return;
    tbody.innerHTML = customers.map(c => `<tr>
        <td><strong>${c.name}</strong>${c.notes ? `<br><span style="font-size:11px;color:var(--text-muted)">${c.notes}</span>` : ''}</td>
        <td>${c.phone || '-'}</td><td>${c.email || '-'}</td><td>${c.address || '-'}</td>
        <td><span class="badge ${c.type === 'wholesale' ? 'badge-purple' : 'badge-blue'}">${c.type === 'wholesale' ? 'جملة' : 'قطاعي'}</span></td>
        <td>${c.balance ? `<span style="color:var(--red)">${fmt(c.balance)}</span>` : '<span style="color:var(--green)">0</span>'}</td>
        <td><div class="action-row">
            <button class="action-btn view" onclick="viewCustomerHistory('${c.id}')" title="السجل">📋</button>
            <button class="action-btn edit" onclick="openCustomerForm('${c.id}')" title="تعديل">✏️</button>
            <button class="action-btn delete" onclick="deleteCust('${c.id}')" title="حذف">🗑️</button>
        </div></td>
    </tr>`).join('');
}

function filterCustomers(q) {
    const all = getAllRecords('customers');
    const f = q ? all.filter(c => c.name.includes(q) || (c.phone || '').includes(q)) : all;
    renderCustRows(f);
}

function openCustomerForm(id) {
    const c = id ? getRecord('customers', id) : null;
    let html = `<div class="modal-header"><div class="modal-title">${c ? 'تعديل عميل' : 'إضافة عميل جديد'}</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
        <div class="form-row"><div class="form-group"><label class="form-label">اسم العميل *</label><input class="form-input" id="cf-name" value="${c ? c.name : ''}"></div>
        <div class="form-group"><label class="form-label">رقم الهاتف</label><input class="form-input" id="cf-phone" value="${c ? c.phone : ''}"></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">البريد الإلكتروني</label><input class="form-input" id="cf-email" value="${c ? c.email : ''}"></div>
        <div class="form-group"><label class="form-label">العنوان</label><input class="form-input" id="cf-address" value="${c ? c.address : ''}"></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">النوع</label><select class="form-select" id="cf-type"><option value="retail" ${c && c.type === 'retail' ? 'selected' : ''}>قطاعي</option><option value="wholesale" ${c && c.type === 'wholesale' ? 'selected' : ''}>جملة</option></select></div>
        <div class="form-group"><label class="form-label">الرصيد المستحق</label><input type="number" class="form-input" id="cf-balance" value="${c ? c.balance : 0}" min="0" step="0.01"></div></div>
        <div class="form-group"><label class="form-label">ملاحظات</label><textarea class="form-textarea" id="cf-notes">${c ? c.notes : ''}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-primary" onclick="saveCustomer('${id || ''}')">${c ? 'حفظ' : 'إضافة'}</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button></div>`;
    openModal(html);
}

function saveCustomer(id) {
    const name = $('cf-name').value.trim();
    if (!name) { toast('اسم العميل مطلوب', 'error'); return; }
    const data = { name, phone: $('cf-phone').value.trim(), email: $('cf-email').value.trim(), address: $('cf-address').value.trim(), type: $('cf-type').value, balance: parseFloat($('cf-balance').value) || 0, notes: $('cf-notes').value.trim() };
    if (id) { updateRecord('customers', id, data); toast('تم تعديل العميل'); }
    else { addRecord('customers', data); toast('تم إضافة العميل'); }
    closeModal(); renderScreen();
}

function deleteCust(id) {
    confirmAction('هل أنت متأكد من حذف هذا العميل؟', () => {
        deleteRecord('customers', id);
        toast('تم حذف العميل', 'warning');
        renderScreen();
    });
}

function viewCustomerHistory(id) {
    const c = getRecord('customers', id);
    if (!c) return;
    const sales = getAllRecords('sales').filter(s => s.customerId === id);
    const totalSpent = sales.reduce((s, v) => s + (v.total || 0), 0);
    let html = `<div class="modal-header"><div class="modal-title">📋 سجل العميل: ${c.name}</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
        <div class="stats-grid" style="margin-bottom:16px">
            <div class="stat-card accent"><div class="stat-icon accent">💰</div><div class="stat-value">${fmt(totalSpent)}</div><div class="stat-label">إجمالي المشتريات</div></div>
            <div class="stat-card blue"><div class="stat-icon blue">🧾</div><div class="stat-value">${sales.length}</div><div class="stat-label">عدد الفواتير</div></div>
        </div>
        ${sales.length ? `<table class="data-table"><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الإجمالي</th></tr></thead><tbody>
        ${sales.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20).map(s => `<tr><td>${s.invoiceNumber}</td><td>${fmtDate(s.date)}</td><td>${fmt(s.total)}</td></tr>`).join('')}
        </tbody></table>` : '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">لا توجد فواتير بعد</div></div>'}
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">إغلاق</button></div>`;
    openModal(html, 'modal-lg');
}

function exportCustomersCSV() {
    const data = getAllRecords('customers').map(c => ({ الاسم: c.name, الهاتف: c.phone, البريد: c.email, العنوان: c.address, النوع: c.type === 'wholesale' ? 'جملة' : 'قطاعي', الرصيد: c.balance }));
    exportToCSV(data, 'customers_' + new Date().toISOString().split('T')[0]);
    toast('تم تصدير العملاء');
}

// ══════════════════════════════════════════════════
//  SUPPLIERS
// ══════════════════════════════════════════════════
function renderSuppliers(c) {
    const suppliers = getAllRecords('suppliers');
    c.innerHTML = `
    <div class="table-toolbar">
        <div class="table-search"><input placeholder="🔍 بحث..." oninput="filterSuppliers(this.value)"></div>
        <button class="btn btn-primary" onclick="openSupplierForm()">➕ إضافة مورد</button>
    </div>
    <div class="table-container">
        <table class="data-table"><thead><tr>
            <th>الاسم</th><th>الهاتف</th><th>البريد</th><th>العنوان</th><th>الرصيد</th><th>ملاحظات</th><th>إجراءات</th>
        </tr></thead><tbody id="supp-tbody"></tbody></table>
    </div>`;
    renderSuppRows(suppliers);
}

function renderSuppRows(suppliers) {
    const tbody = $('supp-tbody');
    if (!tbody) return;
    tbody.innerHTML = suppliers.map(s => `<tr>
        <td><strong>${s.name}</strong></td>
        <td>${s.phone || '-'}</td><td>${s.email || '-'}</td><td>${s.address || '-'}</td>
        <td>${s.balance ? `<span style="color:var(--yellow)">${fmt(s.balance)}</span>` : '<span style="color:var(--green)">0</span>'}</td>
        <td style="color:var(--text-muted);font-size:12px">${s.notes || '-'}</td>
        <td><div class="action-row">
            <button class="action-btn edit" onclick="openSupplierForm('${s.id}')" title="تعديل">✏️</button>
            <button class="action-btn delete" onclick="deleteSupp('${s.id}')" title="حذف">🗑️</button>
        </div></td>
    </tr>`).join('');
}

function filterSuppliers(q) {
    const all = getAllRecords('suppliers');
    renderSuppRows(q ? all.filter(s => s.name.includes(q) || (s.phone || '').includes(q)) : all);
}

function openSupplierForm(id) {
    const s = id ? getRecord('suppliers', id) : null;
    let html = `<div class="modal-header"><div class="modal-title">${s ? 'تعديل مورد' : 'إضافة مورد جديد'}</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
        <div class="form-row"><div class="form-group"><label class="form-label">اسم المورد *</label><input class="form-input" id="sf2-name" value="${s ? s.name : ''}"></div>
        <div class="form-group"><label class="form-label">الهاتف</label><input class="form-input" id="sf2-phone" value="${s ? s.phone : ''}"></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">البريد</label><input class="form-input" id="sf2-email" value="${s ? s.email : ''}"></div>
        <div class="form-group"><label class="form-label">العنوان</label><input class="form-input" id="sf2-address" value="${s ? s.address : ''}"></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">الرصيد المستحق</label><input type="number" class="form-input" id="sf2-balance" value="${s ? s.balance : 0}" min="0"></div>
        <div class="form-group"><label class="form-label">ملاحظات</label><input class="form-input" id="sf2-notes" value="${s ? s.notes : ''}"></div></div>
    </div>
    <div class="modal-footer"><button class="btn btn-primary" onclick="saveSupplier('${id || ''}')">${s ? 'حفظ' : 'إضافة'}</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button></div>`;
    openModal(html);
}

function saveSupplier(id) {
    const name = $('sf2-name').value.trim();
    if (!name) { toast('اسم المورد مطلوب', 'error'); return; }
    const data = { name, phone: $('sf2-phone').value.trim(), email: $('sf2-email').value.trim(), address: $('sf2-address').value.trim(), balance: parseFloat($('sf2-balance').value) || 0, notes: $('sf2-notes').value.trim() };
    if (id) { updateRecord('suppliers', id, data); toast('تم تعديل المورد'); }
    else { addRecord('suppliers', data); toast('تم إضافة المورد'); }
    closeModal(); renderScreen();
}

function deleteSupp(id) {
    confirmAction('هل أنت متأكد من حذف هذا المورد؟', () => {
        deleteRecord('suppliers', id);
        toast('تم حذف المورد', 'warning');
        renderScreen();
    });
}

// ══════════════════════════════════════════════════
//  BARCODE SCANNER
// ══════════════════════════════════════════════════
function addByBarcode(barcode) {
    if (!barcode || !barcode.trim()) return;
    barcode = barcode.trim();
    const products = getAllRecords('products');
    const p = products.find(pr => pr.barcode === barcode || pr.code === barcode);
    if (!p) {
        toast('❌ لم يتم العثور على صنف بهذا الباركود: ' + barcode, 'error');
        return;
    }
    const price = APP.salePriceType === 'wholesale' ? p.wholesalePrice : p.retailPrice;
    const existing = APP.saleItems.find(i => i.productId === p.id);
    if (existing) { existing.qty += 1; }
    else { APP.saleItems.push({ productId: p.id, name: p.name, qty: 1, price, costPrice: p.costPrice }); }
    updateSaleItems();
    toast('✅ تم إضافة: ' + p.name);
    const input = $('sf-barcode');
    if (input) { input.value = ''; input.focus(); }
}

// ══════════════════════════════════════════════════
//  RETURNS (المرتجعات)
// ══════════════════════════════════════════════════
function renderReturns(c) {
    const returns = getAllRecords('returns') || [];
    c.innerHTML = `
    <div class="table-toolbar">
        <div class="table-search"><input placeholder="🔍 بحث برقم المرتجع أو الفاتورة..." oninput="filterReturns(this.value)"></div>
        <button class="btn btn-primary" onclick="openReturnForm()">🔄 إنشاء مرتجع جديد</button>
    </div>
    <div class="quick-stats">
        <div class="quick-stat">إجمالي المرتجعات: <strong>${returns.length}</strong></div>
        <div class="quick-stat" style="color:var(--red)">قيمة المرتجعات: <strong>${fmt(returns.reduce((s, r) => s + (r.refundTotal || 0), 0))}</strong></div>
    </div>
    <div class="table-container">
        <table class="data-table"><thead><tr>
            <th>رقم المرتجع</th><th>التاريخ</th><th>فاتورة المبيعات</th><th>العميل</th><th>الأصناف</th><th>المبلغ المسترد</th><th>السبب</th><th>إجراءات</th>
        </tr></thead><tbody id="returns-tbody"></tbody></table>
    </div>`;
    renderReturnRows(returns);
}

function renderReturnRows(returns) {
    const tbody = $('returns-tbody');
    if (!tbody) return;
    tbody.innerHTML = returns.sort((a, b) => new Date(b.date) - new Date(a.date)).map(r => `<tr>
        <td><strong style="color:var(--orange)">${r.returnNumber}</strong></td>
        <td>${fmtDate(r.date)}</td>
        <td><span style="color:var(--accent)">${r.invoiceNumber || '-'}</span></td>
        <td>${r.customerName || 'عميل نقدي'}</td>
        <td>${(r.items || []).length} صنف</td>
        <td><strong style="color:var(--red)">${fmt(r.refundTotal)}</strong></td>
        <td><span class="badge badge-yellow">${r.reason || '-'}</span></td>
        <td><button class="action-btn view" onclick="viewReturn('${r.id}')" title="عرض">👁️</button></td>
    </tr>`).join('');
}

function filterReturns(q) {
    const all = getAllRecords('returns') || [];
    const f = q ? all.filter(r => (r.returnNumber || '').includes(q) || (r.invoiceNumber || '').includes(q)) : all;
    renderReturnRows(f);
}

function openReturnForm() {
    const sales = getAllRecords('sales');
    APP.returnItems = [];
    APP.returnSaleId = '';

    let html = `<div class="modal-header"><div class="modal-title">🔄 إنشاء مرتجع جديد</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
        <div class="form-group"><label class="form-label">اختر فاتورة المبيعات المرتبطة</label>
            <select class="form-select" id="rf-sale" onchange="loadReturnSaleItems(this.value)">
                <option value="">-- اختر فاتورة --</option>
                ${sales.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50).map(s => `<option value="${s.id}">${s.invoiceNumber} — ${s.customerName} — ${fmt(s.total)}</option>`).join('')}
            </select>
        </div>
        <div id="rf-items-container"></div>
        <div class="form-group"><label class="form-label">سبب المرتجع</label>
            <select class="form-select" id="rf-reason">
                <option value="عيب في المنتج">عيب في المنتج</option>
                <option value="خطأ في الطلب">خطأ في الطلب</option>
                <option value="تغيير رأي العميل">تغيير رأي العميل</option>
                <option value="منتج تالف">منتج تالف</option>
                <option value="أخرى">أخرى</option>
            </select>
        </div>
        <div class="form-group"><label class="form-label">ملاحظات</label><textarea class="form-textarea" id="rf-notes" placeholder="تفاصيل إضافية..."></textarea></div>
        <div class="invoice-totals" id="rf-totals"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-danger btn-lg" onclick="saveReturn()">💾 تسجيل المرتجع</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button></div>`;
    openModal(html, 'modal-xl');
}

function loadReturnSaleItems(saleId) {
    APP.returnSaleId = saleId;
    APP.returnItems = [];
    const container = $('rf-items-container');
    if (!saleId || !container) { if (container) container.innerHTML = ''; return; }
    const sale = getRecord('sales', saleId);
    if (!sale) return;

    container.innerHTML = `<div class="form-label" style="margin-bottom:8px;font-weight:700">اختر الأصناف المرتجعة والكمية:</div>
    <table class="invoice-items-table"><thead><tr><th>✓</th><th>الصنف</th><th>الكمية المباعة</th><th>كمية المرتجع</th><th>السعر</th></tr></thead><tbody>
    ${sale.items.map((it, i) => `<tr>
        <td><input type="checkbox" id="rf-chk-${i}" onchange="toggleReturnItem(${i})"></td>
        <td>${it.name}</td><td>${it.qty}</td>
        <td><input type="number" class="form-input" id="rf-qty-${i}" value="0" min="0" max="${it.qty}" style="width:80px" onchange="updateReturnTotals()" disabled></td>
        <td>${fmt(it.price)}</td>
    </tr>`).join('')}
    </tbody></table>`;
    updateReturnTotals();
}

function toggleReturnItem(idx) {
    const chk = $('rf-chk-' + idx);
    const qtyInput = $('rf-qty-' + idx);
    if (chk && qtyInput) {
        qtyInput.disabled = !chk.checked;
        if (chk.checked) qtyInput.value = qtyInput.max;
        else qtyInput.value = 0;
    }
    updateReturnTotals();
}

function updateReturnTotals() {
    const sale = APP.returnSaleId ? getRecord('sales', APP.returnSaleId) : null;
    if (!sale) return;
    let refund = 0;
    APP.returnItems = [];
    sale.items.forEach((it, i) => {
        const chk = $('rf-chk-' + i);
        const qty = parseInt($('rf-qty-' + i)?.value) || 0;
        if (chk && chk.checked && qty > 0) {
            refund += it.price * qty;
            APP.returnItems.push({ ...it, returnQty: qty });
        }
    });
    const el = $('rf-totals');
    if (el) el.innerHTML = `<div class="invoice-total-row grand"><span>المبلغ المسترد</span><span style="color:var(--red)">${fmt(refund)}</span></div>`;
}

function saveReturn() {
    if (APP.returnItems.length === 0) { toast('اختر صنف واحد على الأقل', 'error'); return; }
    const sale = getRecord('sales', APP.returnSaleId);
    const refundTotal = APP.returnItems.reduce((s, it) => s + it.price * it.returnQty, 0);
    const returnsCount = (getAllRecords('returns') || []).length;

    const ret = {
        returnNumber: 'RET-' + String(returnsCount + 1).padStart(4, '0'),
        date: new Date().toISOString(),
        saleId: APP.returnSaleId,
        invoiceNumber: sale ? sale.invoiceNumber : '',
        customerName: sale ? sale.customerName : '',
        customerId: sale ? sale.customerId : null,
        items: APP.returnItems.map(it => ({ productId: it.productId, name: it.name, returnQty: it.returnQty, price: it.price })),
        refundTotal,
        reason: $('rf-reason').value,
        notes: $('rf-notes').value.trim(),
        status: 'completed'
    };
    addRecord('returns', ret);

    // Return stock to warehouse
    const whId = sale ? sale.warehouseId : (getAllRecords('warehouses')[0]?.id || '');
    APP.returnItems.forEach(it => {
        adjustStock(it.productId, whId, it.returnQty, 'in', ret.returnNumber);
    });

    closeModal();
    toast('✅ تم تسجيل المرتجع ' + ret.returnNumber);
    renderScreen();
}

function viewReturn(id) {
    const r = getRecord('returns', id);
    if (!r) return;
    let html = `<div class="modal-header"><div class="modal-title">🔄 مرتجع ${r.returnNumber}</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
        <div style="margin-bottom:12px">فاتورة المبيعات: <strong style="color:var(--accent)">${r.invoiceNumber}</strong> | العميل: <strong>${r.customerName}</strong></div>
        <div style="margin-bottom:12px">التاريخ: ${fmtDateTime(r.date)} | السبب: <span class="badge badge-yellow">${r.reason}</span></div>
        <table class="invoice-items-table"><thead><tr><th>الصنف</th><th>الكمية المرتجعة</th><th>السعر</th><th>المبلغ</th></tr></thead><tbody>
        ${r.items.map(it => `<tr><td>${it.name}</td><td>${it.returnQty}</td><td>${fmt(it.price)}</td><td>${fmt(it.price * it.returnQty)}</td></tr>`).join('')}
        </tbody></table>
        <div class="invoice-totals"><div class="invoice-total-row grand"><span>المبلغ المسترد</span><span style="color:var(--red)">${fmt(r.refundTotal)}</span></div></div>
        ${r.notes ? `<div style="margin-top:12px;color:var(--text-muted)">ملاحظات: ${r.notes}</div>` : ''}
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">إغلاق</button></div>`;
    openModal(html, 'modal-lg');
}

// ══════════════════════════════════════════════════
//  DAMAGED STOCK (التالف)
// ══════════════════════════════════════════════════
function renderDamaged(c) {
    const damaged = getAllRecords('damaged') || [];
    const products = getAllRecords('products');
    c.innerHTML = `
    <div class="table-toolbar">
        <div class="table-search"><input placeholder="🔍 بحث..." oninput="filterDamaged(this.value)"></div>
        <button class="btn btn-danger" onclick="openDamagedForm()">💔 تسجيل تالف جديد</button>
    </div>
    <div class="quick-stats">
        <div class="quick-stat">إجمالي سجلات التالف: <strong>${damaged.length}</strong></div>
        <div class="quick-stat" style="color:var(--red)">إجمالي الخسائر: <strong>${fmt(damaged.reduce((s, d) => s + (d.totalLoss || 0), 0))}</strong></div>
        <div class="quick-stat" style="color:var(--yellow)">إجمالي القطع التالفة: <strong>${damaged.reduce((s, d) => s + (d.qty || 0), 0)}</strong></div>
    </div>
    <div class="table-container">
        <table class="data-table"><thead><tr>
            <th>رقم السجل</th><th>التاريخ</th><th>الصنف</th><th>الكمية</th><th>المخزن</th><th>سعر الوحدة</th><th>إجمالي الخسارة</th><th>السبب</th><th>إجراءات</th>
        </tr></thead><tbody id="damaged-tbody"></tbody></table>
    </div>`;
    renderDamagedRows(damaged);
}

function renderDamagedRows(damaged) {
    const tbody = $('damaged-tbody');
    if (!tbody) return;
    tbody.innerHTML = damaged.sort((a, b) => new Date(b.date) - new Date(a.date)).map(d => `<tr>
        <td><strong style="color:var(--red)">${d.damageNumber}</strong></td>
        <td>${fmtDate(d.date)}</td>
        <td><strong>${d.productName}</strong></td>
        <td>${d.qty}</td>
        <td>${d.warehouseName || '-'}</td>
        <td>${fmt(d.unitCost)}</td>
        <td><strong style="color:var(--red)">${fmt(d.totalLoss)}</strong></td>
        <td><span class="badge badge-red">${d.reason || '-'}</span></td>
        <td><button class="action-btn delete" onclick="deleteDamaged('${d.id}')" title="حذف">🗑️</button></td>
    </tr>`).join('');
}

function filterDamaged(q) {
    const all = getAllRecords('damaged') || [];
    const f = q ? all.filter(d => (d.damageNumber || '').includes(q) || (d.productName || '').includes(q)) : all;
    renderDamagedRows(f);
}

function openDamagedForm() {
    const products = getAllRecords('products');
    const warehouses = getAllRecords('warehouses');

    let html = `<div class="modal-header"><div class="modal-title">💔 تسجيل صنف تالف</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
        <div class="form-row">
            <div class="form-group"><label class="form-label">الصنف *</label>
                <select class="form-select" id="df-product" onchange="updateDamagedCost()">
                    ${products.map(p => `<option value="${p.id}" data-cost="${p.costPrice}">${p.name} (${p.code})</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label class="form-label">المخزن</label>
                <select class="form-select" id="df-wh">${warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}</select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">الكمية التالفة *</label><input type="number" class="form-input" id="df-qty" value="1" min="1" onchange="updateDamagedCost()"></div>
            <div class="form-group"><label class="form-label">سعر الوحدة (تكلفة)</label><input type="number" class="form-input" id="df-cost" value="0" min="0" step="0.01"></div>
        </div>
        <div class="form-group"><label class="form-label">سبب التلف</label>
            <select class="form-select" id="df-reason">
                <option value="انتهاء الصلاحية">📅 انتهاء الصلاحية</option>
                <option value="كسر أثناء النقل">📦 كسر أثناء النقل</option>
                <option value="تلف بسبب التخزين">🏭 تلف بسبب التخزين</option>
                <option value="حريق أو كارثة">🔥 حريق أو كارثة</option>
                <option value="عيب مصنعي">⚠️ عيب مصنعي</option>
                <option value="أخرى">أخرى</option>
            </select>
        </div>
        <div class="form-group"><label class="form-label">ملاحظات</label><textarea class="form-textarea" id="df-notes" placeholder="وصف التلف..."></textarea></div>
        <div class="invoice-totals" id="df-totals"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-danger btn-lg" onclick="saveDamaged()">💾 تسجيل التالف</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button></div>`;
    openModal(html);
    updateDamagedCost();
}

function updateDamagedCost() {
    const sel = $('df-product');
    if (!sel) return;
    const cost = parseFloat(sel.options[sel.selectedIndex]?.dataset.cost) || 0;
    $('df-cost').value = cost;
    const qty = parseInt($('df-qty')?.value) || 1;
    const el = $('df-totals');
    if (el) el.innerHTML = `<div class="invoice-total-row grand"><span>إجمالي الخسارة</span><span style="color:var(--red)">${fmt(cost * qty)}</span></div>`;
}

function saveDamaged() {
    const pid = $('df-product').value;
    const p = getRecord('products', pid);
    if (!p) { toast('اختر صنف', 'error'); return; }
    const qty = parseInt($('df-qty').value) || 0;
    if (qty <= 0) { toast('أدخل كمية صحيحة', 'error'); return; }
    const cost = parseFloat($('df-cost').value) || 0;
    const whId = $('df-wh').value;
    const wh = getRecord('warehouses', whId);
    const damagedCount = (getAllRecords('damaged') || []).length;

    const dmg = {
        damageNumber: 'DMG-' + String(damagedCount + 1).padStart(4, '0'),
        date: new Date().toISOString(),
        productId: pid, productName: p.name,
        qty, unitCost: cost, totalLoss: cost * qty,
        warehouseId: whId, warehouseName: wh ? wh.name : '',
        reason: $('df-reason').value,
        notes: $('df-notes').value.trim()
    };
    addRecord('damaged', dmg);

    // Decrease stock
    adjustStock(pid, whId, -qty, 'damaged', dmg.damageNumber);

    closeModal();
    toast('💔 تم تسجيل تالف — ' + p.name + ' × ' + qty, 'warning');
    renderScreen();
}

function deleteDamaged(id) {
    confirmAction('هل أنت متأكد من حذف هذا السجل؟', () => {
        deleteRecord('damaged', id);
        toast('تم حذف السجل', 'warning');
        renderScreen();
    });
}

// ══════════════════════════════════════════════════
//  EXPENSES (المصاريف)
// ══════════════════════════════════════════════════
const EXPENSE_CATS = [
    { id: 'rent', name: 'إيجار', icon: '🏠', color: '#3b82f6' },
    { id: 'salaries', name: 'رواتب', icon: '👥', color: '#a855f7' },
    { id: 'utilities', name: 'كهرباء ومياه', icon: '💡', color: '#f59e0b' },
    { id: 'transport', name: 'نقل ومواصلات', icon: '🚚', color: '#06b6d4' },
    { id: 'maintenance', name: 'صيانة', icon: '🔧', color: '#ef4444' },
    { id: 'operations', name: 'مصاريف تشغيل', icon: '⚙️', color: '#22c55e' },
    { id: 'other', name: 'أخرى', icon: '📋', color: '#64748b' },
];

APP.expSearch = '';
APP.expCatFilter = 'all';

function renderExpenses(c) {
    const expenses = getAllRecords('expenses') || [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthExpenses = expenses.filter(e => new Date(e.date) >= monthStart);
    const totalMonth = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const totalAll = expenses.reduce((s, e) => s + (e.amount || 0), 0);

    c.innerHTML = `
    <div class="table-toolbar">
        <div class="table-search"><input type="text" placeholder="🔍 بحث بالوصف أو التصنيف..." oninput="filterExpenses(this.value)"></div>
        <div class="table-filters">
            <button class="filter-chip ${APP.expCatFilter === 'all' ? 'active' : ''}" onclick="filterExpCat('all',this)">الكل</button>
            ${EXPENSE_CATS.map(cat => `<button class="filter-chip ${APP.expCatFilter === cat.id ? 'active' : ''}" onclick="filterExpCat('${cat.id}',this)">${cat.icon} ${cat.name}</button>`).join('')}
        </div>
        ${!isReadOnly() ? '<button class="btn btn-primary" onclick="openExpenseForm()">➕ إضافة مصروف</button>' : ''}
        <button class="btn btn-ghost" onclick="exportExpensesCSV()">📥 تصدير</button>
    </div>
    <div class="quick-stats">
        <div class="quick-stat">إجمالي الشهر: <strong style="color:var(--red)">${fmt(totalMonth)}</strong></div>
        <div class="quick-stat">عدد المصاريف: <strong>${monthExpenses.length}</strong></div>
        <div class="quick-stat">إجمالي الكل: <strong>${fmt(totalAll)}</strong></div>
    </div>
    <div class="table-container">
        <table class="data-table"><thead><tr>
            <th>التاريخ</th><th>التصنيف</th><th>الوصف</th><th>المبلغ</th><th>ملاحظات</th><th>إجراءات</th>
        </tr></thead><tbody id="exp-tbody"></tbody></table>
    </div>`;
    renderExpRows(expenses);
}

function renderExpRows(expenses) {
    let filtered = expenses;
    if (APP.expCatFilter !== 'all') filtered = filtered.filter(e => e.category === APP.expCatFilter);
    if (APP.expSearch) {
        const q = APP.expSearch.toLowerCase();
        filtered = filtered.filter(e => (e.description || '').toLowerCase().includes(q) || (e.category || '').includes(q));
    }
    const tbody = $('exp-tbody');
    if (!tbody) return;
    tbody.innerHTML = filtered.sort((a, b) => new Date(b.date) - new Date(a.date)).map(e => {
        const cat = EXPENSE_CATS.find(c => c.id === e.category) || EXPENSE_CATS[6];
        return `<tr>
            <td>${fmtDate(e.date)}</td>
            <td><span class="badge" style="background:${cat.color}20;color:${cat.color}">${cat.icon} ${cat.name}</span></td>
            <td><strong>${e.description || '-'}</strong></td>
            <td><strong style="color:var(--red)">${fmt(e.amount)}</strong></td>
            <td style="color:var(--text-muted);font-size:12px">${e.notes || '-'}</td>
            <td><div class="action-row">
                ${!isReadOnly() ? `<button class="action-btn edit" onclick="openExpenseForm('${e.id}')" title="تعديل">✏️</button>
                <button class="action-btn delete" onclick="deleteExpense('${e.id}')" title="حذف">🗑️</button>` : ''}
            </div></td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px">لا توجد مصاريف بعد</td></tr>';
}

function filterExpenses(q) { APP.expSearch = q; renderExpRows(getAllRecords('expenses') || []); }
function filterExpCat(catId, el) {
    APP.expCatFilter = catId;
    document.querySelectorAll('.table-filters .filter-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    renderExpRows(getAllRecords('expenses') || []);
}

function openExpenseForm(id) {
    const e = id ? getRecord('expenses', id) : null;
    const title = e ? 'تعديل مصروف' : 'إضافة مصروف جديد';
    let html = `<div class="modal-header"><div class="modal-title">${title}</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
        <div class="form-row">
            <div class="form-group"><label class="form-label">التصنيف</label>
                <select class="form-select" id="ef-cat">
                    ${EXPENSE_CATS.map(cat => `<option value="${cat.id}" ${e && e.category === cat.id ? 'selected' : ''}>${cat.icon} ${cat.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label class="form-label">المبلغ *</label><input type="number" class="form-input" id="ef-amount" value="${e ? e.amount : ''}" min="0" step="0.01" placeholder="0.00"></div>
        </div>
        <div class="form-group"><label class="form-label">الوصف *</label><input class="form-input" id="ef-desc" value="${e ? e.description : ''}" placeholder="مثال: إيجار شهر فبراير"></div>
        <div class="form-group"><label class="form-label">التاريخ</label><input type="date" class="form-input" id="ef-date" value="${e ? e.date?.split('T')[0] : new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label class="form-label">ملاحظات</label><textarea class="form-textarea" id="ef-notes" placeholder="تفاصيل إضافية...">${e ? e.notes : ''}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-primary" onclick="saveExpense('${id || ''}')">${e ? 'حفظ التعديلات' : 'إضافة المصروف'}</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button></div>`;
    openModal(html);
}

function saveExpense(id) {
    const desc = $('ef-desc').value.trim();
    const amount = parseFloat($('ef-amount').value);
    if (!desc) { toast('الوصف مطلوب', 'error'); return; }
    if (!amount || amount <= 0) { toast('أدخل مبلغ صحيح', 'error'); return; }
    const data = {
        category: $('ef-cat').value,
        description: desc,
        amount,
        date: $('ef-date').value ? new Date($('ef-date').value).toISOString() : new Date().toISOString(),
        notes: $('ef-notes').value.trim(),
    };
    if (id) { updateRecord('expenses', id, data); toast('تم تعديل المصروف'); }
    else { addRecord('expenses', data); toast('✅ تم إضافة المصروف'); }
    closeModal(); renderScreen();
}

function deleteExpense(id) {
    confirmAction('هل أنت متأكد من حذف هذا المصروف؟', () => {
        deleteRecord('expenses', id);
        toast('تم حذف المصروف', 'warning');
        renderScreen();
    });
}

function exportExpensesCSV() {
    const data = (getAllRecords('expenses') || []).map(e => {
        const cat = EXPENSE_CATS.find(c => c.id === e.category);
        return { التاريخ: e.date?.split('T')[0], التصنيف: cat ? cat.name : e.category, الوصف: e.description, المبلغ: e.amount, ملاحظات: e.notes };
    });
    exportToCSV(data, 'expenses_' + new Date().toISOString().split('T')[0]);
    toast('تم تصدير المصاريف');
}

// ══════════════════════════════════════════════════
//  REPORTS
// ══════════════════════════════════════════════════
APP.reportPeriod = 'month';

function renderReports(c) {
    const period = APP.reportPeriod;
    const sales = getSalesByPeriod(period);
    const totalRevenue = sales.reduce((s, v) => s + (v.total || 0), 0);
    const totalCost = sales.reduce((s, v) => s + v.items.reduce((ss, it) => ss + (it.costPrice || 0) * it.qty, 0), 0);
    const totalProfit = totalRevenue - totalCost;
    const totalItems = sales.reduce((s, v) => s + v.items.reduce((ss, it) => ss + it.qty, 0), 0);

    c.innerHTML = `
    <div class="table-toolbar">
        <div class="table-filters">
            ${['today', 'week', 'month', 'year'].map(p => `<button class="filter-chip ${period === p ? 'active' : ''}" onclick="APP.reportPeriod='${p}';renderScreen()">${{ today: 'اليوم', week: 'الأسبوع', month: 'الشهر', year: 'السنة' }[p]}</button>`).join('')}
        </div>
        <button class="btn btn-ghost" onclick="exportReportCSV()">📥 تصدير التقرير</button>
    </div>
    <div class="stats-grid">
        <div class="stat-card accent"><div class="stat-icon accent">💰</div><div class="stat-value">${fmt(totalRevenue)}</div><div class="stat-label">الإيرادات</div></div>
        <div class="stat-card green"><div class="stat-icon green">📈</div><div class="stat-value">${fmt(totalProfit)}</div><div class="stat-label">صافي الربح</div></div>
        <div class="stat-card blue"><div class="stat-icon blue">🧾</div><div class="stat-value">${fmtN(sales.length)}</div><div class="stat-label">عدد الفواتير</div></div>
        <div class="stat-card purple"><div class="stat-icon purple">📦</div><div class="stat-value">${fmtN(totalItems)}</div><div class="stat-label">قطعة مباعة</div></div>
    </div>
    <div class="dashboard-grid">
        <div class="chart-card"><div class="card-header"><div class="card-title">📊 المبيعات اليومية</div></div><canvas id="rpt-chart-daily"></canvas></div>
        <div class="chart-card"><div class="card-header"><div class="card-title">🏆 ربح كل صنف</div></div><canvas id="rpt-chart-products"></canvas></div>
        <div class="card"><div class="card-header"><div class="card-title">⭐ أفضل العملاء</div></div>
            <div class="table-container"><table class="data-table"><thead><tr><th>#</th><th>العميل</th><th>إجمالي المشتريات</th></tr></thead><tbody>
            ${getTopCustomers(10).map((tc, i) => `<tr><td>${i + 1}</td><td><strong>${tc.name}</strong></td><td>${fmt(tc.total)}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">لا توجد بيانات</td></tr>'}
            </tbody></table></div>
        </div>
        <div class="card"><div class="card-header"><div class="card-title">📦 حركة المخزون</div></div>
            <div class="table-container"><table class="data-table"><thead><tr><th>الصنف</th><th>الكمية المباعة</th><th>الإيراد</th><th>التكلفة</th><th>الربح</th></tr></thead><tbody>
            ${getProfitByProduct().slice(0, 15).map(p => `<tr><td>${p.name}</td><td>${p.qty}</td><td>${fmt(p.revenue)}</td><td>${fmt(p.cost)}</td><td style="color:${p.profit >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(p.profit)}</td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">لا توجد بيانات</td></tr>'}
            </tbody></table></div>
        </div>
    </div>`;

    setTimeout(() => {
        const isDark = document.body.dataset.theme === 'dark';
        const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        const textColor = isDark ? '#8ba3bc' : '#44596e';
        const days = period === 'today' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 365;
        const daily = getDailySales(Math.min(days, 60));

        if (APP.charts.rptDaily) APP.charts.rptDaily.destroy();
        const ctx1 = $('rpt-chart-daily');
        if (ctx1) APP.charts.rptDaily = new Chart(ctx1, {
            type: 'bar', data: { labels: daily.map(d => d.date.slice(5)), datasets: [{ label: 'المبيعات', data: daily.map(d => d.total), backgroundColor: 'rgba(14,165,160,0.6)', borderColor: '#0ea5a0', borderWidth: 1, borderRadius: 4 }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: textColor, maxTicksLimit: 15 }, grid: { color: gridColor } }, y: { ticks: { color: textColor }, grid: { color: gridColor } } } }
        });

        const profitData = getProfitByProduct().slice(0, 8);
        if (APP.charts.rptProducts) APP.charts.rptProducts.destroy();
        const ctx2 = $('rpt-chart-products');
        if (ctx2) APP.charts.rptProducts = new Chart(ctx2, {
            type: 'doughnut', data: { labels: profitData.map(p => p.name.slice(0, 12)), datasets: [{ data: profitData.map(p => Math.max(p.profit, 0)), backgroundColor: ['#0ea5a0', '#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4', '#f97316'] }] },
            options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Cairo', size: 11 } } } } }
        });
    }, 100);
}

function exportReportCSV() {
    const sales = getSalesByPeriod(APP.reportPeriod);
    const data = sales.map(s => ({
        'رقم الفاتورة': s.invoiceNumber, التاريخ: s.date?.split('T')[0], العميل: s.customerName,
        المجموع: s.subtotal, الخصم: s.discount, الضريبة: s.tax, الإجمالي: s.total
    }));
    exportToCSV(data, 'report_' + APP.reportPeriod + '_' + new Date().toISOString().split('T')[0]);
    toast('تم تصدير التقرير');
}

// ══════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════
function renderSettings(c) {
    const s = getSettings();
    const logoPreview = s.logo ? `<img src="${s.logo}" style="max-height:60px;max-width:160px;border-radius:8px;border:1px solid var(--border);object-fit:contain">` : '<span style="color:var(--muted);font-size:12px">لم يتم رفع لوجو</span>';
    c.innerHTML = `
    <div class="settings-grid">
        <div class="settings-section">
            <div class="settings-section-title">🏢 معلومات الشركة</div>
            <div class="form-group"><label class="form-label">اسم الشركة</label><input class="form-input" id="set-company" value="${s.companyName || ''}"></div>
            <div class="form-group"><label class="form-label">رقم الهاتف</label><input class="form-input" id="set-phone" value="${s.phone || ''}"></div>
            <div class="form-group"><label class="form-label">العنوان</label><input class="form-input" id="set-address" value="${s.address || ''}"></div>
            <div class="form-group"><label class="form-label">نص أسفل الفاتورة</label><input class="form-input" id="set-footer" value="${s.receiptFooter || ''}"></div>
            <div class="form-group">
                <label class="form-label">🖼️ لوجو الشركة</label>
                <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                    <div id="logo-preview">${logoPreview}</div>
                    <button class="btn btn-ghost btn-sm" onclick="$('logo-upload').click()">📤 رفع لوجو</button>
                    ${s.logo ? '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="removeLogo()">🗑️ حذف</button>' : ''}
                    <input type="file" id="logo-upload" accept="image/*" style="display:none" onchange="handleLogoUpload(this)">
                </div>
            </div>
        </div>
        <div class="settings-section">
            <div class="settings-section-title">💰 المالية</div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">العملة</label>
                    <select class="form-select" id="set-currency">
                        <option value="EGP" data-sym="ج.م" ${s.currency === 'EGP' ? 'selected' : ''}>جنيه مصري</option>
                        <option value="SAR" data-sym="ر.س" ${s.currency === 'SAR' ? 'selected' : ''}>ريال سعودي</option>
                        <option value="AED" data-sym="د.إ" ${s.currency === 'AED' ? 'selected' : ''}>درهم إماراتي</option>
                        <option value="USD" data-sym="$" ${s.currency === 'USD' ? 'selected' : ''}>دولار أمريكي</option>
                        <option value="EUR" data-sym="€" ${s.currency === 'EUR' ? 'selected' : ''}>يورو</option>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">نسبة الضريبة %</label><input type="number" class="form-input" id="set-tax" value="${s.taxRate}" min="0" max="100"></div>
            </div>
        </div>
        <div class="settings-section">
            <div class="settings-section-title">🎨 المظهر</div>
            <div class="theme-toggle">
                <div class="theme-option ${s.theme === 'dark' ? 'active' : ''}" onclick="setTheme('dark')">🌙 داكن</div>
                <div class="theme-option ${s.theme === 'light' ? 'active' : ''}" onclick="setTheme('light')">☀️ فاتح</div>
            </div>
        </div>
        <div class="settings-section">
            <div class="settings-section-title">🔒 الأمان</div>
            <div class="form-group"><label class="form-label">رمز الدخول (PIN) — 4 أرقام</label><input type="password" class="form-input" id="set-pin" value="${s.pin || ''}" maxlength="4" placeholder="اتركه فارغاً لإلغاء القفل"></div>
            <div class="form-group"><label class="form-label">الصلاحية</label>
                <select class="form-select" id="set-role">
                    <option value="admin" ${s.activeRole === 'admin' ? 'selected' : ''}>👤 مدير — وصول كامل</option>
                    <option value="cashier" ${s.activeRole === 'cashier' ? 'selected' : ''}>💰 كاشير — مبيعات وعملاء فقط</option>
                    <option value="viewer" ${s.activeRole === 'viewer' ? 'selected' : ''}>👁️ مشاهد — تقارير فقط</option>
                </select>
            </div>
        </div>
        <div class="settings-section" style="grid-column:1/-1">
            <div class="settings-section-title">💾 النسخ الاحتياطي</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap">
                <button class="btn btn-primary" onclick="exportDBBackup();toast('تم تصدير النسخة الاحتياطية')">📤 تصدير نسخة احتياطية (JSON)</button>
                <button class="btn btn-ghost" onclick="$('import-file').click()">📥 استيراد نسخة احتياطية</button>
                <input type="file" id="import-file" accept=".json" style="display:none" onchange="handleImport(this)">
                <button class="btn btn-danger" onclick="if(confirm('⚠️ هل أنت متأكد؟ سيتم مسح جميع البيانات!')){resetDB();location.reload();}">🗑️ مسح جميع البيانات</button>
            </div>
        </div>
    </div>
    <div style="margin-top:20px;text-align:center">
        <button class="btn btn-primary btn-lg" onclick="saveAllSettings()">💾 حفظ الإعدادات</button>
    </div>`;
}

function setTheme(theme) {
    document.body.dataset.theme = theme;
    updateSettings({ theme });
    renderScreen();
}

function saveAllSettings() {
    const sel = $('set-currency');
    const sym = sel.options[sel.selectedIndex].dataset.sym;
    updateSettings({
        companyName: $('set-company').value.trim(),
        phone: $('set-phone').value.trim(),
        address: $('set-address').value.trim(),
        receiptFooter: $('set-footer').value.trim(),
        currency: sel.value,
        currencySymbol: sym,
        taxRate: parseFloat($('set-tax').value) || 0,
        pin: $('set-pin').value.trim(),
        activeRole: $('set-role').value
    });
    $('brand-name').textContent = $('set-company').value.trim() || 'OS Communication';
    $('footer-role').textContent = '👤 ' + ($('set-role').value === 'admin' ? 'مدير النظام' : $('set-role').value === 'cashier' ? 'كاشير' : 'مشاهد') + ' | ' + getPlanLabel();
    // Update sidebar logo
    const brandIcon = document.querySelector('.brand-icon');
    const s2 = getSettings();
    if (brandIcon && s2.logo) brandIcon.innerHTML = `<img src="${s2.logo}" style="width:36px;height:36px;border-radius:8px;object-fit:cover">`;
    else if (brandIcon) brandIcon.textContent = '📦';
    toast('✅ تم حفظ الإعدادات بنجاح');
}

function handleLogoUpload(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 500000) { toast('حجم الملف كبير — الحد الأقصى 500 كيلو', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        updateSettings({ logo: e.target.result });
        toast('✅ تم رفع اللوجو');
        renderScreen();
    };
    reader.readAsDataURL(file);
}

function removeLogo() {
    updateSettings({ logo: '' });
    const brandIcon = document.querySelector('.brand-icon');
    if (brandIcon) brandIcon.textContent = '📦';
    toast('تم حذف اللوجو', 'warning');
    renderScreen();
}

function handleImport(input) {
    const file = input.files[0];
    if (!file) return;
    importDBBackup(file).then(() => {
        toast('✅ تم استيراد النسخة الاحتياطية بنجاح');
        setTimeout(() => location.reload(), 1000);
    }).catch(err => toast(err, 'error'));
}

// ══════════════════════════════════════════════════
//  ADMIN LOGIN FOR STOCKPRO
// ══════════════════════════════════════════════════
let currentAdmin = null;

function spAdminLogin() {
    const username = $('sp-login-user').value.trim();
    const password = $('sp-login-pass').value;
    const errEl = $('sp-login-error');
    errEl.textContent = '';

    // Check license expiry on every login
    const expiryCheck = checkLicenseExpiry();
    if (expiryCheck.expired) {
        showExpiredScreen();
        return;
    }

    if (!username || !password) {
        errEl.textContent = '❌ أدخل اسم المستخدم وكلمة المرور';
        return;
    }

    let user = null;
    const serial = getActiveSerial();

    if (serial) {
        // Client mode: check users from THIS client's own database
        const db = loadDB();
        if (!db.users || !db.users.length) {
            // First time: auto-create default users for this client
            const clientInfo = getActiveClient();
            db.users = [
                { id: 'cu1', username: 'admin', password: 'admin123', name: clientInfo?.name || 'مدير', role: 'client_admin' },
                { id: 'cu2', username: 'cashier', password: '1234', name: 'كاشير', role: 'cashier' },
            ];
            saveDB(db);
        }
        user = db.users.find(u => u.username === username && u.password === password);
    }

    // Fallback: check sp_admin_admin_users (for software owner)
    if (!user) {
        const adminUsersRaw = localStorage.getItem('sp_admin_admin_users');
        let adminUsers = adminUsersRaw ? JSON.parse(adminUsersRaw) : [];
        if (!adminUsers.length) {
            adminUsers = [
                { id: 'au1', username: 'admin', password: 'admin123', name: 'مدير النظام', role: 'super_admin' },
            ];
            localStorage.setItem('sp_admin_admin_users', JSON.stringify(adminUsers));
        }
        user = adminUsers.find(u => u.username === username && u.password === password);
    }

    if (!user) {
        errEl.textContent = '❌ بيانات خاطئة — تأكد من اسم المستخدم وكلمة المرور';
        $('sp-login-pass').value = '';
        return;
    }

    currentAdmin = user;
    $('admin-login-screen').classList.add('hidden');

    // Show admin name in header
    const roleLabels = { super_admin: '👑 Super Admin', admin: '🔧 Admin', support: '🎧 Support', client_admin: '👤 مدير', cashier: '💰 كاشير', viewer: '👁️ مشاهد' };
    $('sp-logged-admin').textContent = (roleLabels[user.role] || '👤') + ' — ' + user.name;

    // Hide admin panel button for non-super_admin
    const adminBtn = document.querySelector('[onclick*="admin.html"]');
    if (adminBtn) adminBtn.style.display = (user.role === 'super_admin') ? '' : 'none';

    // Show deactivate serial button for super_admin
    const serialBtn = $('btn-deactivate-serial');
    if (serialBtn) serialBtn.style.display = (user.role === 'super_admin') ? '' : 'none';

    // Hide dashboard from cashier
    if (user.role === 'cashier') {
        const dashNav = document.querySelector('[data-nav="dashboard"]');
        if (dashNav) dashNav.style.display = 'none';
    }

    // Continue with normal app init
    startApp();

    // Start heartbeat for server-side validation
    startHeartbeat();

    // Cashier goes directly to sales screen
    if (user.role === 'cashier') {
        try { navigate('sales'); } catch (e) { }
    }

    toast('✅ مرحباً ' + user.name);
}

function spAdminLogout() {
    currentAdmin = null;
    $('admin-login-screen').classList.remove('hidden');
    $('app').classList.add('hidden');
    $('sp-login-pass').value = '';
    $('sp-login-user').value = '';
    $('sp-login-error').textContent = '';
}

function startApp() {
    const isMaster = localStorage.getItem('sp_is_master') === '1';
    const s = getSettings();
    document.body.dataset.theme = s.theme || 'dark';

    // Master mode: skip onboarding — auto-initialize if needed
    if (!s.onboarded && isMaster) {
        const db = loadDB();
        const clientInfo = getActiveClient();
        db.settings.onboarded = true;
        db.settings.companyName = (clientInfo && clientInfo.company) || 'عرض بيانات العميل';
        saveDB(db);
        // Reload settings after auto-init
        const s2 = getSettings();
        $('onboarding').classList.add('hidden');
        $('app').classList.remove('hidden');
        $('brand-name').textContent = '👑 ' + (s2.companyName || 'OS Communication');
        $('footer-role').textContent = '👤 مالك البرنامج | وضع المراقبة';
        navigate('dashboard');
        return;
    }

    if (!s.onboarded) {
        $('onboarding').classList.remove('hidden');
        $('app').classList.add('hidden');
    } else {
        $('onboarding').classList.add('hidden');
        $('app').classList.remove('hidden');
        $('brand-name').textContent = s.companyName || 'OS Communication';
        $('footer-role').textContent = '👤 ' + (currentAdmin ? currentAdmin.name : (s.activeRole === 'admin' ? 'مدير النظام' : s.activeRole === 'cashier' ? 'كاشير' : 'مشاهد')) + ' | ' + getPlanLabel();

        // Show logo in sidebar if set
        if (s.logo) {
            const brandIcon = document.querySelector('.brand-icon');
            if (brandIcon) brandIcon.innerHTML = `<img src="${s.logo}" style="width:36px;height:36px;border-radius:8px;object-fit:cover">`;
        }

        // Apply role + plan visibility to sidebar nav items
        document.querySelectorAll('.nav-item').forEach(n => {
            if (n.dataset.nav) {
                const plan = getClientPlan();
                const planAllowed = PLAN_FEATURES[plan] || PLAN_FEATURES.enterprise;
                const planLocked = !planAllowed.includes(n.dataset.nav) && n.dataset.nav !== 'settings';
                if (planLocked) {
                    n.style.opacity = '0.4';
                    if (!n.dataset.locked) {
                        n.dataset.locked = '1';
                        const lockBadge = document.createElement('span');
                        lockBadge.textContent = '🔒';
                        lockBadge.style.cssText = 'font-size:10px;margin-right:4px';
                        n.appendChild(lockBadge);
                    }
                } else {
                    n.style.display = canAccess(n.dataset.nav) ? '' : 'none';
                }
            }
        });

        if (s.pin) {
            lockApp();
        }

        navigate('dashboard');
    }
}

// ══════════════════════════════════════════════════
//  SUBSCRIPTION EXPIRY ENFORCEMENT
// ══════════════════════════════════════════════════
let _expiryTimer = null;

function showExpiredScreen() {
    // Hide everything
    $('app').classList.add('hidden');
    $('admin-login-screen').classList.add('hidden');
    $('onboarding').classList.add('hidden');
    $('serial-activation-screen').classList.add('hidden');
    const picker = $('master-client-picker');
    if (picker) { picker.classList.add('hidden'); picker.style.display = 'none'; }

    // Create or show expired screen
    let screen = $('expired-screen');
    if (!screen) {
        screen = document.createElement('div');
        screen.id = 'expired-screen';
        document.body.appendChild(screen);
    }
    screen.classList.remove('hidden');
    screen.style.display = '';

    const expiryResult = checkLicenseExpiry();
    const endDateStr = expiryResult.endDate
        ? new Date(expiryResult.endDate).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
        : '';
    const reasonText = expiryResult.reason || 'انتهت صلاحية الاشتراك';

    screen.innerHTML = `
    <div style="position:fixed;inset:0;background:linear-gradient(135deg,#1a0000 0%,#330000 40%,#4d0000 100%);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:'Cairo','Segoe UI',sans-serif">
        <div style="text-align:center;max-width:480px;padding:40px;animation:expPulse 2s ease-in-out infinite">
            <div style="font-size:80px;margin-bottom:16px;animation:expShake 0.5s ease-in-out">🚫</div>
            <h1 style="color:#f87171;font-size:28px;font-weight:800;margin:0 0 12px">الاشتراك منتهي</h1>
            <p style="color:#fca5a5;font-size:16px;margin:0 0 8px;line-height:1.7">${reasonText}</p>
            ${endDateStr ? '<p style="color:#ef4444;font-size:14px;margin:0 0 20px">تاريخ الانتهاء: <strong>' + endDateStr + '</strong></p>' : ''}
            <div style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:16px;margin:20px 0">
                <p style="color:#fca5a5;font-size:14px;margin:0;line-height:1.8">
                    ⚠️ تم قفل التطبيق لأن اشتراكك انتهى.<br>
                    تواصل مع مزود الخدمة لتجديد الاشتراك.
                </p>
            </div>
            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:24px">
                <button onclick="deactivateSerialFromExpired()" style="padding:12px 28px;border:none;border-radius:10px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;background:rgba(251,146,60,0.2);color:#fb923c;border:1px solid rgba(251,146,60,0.3);transition:all .2s"
                    onmouseover="this.style.background='rgba(251,146,60,0.3)'" onmouseout="this.style.background='rgba(251,146,60,0.2)'">
                    🔑 تغيير الترخيص
                </button>
                <button onclick="location.reload()" style="padding:12px 28px;border:none;border-radius:10px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;background:rgba(99,102,241,0.2);color:#818cf8;border:1px solid rgba(99,102,241,0.3);transition:all .2s"
                    onmouseover="this.style.background='rgba(99,102,241,0.3)'" onmouseout="this.style.background='rgba(99,102,241,0.2)'">
                    🔄 إعادة المحاولة
                </button>
            </div>
        </div>
    </div>
    <style>
        @keyframes expPulse { 0%,100%{opacity:1} 50%{opacity:0.92} }
        @keyframes expShake { 0%,100%{transform:rotate(0)} 25%{transform:rotate(-5deg)} 75%{transform:rotate(5deg)} }
    </style>`;
}

function deactivateSerialFromExpired() {
    clearActiveSerial();
    localStorage.removeItem('sp_is_master');
    localStorage.removeItem('sp_master_viewing');
    localStorage.removeItem('sp_master_client_key');
    currentAdmin = null;
    const screen = $('expired-screen');
    if (screen) { screen.classList.add('hidden'); screen.style.display = 'none'; }
    $('serial-activation-screen').classList.remove('hidden');
    $('sp-serial-input').value = '';
    $('sp-serial-error').textContent = '';
    $('sp-serial-client-info').classList.add('hidden');
    setTimeout(() => $('sp-serial-input')?.focus(), 100);
}

function showDeviceLockedScreen() {
    $('app').classList.add('hidden');
    $('admin-login-screen').classList.add('hidden');
    $('onboarding').classList.add('hidden');
    $('serial-activation-screen').classList.add('hidden');
    const picker = $('master-client-picker');
    if (picker) { picker.classList.add('hidden'); picker.style.display = 'none'; }

    let screen = $('device-locked-screen');
    if (!screen) {
        screen = document.createElement('div');
        screen.id = 'device-locked-screen';
        document.body.appendChild(screen);
    }
    screen.classList.remove('hidden');
    screen.style.display = '';

    screen.innerHTML = `
    <div style="position:fixed;inset:0;background:linear-gradient(135deg,#0a0020 0%,#1a0040 40%,#2d0060 100%);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:'Cairo','Segoe UI',sans-serif">
        <div style="text-align:center;max-width:480px;padding:40px;animation:devPulse 2s ease-in-out infinite">
            <div style="font-size:80px;margin-bottom:16px;animation:expShake 0.5s ease-in-out">🔒</div>
            <h1 style="color:#c084fc;font-size:28px;font-weight:800;margin:0 0 12px">جهاز غير مصرح</h1>
            <p style="color:#d8b4fe;font-size:16px;margin:0 0 20px;line-height:1.7">هذا الترخيص مقفول على جهاز آخر</p>
            <div style="background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.3);border-radius:12px;padding:16px;margin:20px 0">
                <p style="color:#d8b4fe;font-size:14px;margin:0;line-height:1.8">
                    ⚠️ لا يمكن استخدام هذا الترخيص من هذا الجهاز.<br>
                    تواصل مع الأدمن لفك قفل الجهاز وإعادة التفعيل.
                </p>
            </div>
            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:24px">
                <button onclick="deactivateSerialFromExpired()" style="padding:12px 28px;border:none;border-radius:10px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;background:rgba(251,146,60,0.2);color:#fb923c;border:1px solid rgba(251,146,60,0.3);transition:all .2s"
                    onmouseover="this.style.background='rgba(251,146,60,0.3)'" onmouseout="this.style.background='rgba(251,146,60,0.2)'">
                    🔑 تغيير الترخيص
                </button>
                <button onclick="location.reload()" style="padding:12px 28px;border:none;border-radius:10px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;background:rgba(99,102,241,0.2);color:#818cf8;border:1px solid rgba(99,102,241,0.3);transition:all .2s"
                    onmouseover="this.style.background='rgba(99,102,241,0.3)'" onmouseout="this.style.background='rgba(99,102,241,0.2)'">
                    🔄 إعادة المحاولة
                </button>
            </div>
        </div>
    </div>
    <style>@keyframes devPulse { 0%,100%{opacity:1} 50%{opacity:0.92} }</style>`;
}

function startExpiryWatcher() {
    // The old timer-based expiry watcher is replaced by the server heartbeat.
    // startHeartbeat() in stockpro-data.js handles periodic re-validation.
    // We only keep this as a fallback for the grace period check.
    if (_expiryTimer) clearInterval(_expiryTimer);
    _expiryTimer = setInterval(() => {
        const check = checkLicenseExpiry();
        if (check.expired) {
            showExpiredScreen();
            clearInterval(_expiryTimer);
            _expiryTimer = null;
        }
    }, 60 * 1000); // Every 1 minute
}

// ═══════════════════════════════════════════════════
//  SECURITY EVENT LISTENERS (from heartbeat)
// ═══════════════════════════════════════════════════
window.addEventListener('sp-license-expired', (e) => {
    console.error('🚫 License expired via heartbeat:', e.detail);
    stopHeartbeat();
    showExpiredScreen();
});

window.addEventListener('sp-device-locked', (e) => {
    console.error('🔒 Device locked via heartbeat:', e.detail);
    stopHeartbeat();
    showDeviceLockedScreen();
});

window.addEventListener('sp-grace-expired', (e) => {
    console.error('⏰ Grace period expired:', e.detail);
    showExpiredScreen();
});

window.addEventListener('sp-clock-tamper', (e) => {
    console.error('🚨 Clock tampering detected:', e.detail);
    showExpiredScreen();
});

window.addEventListener('sp-require-reauth', (e) => {
    console.warn('🔑 Re-authentication required:', e.detail);
    stopHeartbeat();
    // Force re-login
    spAdminLogout();
    toast('انتهت الجلسة — سجل دخول مرة أخرى', 'warning');
});

// ══════════════════════════════════════════════════
//  SERIAL ACTIVATION
// ══════════════════════════════════════════════════
async function activateSerial() {
    const input = $('sp-serial-input');
    const errEl = $('sp-serial-error');
    const serial = input.value.trim().toUpperCase();

    if (!serial) {
        errEl.textContent = '❌ أدخل مفتاح الترخيص';
        return;
    }

    if (!/^SP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(serial)) {
        errEl.textContent = '❌ صيغة المفتاح غير صحيحة — الصيغة: SP-XXXX-XXXX-XXXX-XXXX';
        return;
    }

    errEl.textContent = '⏳ جاري التحقق من: ' + serial + ' ...';
    errEl.style.color = 'var(--accent)';
    console.log('🔑 [DEBUG] Validating serial:', serial);
    console.log('🔑 [DEBUG] Server URL:', SP_SERVER_URL);

    const result = await validateSerial(serial);
    console.log('🔑 [DEBUG] Server response:', JSON.stringify(result));
    errEl.style.color = '';
    if (!result || !result.valid) {
        const debugInfo = '\n[DEBUG: Server=' + SP_SERVER_URL + ' | Serial=' + serial + ' | Response=' + JSON.stringify(result) + ']';
        errEl.textContent = '❌ ' + (result?.error || 'مفتاح الترخيص غير صالح أو منتهي الصلاحية');
        console.error('🔑 [DEBUG] Validation failed:', debugInfo);
        // Don't clear input so user can verify what they typed
        return;
    }

    // Master Mode: show client picker
    if (result.isMaster && result.clients) {
        localStorage.setItem('sp_is_master', '1');
        errEl.textContent = '';
        showMasterClientPicker(serial, result.clients);
        return;
    }

    // Normal client mode
    localStorage.removeItem('sp_is_master');
    setActiveSerial(serial, result.client);
    errEl.textContent = '';
    $('sp-serial-client-info').classList.remove('hidden');
    $('sp-serial-client-name').textContent = '✅ مرحباً — ' + (result.client.company || result.client.name);

    setTimeout(() => {
        $('serial-activation-screen').classList.add('hidden');
        $('admin-login-screen').classList.remove('hidden');
        setTimeout(() => $('sp-login-user')?.focus(), 100);
        toast('✅ تم تفعيل الترخيص بنجاح');
    }, 1000);
}

function showMasterClientPicker(masterSerial, clients) {
    $('serial-activation-screen').classList.add('hidden');
    let picker = $('master-client-picker');
    if (!picker) {
        picker = document.createElement('div');
        picker.id = 'master-client-picker';
        picker.className = 'screen-overlay';
        document.body.appendChild(picker);
    }
    picker.classList.remove('hidden');
    picker.style.display = '';

    const sb = (s) => s === 'active' ? '<span style="color:#4ade80">● نشط</span>' : '<span style="color:#f87171">● ' + (s === 'suspended' ? 'معلق' : 'منتهي') + '</span>';
    const pb = (p) => ({ basic: '🟢 أساسي', premium: '🟣 بريميوم', enterprise: '🔵 مؤسسي' }[p] || p);

    picker.innerHTML = '<div style="max-width:600px;margin:40px auto;padding:24px">'
        + '<div style="text-align:center;margin-bottom:32px">'
        + '<div style="font-size:48px;margin-bottom:8px">👑</div>'
        + '<h2 style="color:var(--accent);margin:0 0 8px">وضع المالك</h2>'
        + '<p style="color:var(--muted);margin:0">اختر عميل لعرض بياناته</p>'
        + '</div>'
        + (clients.length === 0 ? '<div style="text-align:center;color:var(--muted);padding:40px">لا يوجد عملاء — أضف عملاء من لوحة الأدمن أولاً</div>' :
            '<div style="display:flex;flex-direction:column;gap:12px">'
            + clients.map(function (cl) {
                return '<div onclick="selectMasterClient(\'' + masterSerial + '\',\'' + cl.id + '\',\'' + (cl.licenseKey || '') + '\')"'
                    + ' style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 20px;cursor:pointer;transition:all .2s;display:flex;justify-content:space-between;align-items:center"'
                    + ' onmouseover="this.style.borderColor=\'var(--accent)\';this.style.transform=\'translateY(-2px)\'"'
                    + ' onmouseout="this.style.borderColor=\'var(--border)\';this.style.transform=\'\'">'
                    + '<div><div style="font-weight:700;font-size:16px;margin-bottom:4px">' + cl.company + '</div>'
                    + '<div style="color:var(--muted);font-size:13px">' + cl.name + '</div></div>'
                    + '<div style="text-align:left;font-size:13px"><div>' + sb(cl.status) + '</div>'
                    + '<div style="color:var(--muted);margin-top:4px">' + pb(cl.plan) + '</div></div></div>';
            }).join('')
            + '</div>')
        + '<div style="text-align:center;margin-top:24px">'
        + '<button onclick="closeMasterPicker()" class="btn btn-secondary" style="padding:10px 32px">↩️ رجوع</button>'
        + '</div></div>';
}

function selectMasterClient(masterSerial, clientId, clientLicenseKey) {
    localStorage.setItem('sp_master_viewing', clientId);
    localStorage.setItem('sp_master_client_key', clientLicenseKey);
    setActiveSerial(masterSerial, { id: clientId, name: 'مالك البرنامج', company: 'عرض بيانات العميل' });
    var picker = $('master-client-picker');
    if (picker) { picker.classList.add('hidden'); picker.style.display = 'none'; }
    $('serial-activation-screen').classList.add('hidden');
    $('admin-login-screen').classList.remove('hidden');
    toast('👑 وضع المالك — تشاهد بيانات العميل');
    setTimeout(function () { if ($('sp-login-user')) $('sp-login-user').focus(); }, 100);
}

function closeMasterPicker() {
    var picker = $('master-client-picker');
    if (picker) { picker.classList.add('hidden'); picker.style.display = 'none'; }
    $('serial-activation-screen').classList.remove('hidden');
}

function deactivateSerial() {
    confirmAction('هل تريد إلغاء تفعيل الترخيص الحالي؟ سيتم العودة لشاشة التفعيل.', () => {
        clearActiveSerial();
        localStorage.removeItem('sp_is_master');
        localStorage.removeItem('sp_master_viewing');
        localStorage.removeItem('sp_master_client_key');
        currentAdmin = null;
        $('app').classList.add('hidden');
        $('admin-login-screen').classList.add('hidden');
        $('serial-activation-screen').classList.remove('hidden');
        $('sp-serial-input').value = '';
        $('sp-serial-error').textContent = '';
        $('sp-serial-client-info').classList.add('hidden');
        setTimeout(() => $('sp-serial-input')?.focus(), 100);
        toast('تم إلغاء التفعيل — أدخل مفتاح ترخيص جديد', 'warning');
    });
}

// ══════════════════════════════════════════════════
//  APP INITIALIZATION
// ══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    document.body.dataset.theme = 'dark';

    // Hide everything first
    $('app').classList.add('hidden');
    $('onboarding').classList.add('hidden');
    $('admin-login-screen').classList.add('hidden');
    $('serial-activation-screen').classList.add('hidden');

    // Step 1: Check if serial is activated
    const serial = getActiveSerial();
    if (!serial) {
        // No serial — show activation screen
        $('serial-activation-screen').classList.remove('hidden');
        setTimeout(() => $('sp-serial-input')?.focus(), 100);
        return;
    }

    // Step 1.5: Check for clock tampering
    if (detectClockTampering()) {
        showExpiredScreen();
        return;
    }

    // Step 1.6: Check license expiry (includes grace period check)
    const expiryCheck = checkLicenseExpiry();
    if (expiryCheck.expired) {
        showExpiredScreen();
        return;
    }

    // Step 1.7: Check device lock (client-side fallback)
    if (isDeviceLocked(serial)) {
        showDeviceLockedScreen();
        return;
    }

    // Start the expiry watcher (fallback)
    startExpiryWatcher();

    // Step 2: Serial exists — apply theme from this client's data
    const s = getSettings();
    document.body.dataset.theme = s.theme || 'dark';

    // Step 3: Show login screen
    $('admin-login-screen').classList.remove('hidden');
    setTimeout(() => $('sp-login-user')?.focus(), 100);
});
