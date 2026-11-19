const CATEGORY_COLORS = {
    'Transit & Travel': '#0D9488',
    'Food & Dining': '#F97316',
    'Housing & Utilities': '#6366F1',
    'Shopping & Lifestyle': '#8B5CF6',
    'Healthcare & Medical': '#10B981',
    'Entertainment & Leisure': '#F59E0B',
    'Education & Self-Growth': '#3B82F6',
    'Financial & Miscellaneous': '#64748B'
};

let trendChartInstance = null;
let currentTrendMode = 'daily'; // 'daily' or 'cumulative'

let rawData = { transactions: [], allowances: {}, categories: [] };
let currentMode = 'full';
let currentActiveView = 'dashboard';
let donutChartInstance = null;

// --- CONFIG: Web App URL ---
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbydQO2Om4mpiLWFzXxiUr8H6WbW77r1gve6w9NlcOxz01lVcCqGG1YBJmMYmYGf5Hrg/exec";


// --- Helper: Flexible Allowance Lookup ---
function getAllowanceForMonth(yearStr, monthNumStr) {
    if (!rawData.allowances || !yearStr || !monthNumStr) return 0;

    const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthNamesLong  = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const mIndex = parseInt(monthNumStr, 10) - 1;
    if (mIndex < 0 || mIndex > 11) return 0;

    const shortM = monthNamesShort[mIndex];
    const longM  = monthNamesLong[mIndex];
    const paddedM = String(mIndex + 1).padStart(2, '0');

    const candidateKeys = [
        `${shortM} ${yearStr}`,         // "Nov 2026"
        `${longM} ${yearStr}`,          // "November 2026"
        `${yearStr}-${paddedM}`,        // "2026-11"
        `${paddedM}/${yearStr}`,        // "11/2026"
        `${shortM}-${yearStr}`,         // "Nov-2026"
        `${shortM} '${yearStr.slice(-2)}` // "Nov '26"
    ];

    for (const key of candidateKeys) {
        if (rawData.allowances[key] !== undefined && rawData.allowances[key] !== null && rawData.allowances[key] !== '') {
            return parseFloat(rawData.allowances[key]) || 0;
        }
    }

    for (const storedKey in rawData.allowances) {
        const lower = storedKey.toLowerCase().trim();
        if ((lower.includes(shortM.toLowerCase()) || lower.includes(longM.toLowerCase())) && lower.includes(yearStr)) {
            return parseFloat(rawData.allowances[storedKey]) || 0;
        }
        if (lower.startsWith(`${yearStr}-${paddedM}`)) {
            return parseFloat(rawData.allowances[storedKey]) || 0;
        }
    }

    return 0;
}

// --- Sidebar & View Routing ---
function toggleSidebar() {
    const panel = document.getElementById('sidebarPanel');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (!panel) return;
    const isOpen = !panel.classList.contains('-translate-x-full');
    
    if (isOpen) {
        panel.classList.add('-translate-x-full');
        if (backdrop) backdrop.classList.add('hidden');
    } else {
        panel.classList.remove('-translate-x-full');
        if (backdrop) backdrop.classList.remove('hidden');
    }
}

function switchView(viewName, closeSidebar = true) {
    currentActiveView = viewName;
    
    const panel = document.getElementById('sidebarPanel');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (closeSidebar && panel && !panel.classList.contains('-translate-x-full')) {
        panel.classList.add('-translate-x-full');
        if (backdrop) backdrop.classList.add('hidden');
    }

    const views = {
        dashboard: { el: document.getElementById('viewDashboard'), btn: document.getElementById('navDashboardBtn') },
        explorer:  { el: document.getElementById('viewExplorer'),  btn: document.getElementById('navExplorerBtn') },
        masterLog: { el: document.getElementById('viewMasterLog'), btn: document.getElementById('navMasterLogBtn') }
    };

    const activeBtnClass = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-brand-slate text-white transition-all";
    const inactiveBtnClass = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-brand-charcoal hover:bg-brand-canvas hover:text-brand-slate transition-all";

    Object.keys(views).forEach(key => {
        const targetEl = views[key].el;
        const targetBtn = views[key].btn;

        if (targetBtn) targetBtn.className = (key === viewName) ? activeBtnClass : inactiveBtnClass;

        if (targetEl) {
            if (key === viewName) {
                targetEl.classList.remove('hidden');
                targetEl.style.opacity = '0';
                targetEl.style.transform = 'translateY(8px)';
                targetEl.style.transition = 'opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
                
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        targetEl.style.opacity = '1';
                        targetEl.style.transform = 'translateY(0)';
                    }, 20);
                });
            } else {
                targetEl.classList.add('hidden');
            }
        }
    });

    const mobileNavBtns = {
        dashboard: document.getElementById('mobileNavDashboardBtn'),
        explorer:  document.getElementById('mobileNavExplorerBtn'),
        masterLog: document.getElementById('mobileNavMasterLogBtn')
    };

    Object.keys(mobileNavBtns).forEach(key => {
        const mBtn = mobileNavBtns[key];
        if (mBtn) {
            if (key === viewName) {
                mBtn.className = "flex flex-col items-center gap-1 text-xs font-bold text-teal-600 transition-all cursor-default";
            } else {
                mBtn.className = "flex flex-col items-center gap-1 text-xs font-semibold text-brand-charcoal hover:text-brand-slate transition-all";
            }
        }
    });

    const headerBadge = document.getElementById('activePeriodBadge');
    const textEl = document.getElementById('activePeriodText');
    const labelEl = document.getElementById('activePeriodLabel');
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    if (headerBadge) {
        headerBadge.classList.toggle('hidden', viewName !== 'dashboard' && viewName !== 'masterLog');
    }

    if (viewName === 'masterLog') {
        const effectiveScope = (masterLogScope === 'current')
            ? (selectedDashboardMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`)
            : masterLogScope;

        if (effectiveScope === 'all') {
            if (labelEl) labelEl.textContent = 'VIEWING SCOPE';
            if (textEl) textEl.textContent = 'ALL-TIME';
        } else {
            const [y, m] = effectiveScope.split('-');
            if (labelEl) labelEl.textContent = 'ACTIVE MONTH';
            if (textEl && y && m) textEl.textContent = `${monthNames[parseInt(m, 10) - 1]} ${y}`;
        }
        renderMasterLog();
    } else if (viewName === 'dashboard') {
        const chartsReady = Boolean(trendChartInstance && donutChartInstance);
        renderApp({ animate: !chartsReady });
    }
}

// --- CONFIG: All 4 Published Google Sheets CSV URLs ---
const CSV_URLS = {
    rawLog: "https://docs.google.com/spreadsheets/d/e/2PACX-1vThhL6R8JkEPYGvnulvgHHHLWA2z7CoW33Danh97rXKKt9-QVuODgUHTNbBkUg_itUX0DQs_Hwsi8KC/pub?gid=0&single=true&output=csv",
    categorySummary: "https://docs.google.com/spreadsheets/d/e/2PACX-1vThhL6R8JkEPYGvnulvgHHHLWA2z7CoW33Danh97rXKKt9-QVuODgUHTNbBkUg_itUX0DQs_Hwsi8KC/pub?gid=1&single=true&output=csv",
    allowances: "https://docs.google.com/spreadsheets/d/e/2PACX-1vThhL6R8JkEPYGvnulvgHHHLWA2z7CoW33Danh97rXKKt9-QVuODgUHTNbBkUg_itUX0DQs_Hwsi8KC/pub?gid=2&single=true&output=csv",
    categories: "https://docs.google.com/spreadsheets/d/e/2PACX-1vThhL6R8JkEPYGvnulvgHHHLWA2z7CoW33Danh97rXKKt9-QVuODgUHTNbBkUg_itUX0DQs_Hwsi8KC/pub?gid=1933533935&single=true&output=csv"
};

// --- Helper: Simple CSV Parser ---
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];

    // Parse CSV line handling quotes properly
    const parseLine = (line) => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(cur.trim().replace(/^["']|["']$/g, ''));
                cur = '';
            } else {
                cur += char;
            }
        }
        result.push(cur.trim().replace(/^["']|["']$/g, ''));
        return result;
    };

    const headers = parseLine(lines[0]);
    const result = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const currentLine = parseLine(lines[i]);
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = currentLine[j] || '';
        }
        result.push(obj);
    }
    return result;
}

// --- CONFIG: Google Sheets API v4 (Batch Fetch All Tabs) ---
const SPREADSHEET_ID = "1jrxrAYtd0_bWtm27cMDEAinBnhSDtuxulcKs4PAbZcs";
const API_KEY = "AIzaSyC4ne6GN9y7SMfMRjFBWMdV_yYMivcJqOQ";

// Single API call to fetch Raw_Log, Allowances, and Categories_List simultaneously
const BATCH_API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?ranges=Raw_Log&ranges=Allowances&ranges=Categories_List!D2:D50&key=${API_KEY}`;

async function loadData({ silentIfUnchanged = false } = {}) {
    console.log("Fetching complete live data from Master_Tracker...");

    try {
        const response = await fetch(BATCH_API_URL);
        const result = await response.json();
        
        if (result.error) {
            console.error("API Error:", result.error.message);
            return;
        }

        const valueRanges = result.valueRanges;
        if (!valueRanges || valueRanges.length < 3) return;

        // 1. Parse Raw_Log (Index 0)
        const rawLogRows = valueRanges[0].values || [];
        const formattedTransactions = [];

        for (let i = 1; i < rawLogRows.length; i++) {
            const row = rawLogRows[i];
            if (!row[0]) continue; // Skip empty rows
            const rawAmount = row[3] || '0';
            const cleanAmount = parseFloat(String(rawAmount).replace(/[^0-9.-]+/g, '')) || 0;

            formattedTransactions.push({
                date: row[0] || '',
                parentCategory: row[1] || '',
                subcategory: row[2] || '',
                amount: cleanAmount,
                notes: row[4] || ''
            });
        }

        // 2. Parse Allowances (Index 1) -> Maps "Nov 2026" to 2120
        const allowanceRows = valueRanges[1].values || [];
        const allowancesMap = {};

        for (let i = 1; i < allowanceRows.length; i++) {
            const row = allowanceRows[i];
            if (!row[0]) continue;
            const monthKey = row[0].trim(); // e.g., "Nov 2026"
            const rawAllowance = row[1] || '0';
            const cleanAllowance = parseFloat(String(rawAllowance).replace(/[^0-9.-]+/g, '')) || 0;
            allowancesMap[monthKey] = cleanAllowance;
        }

        // 3. Parse Parent Categories from Categories_List!D2:D50 (Index 2)
        const categoryRows = valueRanges[2].values || [];
        const dynamicCategories = categoryRows
            .map(row => row[0] ? row[0].trim() : '')
            .filter(cat => cat !== '');

        const nextData = {
            transactions: formattedTransactions,
            allowances: allowancesMap,
            categories: dynamicCategories.length > 0 ? dynamicCategories : [
                "Transit & Travel", "Food & Dining", "Housing & Utilities", 
                "Shopping & Lifestyle", "Healthcare & Medical", 
                "Entertainment & Leisure", "Education & Self-Growth", 
                "Financial & Miscellaneous"
            ]
        };

        applyIncomingData(nextData, { silentIfUnchanged: Boolean(silentIfUnchanged) });

        console.log("Complete Master_Tracker synced successfully!", rawData);

    } catch (err) {
        console.error("API fetch failed, falling back to cache:", err);
        if (!rawData || !Array.isArray(rawData.transactions) || rawData.transactions.length === 0) {
            hydrateFromCache();
        }
    }
}

function populateCategoryDropdown() {
    const cats = (rawData.categories && rawData.categories.length > 0) ? rawData.categories : Object.keys(CATEGORY_COLORS);
    ['categoryFilter', 'expCategoryFilter'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currentVal = select.value || 'All';
        select.innerHTML = '<option value="All">All Categories</option>';
        cats.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            select.appendChild(opt);
        });
        select.value = currentVal;
    });
}

// --- Interactive Month Selector Logic ---
let selectedDashboardMonth = null;
let drumSelectedYear = String(new Date().getFullYear());
let drumSelectedMonthNum = String(new Date().getMonth() + 1).padStart(2, '0');
let isProgrammaticScroll = false;
let scrollDebounceTimer = null;

function toggleMonthDropdown() {
    const menu = document.getElementById('monthDropdownMenu');
    const chevron = document.getElementById('monthDropdownChevron');
    if (!menu) return;
    
    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
        menu.classList.remove('hidden');
        if (chevron) chevron.classList.add('rotate-180');
        initDrumWheels();
    } else {
        menu.classList.add('hidden');
        if (chevron) chevron.classList.remove('rotate-180');
    }
}

document.addEventListener('click', function(event) {
    const badge = document.getElementById('activePeriodBadge');
    const menu = document.getElementById('monthDropdownMenu');
    const chevron = document.getElementById('monthDropdownChevron');
    if (badge && menu && !badge.contains(event.target)) {
        menu.classList.add('hidden');
        if (chevron) chevron.classList.remove('rotate-180');
    }
});

function initDashboardMonthSelector(transactions, allowances) {
    const textEl = document.getElementById('activePeriodText');
    const labelEl = document.getElementById('activePeriodLabel');
    if (!textEl) return;

    if (selectedDashboardMonth === 'all') {
        textEl.textContent = 'ALL-TIME';
        if (labelEl) labelEl.textContent = 'VIEWING SCOPE';
        return;
    }

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (!selectedDashboardMonth) {
        selectedDashboardMonth = currentMonthKey;
    }

    const [y, m] = selectedDashboardMonth.split('-');
    drumSelectedYear = y;
    drumSelectedMonthNum = m;

    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    textEl.textContent = `${monthNames[parseInt(m, 10) - 1]} ${y}`;
    if (labelEl) labelEl.textContent = 'ACTIVE MONTH';
}

function initDrumWheels() {
    const yearWheel = document.getElementById('drumYearWheel');
    const monthWheel = document.getElementById('drumMonthWheel');
    if (!yearWheel || !monthWheel) return;

    const currentYr = new Date().getFullYear();
    let yearSet = new Set();
    
    for (let y = currentYr - 20; y <= currentYr + 20; y++) {
        yearSet.add(String(y));
    }

    if (Array.isArray(rawData.transactions)) {
        rawData.transactions.forEach(tx => {
            if (tx.date && tx.date.length >= 4) yearSet.add(tx.date.substring(0, 4));
        });
    }
    if (rawData.allowances && typeof rawData.allowances === 'object') {
        Object.keys(rawData.allowances).forEach(k => {
            const match = k.match(/\d{4}/);
            if (match) yearSet.add(match[0]);
        });
    }

    const years = Array.from(yearSet).sort();

    yearWheel.innerHTML = years.map((yr, idx) => `
        <div data-val="${yr}" onclick="scrollDrumToNode('year', ${idx})"
            class="h-9 flex items-center justify-center snap-center cursor-pointer text-xs font-extrabold transition-all duration-150">
            ${yr}
        </div>
    `).join('');

    const baseMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const months = [...baseMonths, ...baseMonths, ...baseMonths];

    monthWheel.innerHTML = months.map((mName, idx) => {
        const mNum = String((idx % 12) + 1).padStart(2, '0');
        return `
            <div data-val="${mNum}" onclick="scrollDrumToNode('month', ${idx})"
                class="h-9 flex items-center justify-center snap-center cursor-pointer text-xs font-extrabold transition-all duration-150">
                ${mName}
            </div>
        `;
    }).join('');

    isProgrammaticScroll = true;
    const targetYearIdx = Math.max(0, years.indexOf(drumSelectedYear));
    const targetMonthIdx = parseInt(drumSelectedMonthNum, 10) - 1;

    yearWheel.scrollTop = targetYearIdx * 36;
    monthWheel.scrollTop = (12 + targetMonthIdx) * 36;
    setTimeout(() => { isProgrammaticScroll = false; }, 50);
    
    updateActiveDrumHighlight('year', targetYearIdx);
    updateActiveDrumHighlight('month', 12 + targetMonthIdx);
}

function handleWheelStep(event, type) {
    event.preventDefault();
    const wheel = document.getElementById(type === 'year' ? 'drumYearWheel' : 'drumMonthWheel');
    if (!wheel || isProgrammaticScroll) return;

    const itemHeight = 36;
    const direction = event.deltaY > 0 ? 1 : -1;
    let targetScroll = wheel.scrollTop + (direction * itemHeight);

    isProgrammaticScroll = true;
    wheel.scrollTo({ top: targetScroll, behavior: 'smooth' });
    
    setTimeout(() => {
        isProgrammaticScroll = false;
        handleDrumScroll(type);
    }, 150);
}

function handleDrumScroll(type) {
    const wheel = document.getElementById(type === 'year' ? 'drumYearWheel' : 'drumMonthWheel');
    if (!wheel || isProgrammaticScroll) return;

    const itemHeight = 36;
    clearTimeout(scrollDebounceTimer);

    let scrollTop = wheel.scrollTop;
    const activeIdx = Math.round(scrollTop / itemHeight);

    if (type === 'month') {
        if (activeIdx < 4) {
            isProgrammaticScroll = true;
            wheel.scrollTop = scrollTop + (12 * itemHeight);
            isProgrammaticScroll = false;
            return;
        } else if (activeIdx >= 32) {
            isProgrammaticScroll = true;
            wheel.scrollTop = scrollTop - (12 * itemHeight);
            isProgrammaticScroll = false;
            return;
        }
    }

    updateActiveDrumHighlight(type, activeIdx);

    scrollDebounceTimer = setTimeout(() => {
        isProgrammaticScroll = true;
        wheel.scrollTo({ top: activeIdx * itemHeight, behavior: 'smooth' });
        setTimeout(() => { isProgrammaticScroll = false; }, 100);
    }, 80);
}

function updateActiveDrumHighlight(type, activeIdx) {
    const wheel = document.getElementById(type === 'year' ? 'drumYearWheel' : 'drumMonthWheel');
    if (!wheel) return;
    const items = wheel.children;
    if (items.length === 0) return;

    for (let i = 0; i < items.length; i++) {
        if (i === activeIdx) {
            items[i].classList.remove('text-slate-400', 'scale-100');
            items[i].classList.add('text-teal-700', 'scale-110', 'font-extrabold');
            if (type === 'year') drumSelectedYear = items[i].getAttribute('data-val');
            if (type === 'month') drumSelectedMonthNum = items[i].getAttribute('data-val');
        } else {
            items[i].classList.remove('text-teal-700', 'scale-110');
            items[i].classList.add('text-slate-400');
        }
    }
}

function scrollDrumToNode(type, idx) {
    const wheel = document.getElementById(type === 'year' ? 'drumYearWheel' : 'drumMonthWheel');
    if (wheel) {
        isProgrammaticScroll = true;
        wheel.scrollTo({ top: idx * 36, behavior: 'smooth' });
        setTimeout(() => { 
            isProgrammaticScroll = false; 
            updateActiveDrumHighlight(type, idx); 
        }, 300);
    }
}

function confirmDrumPicker() {
    const selectedYM = `${drumSelectedYear}-${drumSelectedMonthNum}`;
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const labelText = `${monthNames[parseInt(drumSelectedMonthNum, 10) - 1]} ${drumSelectedYear}`;

    const menu = document.getElementById('monthDropdownMenu');
    const chevron = document.getElementById('monthDropdownChevron');
    const textEl = document.getElementById('activePeriodText');
    const labelEl = document.getElementById('activePeriodLabel');

    if (menu) menu.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
    if (textEl) textEl.textContent = labelText;
    if (labelEl) labelEl.textContent = 'ACTIVE MONTH';

    if (currentActiveView === 'masterLog') {
        masterLogScope = selectedYM;
        renderMasterLog();
    } else {
        selectedDashboardMonth = selectedYM;
        renderApp();
    }
}

function selectScopeAllTime() {
    const menu = document.getElementById('monthDropdownMenu');
    const chevron = document.getElementById('monthDropdownChevron');
    const textEl = document.getElementById('activePeriodText');
    const labelEl = document.getElementById('activePeriodLabel');

    if (menu) menu.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
    if (textEl) textEl.textContent = 'ALL-TIME';
    if (labelEl) labelEl.textContent = 'VIEWING SCOPE';

    if (currentActiveView === 'masterLog') {
        masterLogScope = 'all';
        renderMasterLog();
    } else {
        selectedDashboardMonth = 'all';
        renderApp();
    }
}

function renderTrendChart(monthlyTx, yearStr, monthNumStr, animate = true) {
    const canvasEl = document.getElementById('trendChart');
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');

    const year = parseInt(yearStr, 10);
    const monthIdx = parseInt(monthNumStr, 10) - 1;
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const shortMonth = monthNames[monthIdx];

    const dailyTotals = new Array(daysInMonth).fill(0);
    monthlyTx.forEach(tx => {
        if (tx.date && tx.date.length >= 10) {
            const day = parseInt(tx.date.substring(8, 10), 10);
            if (day >= 1 && day <= daysInMonth) {
                dailyTotals[day - 1] += tx.amount;
            }
        }
    });

    const labels = [];
    const dataPoints = [];
    let runningTotal = 0;

    for (let d = 1; d <= daysInMonth; d++) {
        labels.push(`${d} ${shortMonth}`);
        if (currentTrendMode === 'cumulative') {
            runningTotal += dailyTotals[d - 1];
            dataPoints.push(runningTotal);
        } else {
            dataPoints.push(dailyTotals[d - 1]);
        }
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, 'rgba(13, 148, 136, 0.22)');
    gradient.addColorStop(1, 'rgba(13, 148, 136, 0.0)');

    if (trendChartInstance) {
        trendChartInstance.destroy();
    }

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: currentTrendMode === 'daily' ? 'Daily Spend' : 'Cumulative Spend',
                data: dataPoints,
                borderColor: '#0D9488',
                backgroundColor: gradient,
                borderWidth: 2.5,
                fill: true,
                tension: 0.35,
                pointRadius: (context) => {
                    if (currentTrendMode === 'daily') {
                        return context.raw > 0 ? 4 : 0;
                    }
                    return 2.5;
                },
                pointHoverRadius: 6,
                pointBackgroundColor: '#0D9488',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2
            }]
        },
        options: {
            animation: animate ? undefined : false,
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0F172A',
                    padding: 10,
                    cornerRadius: 10,
                    displayColors: false,
                    callbacks: {
                        title: (items) => items[0].label,
                        label: (context) => {
                            const val = context.raw || 0;
                            const prefix = currentTrendMode === 'daily' ? 'Spent: ' : 'Total so far: ';
                            return `${prefix}₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        color: '#64748B',
                        font: { size: 11, weight: '600' },
                        maxTicksLimit: 6,
                        maxRotation: 0
                    }
                },
                y: {
                    beginAtZero: true,
                    border: { display: false },
                    grid: { color: '#F1F5F9' },
                    ticks: {
                        color: '#64748B',
                        font: { size: 11, weight: '600' },
                        maxTicksLimit: 5,
                        callback: (value) => '₹' + value.toLocaleString('en-IN')
                    }
                }
            }
        }
    });
}

// --- Render Dashboard ---
function renderApp(options = { animate: true }) {
    const shouldAnimate = options && options.animate !== undefined ? options.animate : true;
    initDashboardMonthSelector(rawData.transactions, rawData.allowances);
    
    const isAllTime = (selectedDashboardMonth === 'all');
    const targetMonthKey = selectedDashboardMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    
    let targetYear = String(new Date().getFullYear());
    let targetMonthNum = String(new Date().getMonth() + 1).padStart(2, '0');
    if (!isAllTime) {
        const parts = targetMonthKey.split('-');
        targetYear = parts[0];
        targetMonthNum = parts[1];
    }
    
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthKey = isAllTime ? "All-Time Archive" : (monthNames[parseInt(targetMonthNum, 10) - 1] + " " + targetYear);

    let totalAllowance = 0;
    if (isAllTime) {
        if (rawData.allowances && typeof rawData.allowances === 'object') {
            Object.values(rawData.allowances).forEach(val => {
                totalAllowance += parseFloat(val) || 0;
            });
        }
    } else {
        totalAllowance = getAllowanceForMonth(targetYear, targetMonthNum);
    }

    const monthlyTx = isAllTime
        ? (rawData.transactions || [])
        : (rawData.transactions || []).filter(tx => tx.date && tx.date.startsWith(targetMonthKey));

    const monthlyTotalSpent = monthlyTx.reduce((sum, tx) => sum + tx.amount, 0);
    const monthlyRemaining = Math.max(0, totalAllowance - monthlyTotalSpent);
    const monthlyPercentUsed = totalAllowance > 0 ? (monthlyTotalSpent / totalAllowance) * 100 : 0;

    const kpiAllowance = document.getElementById('kpiAllowance');
    const kpiSpent = document.getElementById('kpiSpent');
    const kpiRemaining = document.getElementById('kpiRemaining');
    const kpiRemainingPercent = document.getElementById('kpiRemainingPercent');
    const kpiBudgetUsed = document.getElementById('kpiBudgetUsed');

    if (kpiAllowance) kpiAllowance.innerText = '₹' + totalAllowance.toLocaleString('en-IN', {minimumFractionDigits: 2});
    if (kpiSpent) kpiSpent.innerText = '₹' + monthlyTotalSpent.toLocaleString('en-IN', {minimumFractionDigits: 2});
    if (kpiRemaining) kpiRemaining.innerText = '₹' + monthlyRemaining.toLocaleString('en-IN', {minimumFractionDigits: 2});
    if (kpiRemainingPercent) kpiRemainingPercent.innerText = totalAllowance > 0 ? (Math.max(0, 100 - monthlyPercentUsed).toFixed(1) + '% Left') : '100.0% Left';
    if (kpiBudgetUsed) kpiBudgetUsed.innerText = monthlyPercentUsed.toFixed(1) + '%';

    const badge = document.getElementById('runwayBadge');
    if (badge) {
        if (totalAllowance === 0) {
            badge.className = "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-brand-charcoal shrink-0";
            badge.innerText = "NO BUDGET";
        } else if (monthlyPercentUsed === 0) {
            badge.className = "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-teal-50 text-teal-700 shrink-0";
            badge.innerText = "FRESH START";
        } else if (monthlyPercentUsed > 100) {
            badge.className = "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-100 text-red-600 shrink-0";
            badge.innerText = "OVER BUDGET";
        } else if (monthlyPercentUsed >= 75) {
            badge.className = "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-600 shrink-0";
            badge.innerText = "NEARING LIMIT";
        } else {
            badge.className = "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-brand-emerald shrink-0";
            badge.innerText = "HEALTHY PACING";
        }
    }

    let monthlyCatSpend = {};
    const categories = (rawData.categories && rawData.categories.length > 0) ? rawData.categories : Object.keys(CATEGORY_COLORS);
    categories.forEach(c => monthlyCatSpend[c] = 0);
    
    monthlyTx.forEach(tx => {
        if (monthlyCatSpend[tx.parentCategory] !== undefined) {
            monthlyCatSpend[tx.parentCategory] += tx.amount;
        } else {
            monthlyCatSpend[tx.parentCategory] = tx.amount;
        }
    });

    const monthlySortedCats = Object.keys(monthlyCatSpend)
      .map(c => ({ name: c, amount: monthlyCatSpend[c] }))
      .filter(item => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const donutCenterTotal = document.getElementById('donutCenterTotal');
    const tableTotalSpend = document.getElementById('tableTotalSpend');
    if (donutCenterTotal) donutCenterTotal.innerText = '₹' + monthlyTotalSpent.toLocaleString('en-IN', {minimumFractionDigits: 2});
    if (tableTotalSpend) tableTotalSpend.innerText = '₹' + monthlyTotalSpent.toLocaleString('en-IN', {minimumFractionDigits: 2});

    const tbody = document.getElementById('categoryTableBody');
    if (tbody) {
        tbody.innerHTML = '';
        if (monthlySortedCats.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-brand-charcoal italic">No spending recorded for this period yet.</td></tr>`;
        } else {
            monthlySortedCats.forEach(item => {
                const denominator = totalAllowance > 0 ? totalAllowance : monthlyTotalSpent;
                const share = denominator > 0 ? (item.amount / denominator) * 100 : 0;
                const color = CATEGORY_COLORS[item.name] || '#0D9488';
                const tr = document.createElement('tr');
                tr.className = "hover:bg-brand-canvas/60 transition-colors";
                tr.innerHTML = `
                    <td class="py-3 px-2 flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full inline-block" style="background-color: ${color}"></span>
                        <span class="font-semibold text-brand-slate">${item.name}</span>
                    </td>
                    <td class="py-3 px-2 text-right font-medium">₹${item.amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                    <td class="py-3 px-2 text-right text-brand-charcoal">${share.toFixed(1)}%</td>
                    <td class="py-3 px-3">
                        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div class="h-full rounded-full" style="width: ${Math.min(100, share)}%; background-color: ${color}"></div>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    renderDonutChart(monthlySortedCats, totalAllowance, monthlyRemaining, shouldAnimate);
    renderTrendChart(monthlyTx, targetYear, targetMonthNum, shouldAnimate);
    renderRecentTransactions(monthlyTx);
}

// --- Render Donut Chart ---
function renderDonutChart(sortedCategories, totalAllowance, remainingBalance, animate = true) {
    const canvasEl = document.getElementById('donutChart');
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    let labels = [];
    let rawDataValues = []; 
    let displayDataValues = []; 
    let colors = [];
    
    const warmPalette = ['#d9381e', '#b33912', '#8b2e0f', '#d35400', '#e67e22', '#f39c12', '#475569', '#0D9488'];
    const totalSpentVal = sortedCategories.reduce((sum, i) => sum + i.amount, 0);

    sortedCategories.forEach((item, index) => {
        const cleanName = item.name ? item.name.trim() : '';
        if (item.amount > 0 && cleanName !== '') {
            labels.push(cleanName);
            rawDataValues.push(item.amount);
            const visualWeight = Math.max(item.amount, totalAllowance * 0.03);
            displayDataValues.push(visualWeight);
            colors.push(CATEGORY_COLORS[cleanName] || warmPalette[index % warmPalette.length]);
        }
    });

    if (remainingBalance > 0) {
        labels.push('Remaining Budget');
        rawDataValues.push(remainingBalance);
        displayDataValues.push(remainingBalance);
        colors.push(isDark ? '#1E293B' : '#ECFDF5');
    }

    if (donutChartInstance) {
        donutChartInstance.destroy();
    }

    donutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: displayDataValues,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: isDark ? '#111827' : '#ffffff',
                borderRadius: 3,
                spacing: 4,
                hoverOffset: 4
            }]
        },
        options: {
            animation: animate ? undefined : false,
            responsive: true,
            maintainAspectRatio: false,
            cutout: '64%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0F172A',
                    callbacks: {
                        label: function(context) {
                            const realValue = rawDataValues[context.dataIndex];
                            return ` ${context.label}: ₹${realValue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
                        }
                    }
                }
            }
        }
    });

    const cardContainer = canvasEl.closest('.bg-white');
    if (cardContainer) {
        let footerEl = cardContainer.querySelector('.donut-insight-footer');
        if (sortedCategories.length > 0 && footerEl) {
            const topCat = sortedCategories[0];
            footerEl.innerHTML = `
                <svg class="w-3.5 h-3.5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                <span class="font-medium truncate"><strong class="text-brand-slate">${topCat.name}</strong> is your biggest expense this month.</span>
            `;
        }
    }
}

function getActiveDashboardScope() {
    const isAllTime = (selectedDashboardMonth === 'all');
    const targetMonthKey = selectedDashboardMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    let targetYear = String(new Date().getFullYear());
    let targetMonthNum = String(new Date().getMonth() + 1).padStart(2, '0');
    if (!isAllTime) {
        const parts = targetMonthKey.split('-');
        targetYear = parts[0];
        targetMonthNum = parts[1];
    }

    const monthlyTx = isAllTime
        ? (rawData.transactions || [])
        : (rawData.transactions || []).filter(tx => tx.date && tx.date.startsWith(targetMonthKey));

    return { monthlyTx, targetYear, targetMonthNum };
}

function setTrendMode(mode) {
    currentTrendMode = mode;
    const btnDaily = document.getElementById('btnTrendDaily');
    const btnCum = document.getElementById('btnTrendCumulative');
    const subtitle = document.getElementById('trendSubtitle');

    const activeCls = "px-2.5 py-1 text-[11px] font-bold rounded-lg bg-brand-slate text-white shadow-sm transition-all";
    const inactiveCls = "px-2.5 py-1 text-[11px] font-bold rounded-lg text-brand-charcoal hover:text-brand-slate transition-all";

    if (btnDaily) btnDaily.className = mode === 'daily' ? activeCls : inactiveCls;
    if (btnCum) btnCum.className = mode === 'cumulative' ? activeCls : inactiveCls;
    if (subtitle) {
        subtitle.innerText = mode === 'daily' ? 'Daily outflow across the month' : 'Running cumulative spend toward monthly cap';
    }
    const { monthlyTx, targetYear, targetMonthNum } = getActiveDashboardScope();
    renderTrendChart(monthlyTx, targetYear, targetMonthNum, true);
}

let masterLogScope = 'current';

function openMasterLogForCurrentMonth() {
    masterLogScope = 'current';
    switchView('masterLog', true);
}

function returnToDashboard() {
    switchView('dashboard', true);
}

let currentMasterFiltered = [];

function renderMasterLog() {
    const desktopTbody = document.getElementById('masterLogTableBody');
    const mobileContainer = document.getElementById('masterLogCardListMobile');
    const searchInput = document.getElementById('logSearchInput');
    const subtitleEl = document.getElementById('masterLogSubtitle');
    
    if (!rawData || !rawData.transactions) {
        setTimeout(renderMasterLog, 50);
        return;
    }

    const query = searchInput ? searchInput.value.toLowerCase() : '';
    const targetMonthKey = selectedDashboardMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    
    const txs = (rawData.transactions || []).filter(tx => {
        if (!tx.date) return false;

        if (masterLogScope === 'current') {
            if (!tx.date.startsWith(targetMonthKey)) return false;
        } else if (masterLogScope !== 'all') {
            if (!tx.date.startsWith(masterLogScope)) return false;
        }

        if (!query) return true;
        return (tx.date.toLowerCase().includes(query)) ||
               (tx.parentCategory && tx.parentCategory.toLowerCase().includes(query)) ||
               (tx.subcategory && tx.subcategory.toLowerCase().includes(query)) ||
               (tx.notes && tx.notes.toLowerCase().includes(query));
    });

    if (subtitleEl) {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        if (masterLogScope === 'current') {
            const [y, m] = targetMonthKey.split('-');
            subtitleEl.innerText = `Filtered for active dashboard month: ${monthNames[parseInt(m, 10) - 1]} ${y}`;
        } else if (masterLogScope === 'all') {
            subtitleEl.innerText = `Showing complete all-time raw transaction archive (${txs.length} entries)`;
        } else {
            const [y, m] = masterLogScope.split('-');
            subtitleEl.innerText = `Filtered for selected month: ${monthNames[parseInt(m, 10) - 1]} ${y}`;
        }
    }

    currentMasterFiltered = txs;

    if (txs.length === 0) {
        const emptyTableHTML = `<tr><td colspan="5" class="py-6 text-center text-brand-charcoal italic">No matching transaction records found for this view.</td></tr>`;
        const emptyCardHTML = `<div class="py-6 text-center text-brand-charcoal italic text-xs">No matching transaction records found for this view.</div>`;
        if (desktopTbody) desktopTbody.innerHTML = emptyTableHTML;
        if (mobileContainer) mobileContainer.innerHTML = emptyCardHTML;
        return;
    }

    let desktopRowsHTML = '';
    let mobileCardsHTML = '';

    txs.forEach(tx => {
        const color = CATEGORY_COLORS[tx.parentCategory] || '#0D9488';
        
        desktopRowsHTML += `
            <tr class="hover:bg-brand-canvas/60 transition-colors">
                <td class="py-3 px-3 font-semibold text-brand-slate">${tx.date}</td>
                <td class="py-3 px-3">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold" style="background-color: ${color}15; color: ${color}">
                        <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${color}"></span>
                        ${tx.parentCategory}
                    </span>
                </td>
                <td class="py-3 px-3 text-brand-charcoal font-medium">${tx.subcategory}</td>
                <td class="py-3 px-3 text-brand-charcoal text-xs">${tx.notes || '—'}</td>
                <td class="py-3 px-3 text-right font-bold text-brand-slate">₹${Number(tx.amount || 0).toFixed(2)}</td>
            </tr>
        `;

        mobileCardsHTML += `
            <div class="bg-brand-canvas/60 border border-brand-border rounded-xl p-3.5 space-y-2">
                <div class="flex items-center justify-between">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-semibold" style="background-color: ${color}15; color: ${color}">
                        <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${color}"></span>
                        ${tx.parentCategory}
                    </span>
                    <span class="text-sm font-black text-brand-slate">₹${Number(tx.amount || 0).toFixed(2)}</span>
                </div>
                <div class="flex items-center justify-between text-xs font-semibold text-brand-slate">
                    <span>${tx.subcategory}</span>
                    <span class="text-[11px] text-brand-charcoal font-medium">${tx.date}</span>
                </div>
                ${tx.notes ? `<p class="text-[11px] text-brand-charcoal pt-1 border-t border-brand-border/60"><strong>Notes:</strong> ${tx.notes}</p>` : ''}
            </div>
        `;
    });

    if (desktopTbody) desktopTbody.innerHTML = desktopRowsHTML;
    if (mobileContainer) mobileContainer.innerHTML = mobileCardsHTML;
}

// --- Data Explorer Logic ---
function toggleExplorerInputs() {
    const mode = document.getElementById('expScopeMode').value;
    const startWrap = document.getElementById('expInputStartWrap');
    const endWrap = document.getElementById('expInputEndWrap');
    const monthWrap = document.getElementById('expInputMonthWrap');
    const startLabel = document.getElementById('expStartLabel');

    if (!startWrap || !endWrap || !monthWrap) return;

    startWrap.classList.add('hidden');
    endWrap.classList.add('hidden');
    monthWrap.classList.add('hidden');

    if (mode === 'range') {
        startLabel.innerText = 'From Date';
        startWrap.classList.remove('hidden');
        endWrap.classList.remove('hidden');
    } else if (mode === 'single') {
        startLabel.innerText = 'Select Date';
        startWrap.classList.remove('hidden');
    } else if (mode === 'month') {
        monthWrap.classList.remove('hidden');
    }
}

function showExpError(title, msg) {
    const banner = document.getElementById('expErrorBanner');
    if (!banner) return;
    document.getElementById('expErrorTitle').innerText = title;
    document.getElementById('expErrorMsg').innerText = msg;
    
    banner.classList.remove('hidden');
    requestAnimationFrame(() => {
        banner.classList.remove('opacity-0', '-translate-y-2');
        banner.classList.add('opacity-100', 'translate-y-0');
    });
}

function dismissExpError() {
    const banner = document.getElementById('expErrorBanner');
    if (!banner) return;
    banner.classList.remove('opacity-100', 'translate-y-0');
    banner.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => banner.classList.add('hidden'), 300);
}

let currentExplorerFiltered = [];
let currentExplorerScopeLabel = 'All Transactions';

function runExplorerFilter() {
    const mode = document.getElementById('expScopeMode').value;
    const startDate = document.getElementById('expStartDate').value;
    const endDate = document.getElementById('expEndDate').value;
    const monthVal = document.getElementById('expMonthInput').value;
    const category = document.getElementById('expCategoryFilter').value;

    if (mode === 'range' && (!startDate || !endDate)) {
        showExpError('Missing Date Range', 'Please select both From Date and To Date.');
        return;
    }
    if (mode === 'single' && !startDate) {
        showExpError('Missing Date', 'Please select a specific date.');
        return;
    }
    if (mode === 'month' && !monthVal) {
        showExpError('Missing Month', 'Please select a target month.');
        return;
    }

    dismissExpError();

    let scopeLabel = 'All-Time Archive';
    const filtered = (rawData.transactions || []).filter(tx => {
        if (!tx.date) return false;
        if (category !== 'All' && tx.parentCategory !== category) return false;

        if (mode === 'range') {
            scopeLabel = `${startDate} to ${endDate}`;
            return tx.date >= startDate && tx.date <= endDate;
        } else if (mode === 'single') {
            scopeLabel = `Date: ${startDate}`;
            return tx.date === startDate;
        } else if (mode === 'month') {
            scopeLabel = `Month: ${monthVal}`;
            return tx.date.startsWith(monthVal);
        }
        return true;
    });

    if (category !== 'All') scopeLabel += ` • ${category}`;

    currentExplorerFiltered = filtered;
    currentExplorerScopeLabel = scopeLabel;

    const total = filtered.reduce((sum, tx) => sum + tx.amount, 0);
    const count = filtered.length;

    document.getElementById('expActiveScopeLabel').innerText = scopeLabel;
    document.getElementById('expResultCount').innerText = `${count} transaction${count === 1 ? '' : 's'}`;
    document.getElementById('expKpiTotal').innerText = '₹' + total.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    document.getElementById('expKpiSub').innerText = mode === 'all' ? 'Lifetime cumulative spend' : 'Total spend in selected scope';

    const kpiAvgEl = document.getElementById('expKpiAvg');
    const kpiCountSubEl = document.getElementById('expKpiCountSub');
    const card2TitleEl = kpiAvgEl.previousElementSibling;

    if (mode === 'range') {
        if (card2TitleEl) card2TitleEl.innerText = 'Highest Spend Day';
        const dateTotals = {}, dateCounts = {};
        filtered.forEach(tx => {
            dateTotals[tx.date] = (dateTotals[tx.date] || 0) + tx.amount;
            dateCounts[tx.date] = (dateCounts[tx.date] || 0) + 1;
        });

        let peakDate = '—', peakAmount = 0, peakTxCount = 0;
        Object.keys(dateTotals).forEach(d => {
            if (dateTotals[d] > peakAmount) {
                peakAmount = dateTotals[d];
                peakDate = d;
                peakTxCount = dateCounts[d];
            }
        });

        if (peakDate !== '—') {
            const formattedDate = new Date(peakDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            kpiAvgEl.innerText = '₹' + peakAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
            kpiCountSubEl.innerText = `${formattedDate} (${peakTxCount} entry)`;
        } else {
            kpiAvgEl.innerText = '₹0.00';
            kpiCountSubEl.innerText = 'No entries recorded';
        }
    } else if (mode === 'month') {
        if (card2TitleEl) card2TitleEl.innerText = 'Monthly Budget Pacing';
        const [y, m] = monthVal ? monthVal.split('-') : ['', ''];
        const monthlyCap = getAllowanceForMonth(y, m);
        const pctUsed = monthlyCap > 0 ? ((total / monthlyCap) * 100).toFixed(1) : (total > 0 ? '100+' : '0.0');
        const remaining = monthlyCap - total;

        kpiAvgEl.innerText = monthlyCap > 0 ? `${pctUsed}% Used` : 'No Budget Allotted';
        kpiCountSubEl.innerText = monthlyCap > 0 ? `₹${remaining.toLocaleString('en-IN')} remaining` : `₹${total.toLocaleString('en-IN')} spent`;
    } else if (mode === 'single') {
        if (card2TitleEl) card2TitleEl.innerText = 'Daily Activity Density';
        kpiAvgEl.innerText = `${count} Entry${count === 1 ? '' : 's'}`;
        kpiCountSubEl.innerText = count > 0 ? 'Logged on this date' : 'No spending recorded';
    } else {
        if (card2TitleEl) card2TitleEl.innerText = 'Historical Monthly Average';
        const uniqueMonths = new Set((rawData.transactions || []).filter(t => t.date).map(t => t.date.substring(0, 7)));
        const monthDivisor = Math.max(1, uniqueMonths.size);
        kpiAvgEl.innerText = '₹' + (total > 0 ? (total / monthDivisor).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '0');
        kpiCountSubEl.innerText = `Across ${monthDivisor} recorded month(s)`;
    }

    const catTotals = {};
    filtered.forEach(tx => {
        catTotals[tx.parentCategory] = (catTotals[tx.parentCategory] || 0) + tx.amount;
    });
    const sortedCats = Object.keys(catTotals)
        .map(name => ({ name, amount: catTotals[name] }))
        .sort((a, b) => b.amount - a.amount);

    const topCatEl = document.getElementById('expKpiTopCat');
    const topCatAmtEl = document.getElementById('expKpiTopCatAmount');
    if (sortedCats.length > 0) {
        const top = sortedCats[0];
        const pct = total > 0 ? ((top.amount / total) * 100).toFixed(1) : 0;
        topCatEl.innerText = top.name;
        topCatAmtEl.innerText = `₹${top.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${pct}%)`;
    } else {
        topCatEl.innerText = 'No Data';
        topCatAmtEl.innerText = '₹0.00 (0%)';
    }

    const catList = document.getElementById('expCategoryList');
    catList.innerHTML = '';
    sortedCats.forEach(item => {
        const pct = total > 0 ? (item.amount / total) * 100 : 0;
        const color = CATEGORY_COLORS[item.name] || '#0D9488';
        catList.innerHTML += `
            <div class="space-y-1.5">
                <div class="flex items-center justify-between text-xs">
                    <span class="font-semibold text-brand-slate flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full" style="background-color: ${color}"></span>
                        ${item.name}
                    </span>
                    <span class="font-bold text-brand-slate">₹${item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} <span class="text-brand-charcoal font-normal">(${pct.toFixed(1)}%)</span></span>
                </div>
                <div class="w-full bg-brand-canvas h-2 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500" style="width: ${pct}%; background-color: ${color}"></div>
                </div>
            </div>
        `;
    });

    const tbody = document.getElementById('expTableBody');
    tbody.innerHTML = '';
    filtered.forEach(tx => {
        const color = CATEGORY_COLORS[tx.parentCategory] || '#0D9488';
        tbody.innerHTML += `
            <tr class="hover:bg-brand-canvas/60 transition-colors">
                <td class="py-3 px-2 text-xs font-semibold text-brand-slate whitespace-nowrap">${tx.date}</td>
                <td class="py-3 px-2">
                    <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold" style="background-color: ${color}15; color: ${color}">
                        ${tx.parentCategory}
                    </span>
                </td>
                <td class="py-3 px-2">
                    <p class="text-xs font-bold text-brand-slate">${tx.subcategory}</p>
                    <p class="text-[11px] text-brand-charcoal">${tx.notes || '—'}</p>
                </td>
                <td class="py-3 px-2 text-right text-xs font-bold text-brand-slate">₹${tx.amount.toFixed(2)}</td>
            </tr>
        `;
    });

    const placeholder = document.getElementById('expPlaceholder');
    const results = document.getElementById('expResultsContainer');

    if (!placeholder.classList.contains('hidden')) {
        placeholder.classList.remove('opacity-100', 'translate-y-0');
        placeholder.classList.add('opacity-0', '-translate-y-2');
        
        setTimeout(() => {
            placeholder.classList.add('hidden');
            results.classList.remove('hidden');
            requestAnimationFrame(() => {
                results.classList.remove('opacity-0', 'translate-y-3');
                results.classList.add('opacity-100', 'translate-y-0');
            });
        }, 250);
    }
}

function resetExplorer() {
    document.getElementById('expScopeMode').value = 'range';
    document.getElementById('expStartDate').value = '';
    document.getElementById('expEndDate').value = '';
    document.getElementById('expMonthInput').value = '';
    document.getElementById('expCategoryFilter').value = 'All';
    toggleExplorerInputs();
    dismissExpError();

    const placeholder = document.getElementById('expPlaceholder');
    const results = document.getElementById('expResultsContainer');

    results.classList.remove('opacity-100', 'translate-y-0');
    results.classList.add('opacity-0', 'translate-y-3');

    setTimeout(() => {
        results.classList.add('hidden');
        placeholder.classList.remove('hidden');
        requestAnimationFrame(() => {
            placeholder.classList.remove('opacity-0', '-translate-y-2');
            placeholder.classList.add('opacity-100', 'translate-y-0');
        });
    }, 250);
}

function getDataSignature(data) {
    if (!data || typeof data !== 'object') return '';
    return JSON.stringify({
        allowances: data.allowances || {},
        categories: data.categories || [],
        transactions: data.transactions || []
    });
}

function getDataSignature(data) {
    if (!data || typeof data !== 'object') return '';
    return JSON.stringify({
        allowances: data.allowances || {},
        categories: data.categories || [],
        transactions: data.transactions || []
    });
}

function hydrateFromCache() {
    try {
        const rawCached = localStorage.getItem('budgetTracker_cache');
        if (!rawCached) return false;
        const parsed = JSON.parse(rawCached);
        if (!parsed || typeof parsed !== 'object') return false;
        rawData = parsed;
        if (typeof populateCategoryDropdown === 'function') {
            populateCategoryDropdown();
        }
        renderApp({ animate: false });
        if (typeof currentActiveView !== 'undefined' && currentActiveView === 'masterLog' && typeof renderMasterLog === 'function') {
            renderMasterLog();
        }
        return true;
    } catch (err) {
        console.error('Cache hydration failed:', err);
        return false;
    }
}

function applyIncomingData(nextData, { silentIfUnchanged = false } = {}) {
    if (!nextData || typeof nextData !== 'object') return false;
    const prevSig = getDataSignature(rawData);
    const nextSig = getDataSignature(nextData);

    if (silentIfUnchanged && prevSig && prevSig === nextSig) {
        return false;
    }

    rawData = nextData;
    try {
        localStorage.setItem('budgetTracker_cache', JSON.stringify(nextData));
    } catch (err) {
        console.error('Cache write failed:', err);
    }

    if (typeof populateCategoryDropdown === 'function') {
        populateCategoryDropdown();
    }

    const animate = !silentIfUnchanged || !prevSig;
    renderApp({ animate });

    if (typeof currentActiveView !== 'undefined' && currentActiveView === 'masterLog' && typeof renderMasterLog === 'function') {
        renderMasterLog();
    }
    return true;
}

function bootBudgetTracker() {
    const savedTheme = localStorage.getItem('budget_tracker_theme') || 'light';
    if (typeof applyTheme === 'function') {
        applyTheme(savedTheme, false);
    }
    const hadCache = hydrateFromCache();
    if (typeof loadData === 'function') {
        loadData({ silentIfUnchanged: hadCache });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootBudgetTracker, { once: true });
} else {
    bootBudgetTracker();
}

function downloadCSV(filename, rows) {
    let csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.map(val => {
        if (val === null || val === undefined) return '""';
        let stringVal = String(val).replace(/"/g, '""');
        return `"${stringVal}"`;
    }).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportExplorerCSV() {
    if (!currentExplorerFiltered || currentExplorerFiltered.length === 0) {
        alert("No filtered transactions to export.");
        return;
    }
    const rows = [["Date", "Parent Category", "Subcategory", "Notes", "Amount (INR)"]];
    currentExplorerFiltered.forEach(tx => {
        rows.push([tx.date, tx.parentCategory, tx.subcategory, tx.notes || "", tx.amount]);
    });
    const safeLabel = currentExplorerScopeLabel.replace(/[^a-zA-Z0-9]/g, '_');
    downloadCSV(`allowance_explorer_${safeLabel}.csv`, rows);
}

function exportMasterCSV() {
    const dataset = currentMasterFiltered.length > 0 ? currentMasterFiltered : rawData.transactions;
    if (!dataset || dataset.length === 0) {
        alert("No transaction records found.");
        return;
    }
    const rows = [["Date", "Parent Category", "Subcategory", "Notes", "Amount (INR)"]];
    dataset.forEach(tx => {
        rows.push([tx.date, tx.parentCategory, tx.subcategory, tx.notes || "", tx.amount]);
    });
    downloadCSV(`master_tracker_raw_log.csv`, rows);
}

function triggerPrintReport(title, scopeText, totalAmount, txList) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Popup blocked!");
        return;
    }

    const catTotals = {};
    txList.forEach(tx => {
        catTotals[tx.parentCategory] = (catTotals[tx.parentCategory] || 0) + tx.amount;
    });
    const sortedCats = Object.keys(catTotals).map(name => ({ name, amount: catTotals[name] })).sort((a, b) => b.amount - a.amount);

    let catBreakdownHtml = '';
    sortedCats.forEach(cat => {
        const pct = totalAmount > 0 ? ((cat.amount / totalAmount) * 100).toFixed(1) : 0;
        catBreakdownHtml += `<div style="margin-bottom: 8px; font-size: 11px;"><div style="display: flex; justify-content:between; font-weight: bold; margin-bottom: 2px;"><span>${cat.name}</span><span>₹${cat.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${pct}%)</span></div><div style="background: #E2E8F0; height: 6px; border-radius: 3px; overflow: hidden;"><div style="background: #0D9488; height: 100%; width: ${pct}%;"></div></div></div>`;
    });

    let rowsHtml = '';
    txList.forEach(tx => {
        rowsHtml += `<tr><td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 11px;">${tx.date || ''}</td><td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 11px; font-weight: 600;">${tx.parentCategory || ''}</td><td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 11px;">${tx.subcategory || ''}</td><td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 11px; text-align: right; font-weight: bold;">₹${Number(tx.amount || 0).toFixed(2)}</td></tr>`;
    });

    const htmlContent = `<!DOCTYPE html><html><head><title>${title}</title><style>body { font-family: sans-serif; color: #0F172A; padding: 30px; }</style></head><body><h1>${title}</h1><p>Scope: <b>${scopeText}</b></p><table><thead><tr><th>Date</th><th>Category</th><th>Subcategory</th><th style="text-align: right;">Amount</th></tr></thead><tbody>${rowsHtml}</tbody></table><script>setTimeout(() => window.print(), 300);</script></body></html>`;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

function exportExplorerPDF() {
    if (!currentExplorerFiltered || currentExplorerFiltered.length === 0) {
        alert("No filtered transactions to export.");
        return;
    }
    const total = currentExplorerFiltered.reduce((sum, tx) => sum + tx.amount, 0);
    triggerPrintReport("Custom Financial Report", currentExplorerScopeLabel, total, currentExplorerFiltered);
}

function exportMasterPDF() {
    const dataset = currentMasterFiltered.length > 0 ? currentMasterFiltered : rawData.transactions;
    if (!dataset || dataset.length === 0) {
        alert("No transaction records found.");
        return;
    }
    const total = dataset.reduce((sum, tx) => sum + tx.amount, 0);
    triggerPrintReport("Master Tracker Raw Log", "All Matching Raw Records", total, dataset);
}

function renderRecentTransactions(monthlyTx) {
    const container = document.getElementById('recentTransactionsContainer');
    if (!container) return;
    container.innerHTML = '';

    const txSource = (monthlyTx && monthlyTx.length > 0) ? monthlyTx : (rawData.transactions || []);
    if (txSource.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-xs text-brand-charcoal italic">No transaction records found.</div>`;
        return;
    }

    const sortedTx = [...txSource].sort((a, b) => new Date(b.date || '') - new Date(a.date || '')).slice(0, 4);

    sortedTx.forEach(tx => {
        const div = document.createElement('div');
        div.className = "p-3 mb-2.5 rounded-xl border border-brand-border bg-brand-card hover:bg-brand-canvas/60 transition-all flex items-center justify-between";
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-brand-canvas flex items-center justify-center text-brand-charcoal shrink-0">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                </div>
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-brand-slate">${tx.subcategory || 'Expense'}</span>
                        <span class="text-[10px] text-brand-charcoal font-medium">(${tx.parentCategory || ''})</span>
                    </div>
                    <p class="text-[11px] text-brand-charcoal mt-0.5">${tx.date || '—'}${tx.notes ? ' • ' + tx.notes : ''}</p>
                </div>
            </div>
            <span class="text-xs font-extrabold text-brand-slate">₹${Number(tx.amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
        `;
        container.appendChild(div);
    });
}

// Theme Toggle Logic
const themes = ['light', 'dark'];
const themeIcons = {
    light: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>',
    dark: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>'
};

function updateChartsTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    if (trendChartInstance) {
        trendChartInstance.options.animation = false;
        if (trendChartInstance.options.scales?.x?.ticks) {
            trendChartInstance.options.scales.x.ticks.color = isDark ? '#94A3B8' : '#64748B';
        }
        if (trendChartInstance.options.scales?.y?.ticks) {
            trendChartInstance.options.scales.y.ticks.color = isDark ? '#94A3B8' : '#64748B';
        }
        if (trendChartInstance.options.scales?.y?.grid) {
            trendChartInstance.options.scales.y.grid.color = isDark ? 'rgba(148, 163, 184, 0.12)' : '#F1F5F9';
        }
        trendChartInstance.update('none');
    }

    if (donutChartInstance) {
        donutChartInstance.options.animation = false;
        const ds = donutChartInstance.data.datasets[0];
        if (ds) {
            ds.borderColor = isDark ? '#111827' : '#ffffff';
            const remIdx = donutChartInstance.data.labels.indexOf('Remaining Budget');
            if (remIdx !== -1 && Array.isArray(ds.backgroundColor)) {
                ds.backgroundColor[remIdx] = isDark ? '#1E293B' : '#ECFDF5';
            }
        }
        donutChartInstance.update('none');
    }
}

function applyTheme(themeName, animate = true) {
    const root = document.documentElement;

    if (animate) {
        root.classList.add('theme-switching');
    }

    localStorage.setItem('budget_tracker_theme', themeName);
    root.setAttribute('data-theme', themeName);
    root.style.backgroundColor = themeName === 'dark' ? '#090D16' : '';
    root.style.colorScheme = themeName === 'dark' ? 'dark' : 'light';

    const container = document.getElementById('themeIconContainer');
    if (container) {
        const nextIcon = themeIcons[themeName] || themeIcons['light'];
        if (!animate) {
            container.style.transition = 'none';
            container.innerHTML = nextIcon;
            container.style.transform = 'scale(1) rotate(0deg)';
            container.style.opacity = '1';
            requestAnimationFrame(() => {
                container.style.transition = '';
            });
        } else {
            container.style.transform = 'scale(0) rotate(-45deg)';
            container.style.opacity = '0';
            setTimeout(() => {
                container.innerHTML = nextIcon;
                container.style.transform = 'scale(1) rotate(0deg)';
                container.style.opacity = '1';
            }, 150);
        }
    }

    updateChartsTheme();

    if (animate) {
        void root.offsetHeight;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                root.classList.remove('theme-switching');
            });
        });
    }
}

function cycleTheme() {
    const currentTheme = localStorage.getItem('budget_tracker_theme') || 'light';
    const currentIndex = themes.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    applyTheme(themes[nextIndex], true);
}

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('budget_tracker_theme') || 'light';
    applyTheme(savedTheme, false);
});

window.addEventListener('scroll', () => {
    const hdr = document.getElementById('appHeader');
    if (!hdr) return;
    hdr.classList.toggle('is-scrolled', window.scrollY > 6);
}, { passive: true });

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  // Prevent automatic mini-infobar on mobile/desktop so you control when to show UI
  event.preventDefault();
  deferredInstallPrompt = event;

  // Optional: show your custom install button if you have one in HTML (e.g., id="installAppBtn")
  const installBtn = document.getElementById("installAppBtn");
  if (installBtn) {
    installBtn.classList.remove("hidden");
  }
});

async function installBudgetTrackerApp() {
  if (!deferredInstallPrompt) return;

  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;

  const installBtn = document.getElementById("installAppBtn");
  if (installBtn && outcome === "accepted") {
    installBtn.classList.add("hidden");
  }
}

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const installBtn = document.getElementById("installAppBtn");
  if (installBtn) {
    installBtn.classList.add("hidden");
  }
});