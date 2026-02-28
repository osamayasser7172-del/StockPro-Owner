// ═══════════════════════════════════════════════════
//  StockPro — Electron Main Process
//  Client-facing Desktop App (no admin panel)
// ═══════════════════════════════════════════════════
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400, height: 900, minWidth: 1024, minHeight: 700,
        title: 'StockPro — نظام إدارة المخازن والمبيعات',
        webPreferences: { nodeIntegration: false, contextIsolation: true },
        show: false, backgroundColor: '#0b1120',
    });
    mainWindow.loadFile(path.join(__dirname, 'stockpro.html'));
    mainWindow.once('ready-to-show', () => { mainWindow.show(); mainWindow.focus(); });
    mainWindow.on('closed', () => { mainWindow = null; });

    Menu.setApplicationMenu(Menu.buildFromTemplate([
        {
            label: 'StockPro', submenu: [
                { label: 'لوحة التحكم', click: () => mainWindow.webContents.executeJavaScript("navigate('dashboard')") },
                { label: 'المبيعات', click: () => mainWindow.webContents.executeJavaScript("navigate('sales')") },
                { label: 'المخزون', click: () => mainWindow.webContents.executeJavaScript("navigate('inventory')") },
                { type: 'separator' },
                { role: 'quit', label: 'خروج' },
            ]
        },
        {
            label: 'تعديل', submenu: [
                { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
                { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
            ]
        },
        {
            label: 'عرض', submenu: [
                { role: 'reload' }, { type: 'separator' },
                { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
                { type: 'separator' }, { role: 'togglefullscreen' },
            ]
        },
    ]));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// Block any attempt to open admin.html or external URLs
app.on('web-contents-created', (e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) { shell.openExternal(url); }
        return { action: 'deny' };
    });
});
