// ========== STATE ==========
const API = 'http://localhost:3000';
let currentUser = null;
let currentDb = 'oracle';
let currentPage = 'dashboard';

// ========== BOOT ==========
document.addEventListener('DOMContentLoaded', () => {
    const token = sessionStorage.getItem('track_token');
    const userJson = sessionStorage.getItem('track_user');

    if (!token || !userJson) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = JSON.parse(userJson);
    initUI();
    loadPage('dashboard');
});

// ========== API HELPER ==========
async function api(method, path, body = null) {
    const token = sessionStorage.getItem('track_token');
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': token
        }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// ========== UI INIT ==========
function initUI() {
    // Officer info
    const initials = (currentUser.first_name[0] + currentUser.last_name[0]).toUpperCase();
    document.getElementById('officer-avatar').textContent = initials;
    document.getElementById('officer-name').textContent = currentUser.first_name + ' ' + currentUser.last_name;
    document.getElementById('officer-meta').textContent = currentUser.role.toUpperCase() + ' -- ' + currentUser.rank.toUpperCase();

    // Admin nav items
    if (currentUser.role === 'Admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    }

    // DB switch
    document.getElementById('db-switch-btn').addEventListener('click', switchDb);

    // Nav
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.getAttribute('data-page');
            setActivePage(page);
            loadPage(page);
        });
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', logout);
}

function setActivePage(page) {
    currentPage = page;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const target = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (target) target.classList.add('active');
}

// ========== DB SWITCH with TRANSITION ==========
async function switchDb() {
    const next = currentDb === 'oracle' ? 'mongo' : 'oracle';
    const label = next === 'mongo' ? 'SWITCHING TO MONGODB' : 'SWITCHING TO ORACLE XE';

    const overlay = document.getElementById('db-transition');
    const labelEl = document.getElementById('db-transition-label');

    labelEl.textContent = label;
    overlay.classList.add('active');

    await sleep(700);

    currentDb = next;
    document.body.className = 'db-' + currentDb;

    const nameEl = document.getElementById('db-switch-name');
    const hintEl = document.getElementById('db-switch-hint');

    if (currentDb === 'oracle') {
        nameEl.textContent = 'Oracle XE';
        hintEl.textContent = 'Relational -- SQL';
    } else {
        nameEl.textContent = 'MongoDB';
        hintEl.textContent = 'Document -- NoSQL';
    }

    await loadPage(currentPage);
    await sleep(200);
    overlay.classList.remove('active');
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ========== LOGOUT ==========
async function logout() {
    try { await api('POST', '/api/logout'); } catch (_) {}
    sessionStorage.removeItem('track_token');
    sessionStorage.removeItem('track_user');
    window.location.href = 'login.html';
}

// ========== PAGE ROUTER ==========
async function loadPage(page) {
    const main = document.getElementById('main-content');
    main.innerHTML = `<div class="page-loading">Loading ${page}...</div>`;

    try {
        switch (page) {
            case 'dashboard': await renderDashboard(main); break;
            case 'cases':     await renderCases(main); break;
            case 'criminals': await renderCriminals(main); break;
            case 'fir':       await renderFIR(main); break;
            case 'evidence':  await renderEvidence(main); break;
            case 'victims':   await renderVictims(main); break;
            case 'officers':
                if (currentUser.role === 'Admin') await renderOfficers(main);
                else main.innerHTML = accessDenied();
                break;
            case 'query':
                if (currentUser.role === 'Admin') renderQueryEditor(main);
                else main.innerHTML = accessDenied();
                break;
            default:
                main.innerHTML = `<div class="page-loading">Page not found</div>`;
        }
    } catch (err) {
        main.innerHTML = errorBlock(err.message);
    }
}

// ========== HELPERS: HTML BUILDERS ==========
function pageHeader(title, sub) {
    const dbLabel = currentDb === 'oracle' ? 'Oracle XE' : 'MongoDB';
    return `
        <div class="page-header">
            <div class="page-header-left">
                <div class="page-title">${title}</div>
                <div class="page-sub">${sub}</div>
            </div>
            <div class="db-badge">${dbLabel}</div>
        </div>
    `;
}

function accessDenied() {
    return `<div class="page-loading">Access denied. Admin only.</div>`;
}

function errorBlock(msg) {
    return `<div class="page-loading" style="color:var(--danger)">Error: ${esc(msg)}</div>`;
}

function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(val) {
    if (!val) return '--';
    try { return new Date(val).toLocaleDateString('en-GB'); } catch { return '--'; }
}

function statusBadge(s, type) {
    if (!s) return '--';
    const map = {
        Arrested: 'badge-arrested', Wanted: 'badge-wanted', Released: 'badge-released',
        Open: 'badge-open', Closed: 'badge-closed', 'Under Investigation': 'badge-under',
        Admin: 'badge-admin', Regular: 'badge-regular'
    };
    return `<span class="badge ${map[s] || ''}">${esc(s)}</span>`;
}

// ========== NOTIFICATIONS ==========
function notify(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `notif ${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

// ========== MODAL ==========
function showModal(html, onSubmit) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', e => {
        if (e.target === backdrop) backdrop.remove();
    });

    const form = backdrop.querySelector('form');
    if (form) {
        form.addEventListener('submit', async e => {
            e.preventDefault();
            await onSubmit(backdrop);
        });
    }

    const cancelBtn = backdrop.querySelector('[data-cancel]');
    if (cancelBtn) cancelBtn.addEventListener('click', () => backdrop.remove());

    return backdrop;
}

// ========== DASHBOARD ==========
async function renderDashboard(el) {
    const stats = await api('GET', `/api/${currentDb}/stats`);

    el.innerHTML = `
        ${pageHeader('Dashboard', 'System overview')}

        <div class="stats-grid">
            ${statCard(stats.officers, 'Officers')}
            ${statCard(stats.criminals, 'Criminals')}
            ${statCard(stats.cases, 'Cases')}
            ${statCard(stats.evidence, 'Evidence')}
            ${statCard(stats.firs, 'FIRs')}
            ${statCard(stats.victims, 'Victims')}
        </div>

        <div class="card">
            <div class="card-header"><span class="card-title">Session Info</span></div>
            <div class="card-body">
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Officer</div>
                        <div class="info-value">${esc(currentUser.first_name)} ${esc(currentUser.last_name)}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Role</div>
                        <div class="info-value">${esc(currentUser.role)}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Rank</div>
                        <div class="info-value">${esc(currentUser.rank)}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Officer ID</div>
                        <div class="info-value">${esc(currentUser.officer_id)}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Database Mode</div>
                        <div class="info-value">${currentDb === 'oracle' ? 'Oracle XE (Relational)' : 'MongoDB (Document)'}</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function statCard(val, label) {
    return `
        <div class="stat-card">
            <div class="stat-value">${val ?? '--'}</div>
            <div class="stat-label">${label}</div>
        </div>
    `;
}

// ========== CASES ==========
async function renderCases(el) {
    const isAdmin = currentUser.role === 'Admin';
    const endpoint = isAdmin
        ? `/api/${currentDb}/cases/all`
        : `/api/${currentDb}/cases/my/${currentUser.officer_id}`;

    const cases = await api('GET', endpoint);

    const rows = cases.map(c => {
        const id = c.CASE_ID ?? c.case_id;
        const title = c.C_TITLE ?? c.c_title;
        const status = c.C_STATUS ?? c.c_status;
        const firId = c.FIR_ID ?? c.fir_id;
        const openDate = c.OPEN_DATE ?? c.open_date;
        const closeDate = c.CLOSE_DATE ?? c.close_date;

        return `<tr>
            <td><span style="font-family:var(--mono);color:var(--active)">${esc(id)}</span></td>
            <td>${esc(title)}</td>
            <td>${fmtDate(openDate)}</td>
            <td>${fmtDate(closeDate)}</td>
            <td>${statusBadge(status)}</td>
            <td>${esc(firId)}</td>
            <td>
                <div class="btn-actions">
                    <button class="btn btn-ghost btn-sm" onclick="openUpdateCaseModal(${id},'${esc(status)}')">Update</button>
                    ${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="deleteCase(${id})">Delete</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
        ${pageHeader('Cases', isAdmin ? 'All cases in system' : 'Cases assigned to you')}

        <div class="card" style="margin-bottom:16px">
            <div class="card-header"><span class="card-title">Create New Case</span></div>
            <div class="card-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Case Title</label>
                        <input class="form-input" id="c-title" placeholder="e.g. Burglary Investigation">
                    </div>
                    <div class="form-group">
                        <label class="form-label">FIR ID</label>
                        <input class="form-input" id="c-fir" type="number" placeholder="FIR ID">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Status</label>
                        <select class="form-select" id="c-status">
                            <option value="Open">Open</option>
                            <option value="Under Investigation">Under Investigation</option>
                            <option value="Closed">Closed</option>
                        </select>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="createCase()">Create Case</button>
            </div>
        </div>

        <div class="card">
            <div class="card-header"><span class="card-title">Case Records (${cases.length})</span></div>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>ID</th><th>Title</th><th>Opened</th><th>Closed</th><th>Status</th><th>FIR</th><th>Actions</th></tr></thead>
                    <tbody>${rows || `<tr><td colspan="7"><div class="empty-state">No cases found</div></td></tr>`}</tbody>
                </table>
            </div>
        </div>
    `;
}

window.createCase = async function () {
    const title = document.getElementById('c-title').value.trim();
    const firId = document.getElementById('c-fir').value;
    const status = document.getElementById('c-status').value;

    if (!title || !firId) { notify('Title and FIR ID are required', 'error'); return; }

    try {
        await api('POST', `/api/${currentDb}/cases/create`, { title, fir_id: firId, status });
        notify('Case created successfully');
        loadPage('cases');
    } catch (e) { notify(e.message, 'error'); }
};

window.openUpdateCaseModal = function (id, currentStatus) {
    const html = `
        <div class="modal-title">Update Case Status</div>
        <form>
            <div class="form-group" style="margin-bottom:16px">
                <label class="form-label">New Status</label>
                <select class="form-select" id="modal-status">
                    <option value="Open" ${currentStatus==='Open'?'selected':''}>Open</option>
                    <option value="Under Investigation" ${currentStatus==='Under Investigation'?'selected':''}>Under Investigation</option>
                    <option value="Closed" ${currentStatus==='Closed'?'selected':''}>Closed</option>
                </select>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-danger btn-sm" data-cancel>Cancel</button>
                <button type="submit" class="btn btn-primary btn-sm">Update</button>
            </div>
        </form>
    `;
    showModal(html, async (backdrop) => {
        const status = backdrop.querySelector('#modal-status').value;
        try {
            await api('PUT', `/api/${currentDb}/cases/update/${id}`, { status });
            notify('Case updated');
            backdrop.remove();
            loadPage('cases');
        } catch (e) { notify(e.message, 'error'); }
    });
};

window.deleteCase = async function (id) {
    if (!confirm(`Delete case ${id}? This cannot be undone.`)) return;
    try {
        await api('DELETE', `/api/${currentDb}/cases/delete/${id}`);
        notify('Case deleted');
        loadPage('cases');
    } catch (e) { notify(e.message, 'error'); }
};

// ========== CRIMINALS ==========
async function renderCriminals(el) {
    const isAdmin = currentUser.role === 'Admin';
    const criminals = await api('GET', `/api/${currentDb}/criminals`);

    const rows = criminals.map(c => {
        const id = c.CR_ID ?? c.cr_id;
        const fn = c.FIRST_NAME ?? c.first_name;
        const ln = c.LAST_NAME ?? c.last_name;
        const status = c.STATUS ?? c.status;
        const city = c.CITY ?? c.city;
        const dist = c.DISTRICT ?? c.district;
        const gender = c.GENDER ?? c.gender;
        const dob = c.DOB ?? c.dob;

        return `<tr>
            <td><span style="font-family:var(--mono);color:var(--active)">${esc(id)}</span></td>
            <td>${esc(fn)}</td>
            <td>${esc(ln)}</td>
            <td>${statusBadge(status)}</td>
            <td>${esc(city)}</td>
            <td>${esc(dist)}</td>
            <td>${esc(gender)}</td>
            <td>${fmtDate(dob)}</td>
            ${isAdmin ? `<td><div class="btn-actions">
                <button class="btn btn-ghost btn-sm" onclick="openUpdateCriminalModal(${id},'${esc(status)}')">Update</button>
                <button class="btn btn-danger btn-sm" onclick="deleteCriminal(${id})">Delete</button>
            </div></td>` : '<td>--</td>'}
        </tr>`;
    }).join('');

    el.innerHTML = `
        ${pageHeader('Criminals', isAdmin ? 'Full access to criminal records' : 'Read-only view')}

        ${isAdmin ? `
        <div class="card" style="margin-bottom:16px">
            <div class="card-header"><span class="card-title">Register Criminal</span></div>
            <div class="card-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">First Name</label>
                        <input class="form-input" id="cr-fn" placeholder="First name">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Last Name</label>
                        <input class="form-input" id="cr-ln" placeholder="Last name">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Gender</label>
                        <select class="form-select" id="cr-gender">
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Status</label>
                        <select class="form-select" id="cr-status">
                            <option value="Arrested">Arrested</option>
                            <option value="Wanted">Wanted</option>
                            <option value="Released">Released</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">City</label>
                        <input class="form-input" id="cr-city" placeholder="City">
                    </div>
                    <div class="form-group">
                        <label class="form-label">District</label>
                        <input class="form-input" id="cr-dist" placeholder="District">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Street</label>
                        <input class="form-input" id="cr-street" placeholder="Street">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Date of Birth</label>
                        <input class="form-input" id="cr-dob" type="date">
                    </div>
                </div>
                <button class="btn btn-primary" onclick="createCriminal()">Register</button>
            </div>
        </div>
        ` : ''}

        <div class="card">
            <div class="card-header"><span class="card-title">Criminal Records (${criminals.length})</span></div>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>ID</th><th>First</th><th>Last</th><th>Status</th><th>City</th><th>District</th><th>Gender</th><th>DOB</th><th>Actions</th></tr></thead>
                    <tbody>${rows || `<tr><td colspan="9"><div class="empty-state">No records</div></td></tr>`}</tbody>
                </table>
            </div>
        </div>
    `;
}

window.createCriminal = async function () {
    const body = {
        first_name: document.getElementById('cr-fn').value.trim(),
        last_name: document.getElementById('cr-ln').value.trim(),
        gender: document.getElementById('cr-gender').value,
        status: document.getElementById('cr-status').value,
        city: document.getElementById('cr-city').value.trim(),
        district: document.getElementById('cr-dist').value.trim(),
        street: document.getElementById('cr-street').value.trim(),
        dob: document.getElementById('cr-dob').value
    };
    if (!body.first_name || !body.last_name) { notify('First and last name required', 'error'); return; }
    try {
        await api('POST', `/api/${currentDb}/criminals/create`, body);
        notify('Criminal registered');
        loadPage('criminals');
    } catch (e) { notify(e.message, 'error'); }
};

window.openUpdateCriminalModal = function (id, currentStatus) {
    const html = `
        <div class="modal-title">Update Criminal Status</div>
        <form>
            <div class="form-group" style="margin-bottom:16px">
                <label class="form-label">New Status</label>
                <select class="form-select" id="modal-cr-status">
                    <option value="Arrested" ${currentStatus==='Arrested'?'selected':''}>Arrested</option>
                    <option value="Wanted" ${currentStatus==='Wanted'?'selected':''}>Wanted</option>
                    <option value="Released" ${currentStatus==='Released'?'selected':''}>Released</option>
                </select>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-danger btn-sm" data-cancel>Cancel</button>
                <button type="submit" class="btn btn-primary btn-sm">Update</button>
            </div>
        </form>
    `;
    showModal(html, async (backdrop) => {
        const status = backdrop.querySelector('#modal-cr-status').value;
        try {
            await api('PUT', `/api/${currentDb}/criminals/update/${id}`, { status });
            notify('Status updated');
            backdrop.remove();
            loadPage('criminals');
        } catch (e) { notify(e.message, 'error'); }
    });
};

window.deleteCriminal = async function (id) {
    if (!confirm(`Delete criminal record ${id}?`)) return;
    try {
        await api('DELETE', `/api/${currentDb}/criminals/delete/${id}`);
        notify('Record deleted');
        loadPage('criminals');
    } catch (e) { notify(e.message, 'error'); }
};

// ========== FIR ==========
async function renderFIR(el) {
    const firs = await api('GET', `/api/${currentDb}/fir`);

    const rows = firs.map(f => {
        const id = f.FIR_ID ?? f.fir_id;
        const no = f.FIR_NO ?? f.fir_no;
        const date = f.FIR_DATE ?? f.fir_date;
        const desc = f.DESCR ?? f.descr;
        const offId = f.OFFICER_ID ?? f.officer_id;

        return `<tr>
            <td><span style="font-family:var(--mono);color:var(--active)">${esc(id)}</span></td>
            <td style="font-family:var(--mono)">${esc(no)}</td>
            <td>${fmtDate(date)}</td>
            <td>${esc(desc)}</td>
            <td>${esc(offId)}</td>
        </tr>`;
    }).join('');

    el.innerHTML = `
        ${pageHeader('FIR Management', 'First Information Reports')}

        <div class="card" style="margin-bottom:16px">
            <div class="card-header"><span class="card-title">File New FIR</span></div>
            <div class="card-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">FIR Number</label>
                        <input class="form-input" id="fir-no" placeholder="e.g. FIR-006">
                    </div>
                    <div class="form-group" style="grid-column: span 2">
                        <label class="form-label">Description</label>
                        <textarea class="form-textarea" id="fir-desc" placeholder="Brief description of the incident"></textarea>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="createFIR()">File FIR</button>
            </div>
        </div>

        <div class="card">
            <div class="card-header"><span class="card-title">FIR Records (${firs.length})</span></div>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>ID</th><th>FIR No.</th><th>Date</th><th>Description</th><th>Officer</th></tr></thead>
                    <tbody>${rows || `<tr><td colspan="5"><div class="empty-state">No FIRs found</div></td></tr>`}</tbody>
                </table>
            </div>
        </div>
    `;
}

window.createFIR = async function () {
    const fir_no = document.getElementById('fir-no').value.trim();
    const descr = document.getElementById('fir-desc').value.trim();
    if (!fir_no) { notify('FIR number is required', 'error'); return; }
    try {
        await api('POST', `/api/${currentDb}/fir/create`, { fir_no, descr });
        notify('FIR filed successfully');
        loadPage('fir');
    } catch (e) { notify(e.message, 'error'); }
};

// ========== EVIDENCE ==========
async function renderEvidence(el) {
    const evidence = await api('GET', `/api/${currentDb}/evidence`);

    const rows = evidence.map(e => {
        const cid = e.CASE_ID ?? e.case_id;
        const eid = e.EVID_ID ?? e.evid_id;
        const desc = e.E_DESC ?? e.e_desc;
        const date = e.COLLECTED_DATE ?? e.collected_date;
        const type = e.EVID_TYPE ?? e.evid_type;

        const typeColors = { Digital: '#70a8ff', Physical: '#e0906a', Document: '#60c090' };
        const col = typeColors[type] || 'var(--text)';

        return `<tr>
            <td><span style="font-family:var(--mono);color:var(--active)">${esc(cid)}</span></td>
            <td><span style="font-family:var(--mono)">${esc(eid)}</span></td>
            <td>${esc(desc)}</td>
            <td>${fmtDate(date)}</td>
            <td><span class="badge" style="color:${col};background:${col}18;border-color:${col}30">${esc(type)}</span></td>
        </tr>`;
    }).join('');

    el.innerHTML = `
        ${pageHeader('Evidence', 'Evidence linked to cases')}

        <div class="card" style="margin-bottom:16px">
            <div class="card-header"><span class="card-title">Add Evidence</span></div>
            <div class="card-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Case ID</label>
                        <input class="form-input" id="ev-cid" type="number" placeholder="Case ID">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Description</label>
                        <input class="form-input" id="ev-desc" placeholder="e.g. CCTV Footage">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Type</label>
                        <select class="form-select" id="ev-type">
                            <option value="Digital">Digital</option>
                            <option value="Physical">Physical</option>
                            <option value="Document">Document</option>
                        </select>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="addEvidence()">Add Evidence</button>
            </div>
        </div>

        <div class="card">
            <div class="card-header"><span class="card-title">Evidence Records (${evidence.length})</span></div>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Case ID</th><th>Evid ID</th><th>Description</th><th>Collected</th><th>Type</th></tr></thead>
                    <tbody>${rows || `<tr><td colspan="5"><div class="empty-state">No evidence records</div></td></tr>`}</tbody>
                </table>
            </div>
        </div>
    `;
}

window.addEvidence = async function () {
    const case_id = document.getElementById('ev-cid').value;
    const e_desc = document.getElementById('ev-desc').value.trim();
    const evid_type = document.getElementById('ev-type').value;
    if (!case_id || !e_desc) { notify('Case ID and description required', 'error'); return; }
    try {
        await api('POST', `/api/${currentDb}/evidence/create`, { case_id, e_desc, evid_type });
        notify('Evidence added');
        loadPage('evidence');
    } catch (e) { notify(e.message, 'error'); }
};

// ========== VICTIMS ==========
async function renderVictims(el) {
    const victims = await api('GET', `/api/${currentDb}/victims`);

    const rows = victims.map(v => {
        const id = v.VICTIM_ID ?? v.victim_id;
        const fn = v.FIRST_NAME ?? v.first_name;
        const ln = v.LAST_NAME ?? v.last_name;
        const gender = v.GENDER ?? v.gender;
        const contact = v.CONTACT_NO ?? v.contact_no;

        return `<tr>
            <td><span style="font-family:var(--mono);color:var(--active)">${esc(id)}</span></td>
            <td>${esc(fn)}</td>
            <td>${esc(ln)}</td>
            <td>${esc(gender)}</td>
            <td style="font-family:var(--mono)">${esc(contact) || '--'}</td>
        </tr>`;
    }).join('');

    el.innerHTML = `
        ${pageHeader('Victims', 'Registered victims of crimes')}

        <div class="card">
            <div class="card-header"><span class="card-title">Victim Records (${victims.length})</span></div>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>ID</th><th>First Name</th><th>Last Name</th><th>Gender</th><th>Contact</th></tr></thead>
                    <tbody>${rows || `<tr><td colspan="5"><div class="empty-state">No victims recorded</div></td></tr>`}</tbody>
                </table>
            </div>
        </div>
    `;
}

// ========== OFFICERS (ADMIN) ==========
async function renderOfficers(el) {
    const officers = await api('GET', `/api/${currentDb}/officers`);

    const rows = officers.map(o => {
        const id = o.OFFICER_ID ?? o.officer_id;
        const fn = o.FIRST_NAME ?? o.first_name;
        const ln = o.LAST_NAME ?? o.last_name;
        const role = o.ROLE ?? o.role;
        const rank = o.RANK ?? o.rank;
        const gender = o.GENDER ?? o.gender;
        const hireDate = o.HIRE_DATE ?? o.hire_date;
        const isSelf = id == currentUser.officer_id;

        return `<tr>
            <td><span style="font-family:var(--mono);color:var(--active)">${esc(id)}</span></td>
            <td>${esc(fn)}</td>
            <td>${esc(ln)}</td>
            <td>${statusBadge(role)}</td>
            <td>${esc(rank)}</td>
            <td>${esc(gender)}</td>
            <td>${fmtDate(hireDate)}</td>
            <td>
                ${isSelf
                    ? `<span style="font-family:var(--mono);font-size:9px;color:var(--muted)">YOU</span>`
                    : `<button class="btn btn-danger btn-sm" onclick="deleteOfficer(${id})">Delete</button>`
                }
            </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
        ${pageHeader('Officers', 'Admin -- Manage police officers')}

        <div class="card" style="margin-bottom:16px">
            <div class="card-header"><span class="card-title">Add Officer</span></div>
            <div class="card-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">First Name</label>
                        <input class="form-input" id="of-fn" placeholder="First name">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Last Name</label>
                        <input class="form-input" id="of-ln" placeholder="Last name">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Role</label>
                        <select class="form-select" id="of-role">
                            <option value="Regular">Regular</option>
                            <option value="Admin">Admin</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Rank</label>
                        <input class="form-input" id="of-rank" placeholder="e.g. Inspector">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Gender</label>
                        <select class="form-select" id="of-gender">
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Hire Date</label>
                        <input class="form-input" id="of-hd" type="date">
                    </div>
                </div>
                <button class="btn btn-primary" onclick="createOfficer()">Add Officer</button>
            </div>
        </div>

        <div class="card">
            <div class="card-header"><span class="card-title">Officers (${officers.length})</span></div>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>ID</th><th>First</th><th>Last</th><th>Role</th><th>Rank</th><th>Gender</th><th>Hired</th><th>Actions</th></tr></thead>
                    <tbody>${rows || `<tr><td colspan="8"><div class="empty-state">No officers</div></td></tr>`}</tbody>
                </table>
            </div>
        </div>
    `;
}

window.createOfficer = async function () {
    const body = {
        first_name: document.getElementById('of-fn').value.trim(),
        last_name: document.getElementById('of-ln').value.trim(),
        role: document.getElementById('of-role').value,
        rank: document.getElementById('of-rank').value.trim(),
        gender: document.getElementById('of-gender').value,
        hire_date: document.getElementById('of-hd').value || new Date().toISOString().split('T')[0]
    };
    if (!body.first_name || !body.last_name || !body.rank) { notify('Name and rank are required', 'error'); return; }
    try {
        await api('POST', `/api/${currentDb}/officers/create`, body);
        notify('Officer added');
        loadPage('officers');
    } catch (e) { notify(e.message, 'error'); }
};

window.deleteOfficer = async function (id) {
    if (!confirm(`Delete officer ${id}?`)) return;
    try {
        await api('DELETE', `/api/${currentDb}/officers/delete/${id}`);
        notify('Officer deleted');
        loadPage('officers');
    } catch (e) { notify(e.message, 'error'); }
};

// ========== QUERY EDITOR ==========
function renderQueryEditor(el) {
    const isOracle = currentDb === 'oracle';

    if (isOracle) {
        renderOracleQueryEditor(el);
    } else {
        renderMongoQueryEditor(el);
    }
}

function renderOracleQueryEditor(el) {
    el.innerHTML = `
        ${pageHeader('Query Editor', 'Oracle XE -- Execute SQL')}

        <div class="alert-note">
            Write any SQL query. SELECT returns a table. INSERT / UPDATE / DELETE show rows affected. Use with caution.
        </div>

        <div class="card" style="margin-bottom:16px">
            <div class="card-header">
                <span class="card-title">SQL Query</span>
                <div class="btn-actions">
                    <button class="btn btn-ghost btn-sm" onclick="fillOracleSample('select')">Sample SELECT</button>
                    <button class="btn btn-ghost btn-sm" onclick="fillOracleSample('join')">Sample JOIN</button>
                    <button class="btn btn-ghost btn-sm" onclick="fillOracleSample('agg')">Sample Aggregate</button>
                </div>
            </div>
            <div class="card-body">
                <textarea class="query-editor" id="oracle-query" rows="8" placeholder="SELECT * FROM OFFICER WHERE ROLE = 'Admin'"></textarea>
                <div style="margin-top:12px">
                    <button class="btn btn-primary" onclick="runOracleQuery()">Run Query</button>
                </div>
            </div>
        </div>

        <div id="oracle-result"></div>
    `;
}

window.fillOracleSample = function (type) {
    const samples = {
        select: `SELECT * FROM OFFICER ORDER BY OFFICER_ID`,
        join:   `SELECT c.CASE_ID, c.C_TITLE, c.C_STATUS, f.FIR_NO, f.OFFICER_ID\nFROM CASES c\nJOIN FIR f ON c.FIR_ID = f.FIR_ID\nORDER BY c.CASE_ID`,
        agg:    `SELECT C_STATUS, COUNT(*) AS TOTAL\nFROM CASES\nGROUP BY C_STATUS\nORDER BY TOTAL DESC`
    };
    document.getElementById('oracle-query').value = samples[type] || '';
};

window.runOracleQuery = async function () {
    const query = document.getElementById('oracle-query').value.trim();
    const resultEl = document.getElementById('oracle-result');

    if (!query) { notify('Query is empty', 'error'); return; }

    resultEl.innerHTML = `<div class="page-loading">Executing...</div>`;

    try {
        const token = sessionStorage.getItem('track_token');
        const role = currentUser.role;
        
        const response = await fetch(API + '/api/oracle/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': token,
                'X-User-Role': role
            },
            body: JSON.stringify({ query: query })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Query failed');
        }

        if (data.type === 'select') {
            if (!data.data || data.data.length === 0) {
                resultEl.innerHTML = `<div class="card"><div class="card-body"><div class="query-result-ok">Query returned 0 rows.</div></div></div>`;
                return;
            }
            const cols = data.columns;
            const rows = data.data.map(row =>
                `<tr>${cols.map(c => `<td>${esc(row[c])}</td>`).join('')}</tr>`
            ).join('');
            resultEl.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Result -- ${data.data.length} rows</span>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            `;
        } else {
            resultEl.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <div class="query-result-ok">${esc(data.message)}</div>
                        <div style="font-family:var(--mono);font-size:12px;color:var(--text)">Rows affected: ${data.rowsAffected ?? '--'}</div>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        resultEl.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <div class="query-result-err">Error: ${esc(e.message)}</div>
                </div>
            </div>
        `;
    }
};

// MongoDB query editor
function renderMongoQueryEditor(el) {
    const collections = ['officer','criminal','crime','cases','fir','evidence','victims','victim_contact','officer_phone','criminal_record','investigates','belongs_to','involves','commits'];
    const colOptions = collections.map(c => `<option value="${c}">${c}</option>`).join('');

    el.innerHTML = `
        ${pageHeader('Query Editor', 'MongoDB -- Structured Query Builder')}

        <div class="alert-note">
            Select a collection and operation. Enter JSON for filter, update, sort fields.
            For aggregate, enter a pipeline JSON array in the Filter field.
        </div>

        <div class="card" style="margin-bottom:16px">
            <div class="card-header">
                <span class="card-title">Query Builder</span>
                <div class="btn-actions">
                    <button class="btn btn-ghost btn-sm" onclick="fillMongoSample('find')">Sample Find</button>
                    <button class="btn btn-ghost btn-sm" onclick="fillMongoSample('count')">Sample Count</button>
                    <button class="btn btn-ghost btn-sm" onclick="fillMongoSample('agg')">Sample Aggregate</button>
                </div>
            </div>
            <div class="card-body">
                <div class="form-grid" style="margin-bottom:14px">
                    <div class="form-group">
                        <label class="form-label">Collection</label>
                        <select class="form-select" id="mg-col">${colOptions}</select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Operation</label>
                        <select class="form-select" id="mg-op">
                            <option value="find">find</option>
                            <option value="count">count</option>
                            <option value="aggregate">aggregate</option>
                            <option value="updateOne">updateOne</option>
                            <option value="deleteOne">deleteOne</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Limit (find only)</label>
                        <input class="form-input" id="mg-limit" type="number" value="50" placeholder="50">
                    </div>
                </div>

                <div class="mongo-query-grid">
                    <div class="form-group">
                        <label class="form-label">Filter / Pipeline (JSON)</label>
                        <textarea class="form-textarea query-editor" id="mg-filter" rows="5" placeholder='{ "status": "Arrested" }'></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Update (JSON, for updateOne)</label>
                        <textarea class="form-textarea query-editor" id="mg-update" rows="5" placeholder='{ "$set": { "status": "Released" } }'></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Projection (JSON, optional)</label>
                        <textarea class="form-textarea query-editor" id="mg-proj" rows="3" placeholder='{ "first_name": 1, "status": 1 }'></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Sort (JSON, optional)</label>
                        <textarea class="form-textarea query-editor" id="mg-sort" rows="3" placeholder='{ "cr_id": -1 }'></textarea>
                    </div>
                </div>

                <div style="margin-top:14px">
                    <button class="btn btn-primary" onclick="runMongoQuery()">Run Query</button>
                </div>
            </div>
        </div>

        <div id="mongo-result"></div>
    `;
}

window.fillMongoSample = function (type) {
    const samples = {
        find: {
            col: 'criminal', op: 'find',
            filter: '{ "status": "Arrested" }',
            sort: '{ "cr_id": 1 }',
            proj: '{ "first_name": 1, "last_name": 1, "status": 1, "city": 1 }',
            update: ''
        },
        count: {
            col: 'cases', op: 'count',
            filter: '{ "c_status": "Open" }',
            sort: '', proj: '', update: ''
        },
        agg: {
            col: 'criminal', op: 'aggregate',
            filter: '[{ "$group": { "_id": "$status", "total": { "$sum": 1 } } }, { "$sort": { "total": -1 } }]',
            sort: '', proj: '', update: ''
        }
    };

    const s = samples[type];
    if (!s) return;

    document.getElementById('mg-col').value = s.col;
    document.getElementById('mg-op').value = s.op;
    document.getElementById('mg-filter').value = s.filter;
    document.getElementById('mg-sort').value = s.sort;
    document.getElementById('mg-proj').value = s.proj;
    document.getElementById('mg-update').value = s.update;
};

window.runMongoQuery = async function () {
    const collection = document.getElementById('mg-col').value;
    const operation  = document.getElementById('mg-op').value;
    const filter     = document.getElementById('mg-filter').value.trim();
    const update     = document.getElementById('mg-update').value.trim();
    const projection = document.getElementById('mg-proj').value.trim();
    const sort       = document.getElementById('mg-sort').value.trim();
    const limit      = document.getElementById('mg-limit').value;
    const resultEl   = document.getElementById('mongo-result');

    resultEl.innerHTML = `<div class="page-loading">Executing...</div>`;

    try {
        const token = sessionStorage.getItem('track_token');
        const role = currentUser.role;
        
        const response = await fetch(API + '/api/mongo/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': token,
                'X-User-Role': role
            },
            body: JSON.stringify({ collection, operation, filter, update, projection, sort, limit })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Query failed');
        }

        if (data.type === 'find' || data.type === 'aggregate') {
            if (!data.data || data.data.length === 0) {
                resultEl.innerHTML = `<div class="card"><div class="card-body"><div class="query-result-ok">Query returned 0 documents.</div></div></div>`;
                return;
            }
            const cols = Object.keys(data.data[0]).filter(k => k !== '_id');
            const rows = data.data.map(doc =>
                `<tr>${cols.map(c => `<td>${esc(JSON.stringify(doc[c]))}</td>`).join('')}</tr>`
            ).join('');
            resultEl.innerHTML = `
                <div class="card">
                    <div class="card-header"><span class="card-title">Result -- ${data.count} documents</span></div>
                    <div class="table-wrap">
                        <table>
                            <thead><td>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            `;
        } else if (data.type === 'count') {
            resultEl.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <div class="query-result-ok">Count result</div>
                        <div style="font-family:var(--mono);font-size:24px;color:var(--active)">${data.count}</div>
                    </div>
                </div>
            `;
        } else {
            const info = data.type === 'updateOne'
                ? `Matched: ${data.matchedCount} -- Modified: ${data.modifiedCount}`
                : `Deleted: ${data.deletedCount}`;
            resultEl.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <div class="query-result-ok">Operation completed</div>
                        <div style="font-family:var(--mono);font-size:12px;color:var(--text)">${esc(info)}</div>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        resultEl.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <div class="query-result-err">Error: ${esc(e.message)}</div>
                </div>
            </div>
        `;
    }
};

