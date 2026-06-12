/**
 * WebLead — Dashboard Principal (Clean Version)
 */

const App = {
    results: [],
    filteredResults: [],
    savedLeads: [],
    isScanning: false,
    pageSize: 10,
    currentPage: 1,

    async init() {
        await SupabaseClient.init();
        this.bindEvents();
        await this.loadSaved();
        this.updateUI();
        // Inicia na tab de busca por padrão
        this.switchTab('search');
    },

    get totalPages() {
        return Math.ceil(this.filteredResults.length / this.pageSize) || 1;
    },

    get paginatedResults() {
        const start = (this.currentPage - 1) * this.pageSize;
        return this.filteredResults.slice(start, start + this.pageSize);
    },

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderTable();
        }
    },

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.renderTable();
        }
    },

    updatePagination() {
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        const pageInfo = document.getElementById('pageInfo');
        pageInfo.textContent = `Página ${this.currentPage} de ${this.totalPages}`;
        prevBtn.disabled = this.currentPage <= 1;
        nextBtn.disabled = this.currentPage >= this.totalPages;
    },

    bindEvents() {
        document.getElementById('searchForm').addEventListener('submit', e => {
            e.preventDefault();
            this.runSearch();
        });

        document.getElementById('exportBtn').addEventListener('click', () => this.exportCSV());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearResults());
        document.getElementById('tableSearch').addEventListener('input', e => this.filterTable(e.target.value));
        document.getElementById('modalClose').addEventListener('click', () => this.closeModal());

        // Tabs
        document.querySelectorAll('.dash-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.switchTab(tab.dataset.tab);
            });
        });

        // Fechar modal ao clicar fora
        document.getElementById('detailModal').addEventListener('click', e => {
            if (e.target === e.currentTarget) this.closeModal();
        });
    },

    switchTab(tab) {
        const searchCard = document.getElementById('searchCard');
        const resultsSection = document.getElementById('resultsSection');
        const actionsRow = document.getElementById('actionsRow');
        const savedSection = document.getElementById('savedSection');
        const panelContent = document.getElementById('panelContent');

        // Esconde tudo primeiro
        searchCard.style.display = 'none';
        resultsSection.style.display = 'none';
        actionsRow.style.display = 'none';
        savedSection.style.display = 'none';
        panelContent.style.display = 'none';

        if (tab === 'search') {
            searchCard.style.display = 'block';
            resultsSection.style.display = this.results.length ? 'block' : 'none';
            actionsRow.style.display = this.results.length ? 'flex' : 'none';
        } else if (tab === 'saved') {
            savedSection.style.display = 'block';
            this.renderSavedLeads();
        } else if (tab === 'panel') {
            panelContent.style.display = 'block';
            this.renderDashboardStats();
        }
    },

    async runSearch() {
        const city = document.getElementById('cityInput').value.trim();
        const category = document.getElementById('categoryInput').value.trim();

        if (!city) {
            this.toast('Informe a cidade para buscar', 'warning');
            return;
        }

        const btn = document.getElementById('searchBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Buscando...';

        try {
            const results = await SearchEngine.search({
                city,
                category: category || '',
                radius: 5000,
                filters: {
                    noWebsite: true,
                    noMaps: true,
                    noPhone: false,
                    bothMissing: true
                }
            });

            this.results = results;
            this.filteredResults = results;
            this.currentPage = 1;
            this.renderTable();
            this.updateUI();
            this.renderDashboardStats();

            // Auto-save to leads
            if (results.length) {
                const saved = await SupabaseClient.saveEstablishments(results);
                this.savedLeads = await SupabaseClient.getEstablishments();
                this.toast(`${results.length} estabelecimentos encontrados em ${city} (${saved.added} novos salvos)`, 'success');
            } else {
                this.toast('Nenhum estabelecimento encontrado', 'info');
            }
        } catch (err) {
            this.toast(err.message || 'Erro na busca', 'warning');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Buscar Estabelecimentos';
        }
    },

    async loadSaved() {
        try {
            this.savedLeads = await SupabaseClient.getEstablishments();
            if (this.savedLeads.length && !this.results.length) {
                this.results = this.savedLeads;
                this.filteredResults = this.savedLeads;
                this.renderTable();
                this.renderDashboardStats();
            }
        } catch (err) {
            console.warn('Erro ao carregar dados:', err);
        }
    },

    getLeadPool() {
        const map = new Map();

        [...this.savedLeads, ...this.results].forEach(lead => {
            if (!lead || !lead.id || map.has(lead.id)) return;
            map.set(lead.id, lead);
        });

        return map.size ? Array.from(map.values()) : this.savedLeads;
    },

    renderDashboardStats() {
        const leads = this.getLeadPool();
        const total = leads.length;
        const withSite = leads.filter(lead => lead.hasWebsite).length;
        const withoutSite = total - withSite;
        const categories = Array.from(new Set(leads.map(lead => lead.category || 'Sem categoria'))).length;

        document.getElementById('statTotal').textContent = total;
        document.getElementById('statWithSite').textContent = withSite;
        document.getElementById('statWithoutSite').textContent = withoutSite;
        document.getElementById('statCategories').textContent = categories;

        const donutPanel = document.getElementById('donutPanel');
        const categoryPanel = document.getElementById('categoryPanel');

        if (!total) {
            donutPanel.innerHTML = `
                <div class="analytics-empty">
                    <div>
                        <i class="fa-solid fa-chart-pie"></i>
                        <div>Os indicadores aparecem após buscar ou carregar leads.</div>
                    </div>
                </div>
            `;
            categoryPanel.innerHTML = `
                <div class="analytics-empty">
                    <div>
                        <i class="fa-solid fa-chart-column"></i>
                        <div>As categorias serão agrupadas aqui.</div>
                    </div>
                </div>
            `;
            return;
        }

        // Donut Chart - Presença Digital
        const sitePct = Math.round((withSite / total) * 100);
        const noSitePct = 100 - sitePct;

        donutPanel.innerHTML = `
            <div class="donut" style="--site-pct:${sitePct}%">
                <div class="donut-center">
                    <div>
                        <strong>${total}</strong>
                        <span>leads</span>
                    </div>
                </div>
            </div>
            <div class="donut-legend">
                <div class="legend-item"><span class="legend-dot" style="--legend-color:var(--success)"></span> Com site (${withSite}) <span class="legend-pct">${sitePct}%</span></div>
                <div class="legend-item"><span class="legend-dot" style="--legend-color:var(--accent)"></span> Sem site (${withoutSite}) <span class="legend-pct">${noSitePct}%</span></div>
            </div>
            <div class="donut-summary">
                <div class="donut-opportunity">
                    <i class="fa-solid fa-bullhorn"></i>
                    <strong>${withoutSite}</strong> oportunidades disponíveis
                </div>
            </div>
        `;

        // Category Chart - Barras horizontais
        const categoryCounts = leads.reduce((acc, lead) => {
            const category = lead.category || 'Sem categoria';
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {});

        const maxCount = Math.max(...Object.values(categoryCounts));
        const palette = ['#6366f1', '#ec4899', '#f97316', '#22c55e', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444'];

        categoryPanel.innerHTML = Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([category, count], index) => `
                <div class="category-row">
                    <div class="category-label"><span>${this.escape(category)}</span></div>
                    <div class="category-bar">
                        <div class="category-fill" style="--bar-pct:${Math.max(8, Math.round((count / maxCount) * 100))}%; --bar-color:${palette[index % palette.length]}"></div>
                    </div>
                    <div class="category-value">${count}</div>
                </div>
            `).join('');
    },

    // ====== SAVED LEADS ======

    savedFilter: 'all',
    savedQuery: '',

    async renderSavedLeads() {
        this.savedLeads = await SupabaseClient.getEstablishments();
        this.renderSavedUI();
    },

    renderSavedUI() {
        const container = document.getElementById('savedLeadsList');
        const empty = document.getElementById('savedEmpty');
        const filterEmpty = document.getElementById('savedFilterEmpty');
        const count = document.getElementById('savedCount');

        const total = this.savedLeads.length;
        count.textContent = `(${total})`;

        if (!total) {
            container.innerHTML = '';
            empty.style.display = 'block';
            filterEmpty.style.display = 'none';
            document.getElementById('savedCounters').innerHTML = '';
            document.getElementById('statusPills').innerHTML = '';
            return;
        }

        empty.style.display = 'none';
        filterEmpty.style.display = 'none';

        // Renderiza contadores
        this.renderSavedCounters();

        // Renderiza pills de status
        this.renderStatusPills();

        // Aplica busca, filtro e ordenação
        const filtered = this.getFilteredSavedLeads();

        if (!filtered.length) {
            container.innerHTML = '';
            filterEmpty.style.display = 'block';
            return;
        }
        filterEmpty.style.display = 'none';

        const sortVal = document.getElementById('savedSort').value;
        const sorted = this.sortLeads(filtered, sortVal);

        container.innerHTML = sorted.map(lead => this.renderSavedCard(lead)).join('');
    },

    getFilteredSavedLeads() {
        let leads = [...this.savedLeads];

        // Filtro por status
        if (this.savedFilter !== 'all') {
            leads = leads.filter(l => l.leadStatus === this.savedFilter);
        }

        // Busca textual
        if (this.savedQuery) {
            const q = this.savedQuery.toLowerCase().trim();
            leads = leads.filter(l =>
                (l.name || '').toLowerCase().includes(q) ||
                (l.category || '').toLowerCase().includes(q) ||
                (l.city || '').toLowerCase().includes(q) ||
                (l.address || '').toLowerCase().includes(q) ||
                (l.phone || '').includes(q)
            );
        }

        return leads;
    },

    sortLeads(leads, sortVal) {
        const sorted = [...leads];
        switch (sortVal) {
            case 'recent':
                sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                break;
            case 'oldest':
                sorted.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
                break;
            case 'noSite':
                sorted.sort((a, b) => (a.hasWebsite ? 1 : 0) - (b.hasWebsite ? 1 : 0));
                break;
            case 'noMaps':
                sorted.sort((a, b) => (a.hasMapsLocation ? 1 : 0) - (b.hasMapsLocation ? 1 : 0));
                break;
        }
        return sorted;
    },

    filterSavedLeads() {
        this.savedQuery = document.getElementById('savedSearchInput').value;
        this.renderSavedUI();
    },

    setSavedFilter(filter) {
        this.savedFilter = filter;
        document.querySelectorAll('.saved-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        this.renderSavedUI();
    },

    sortSavedLeads() {
        this.renderSavedUI();
    },

    renderSavedCounters() {
        const counters = document.getElementById('savedCounters');
        const statuses = ['Novo', 'Contatado', 'Em negociação', 'Cliente', 'Descartado'];
        const counts = statuses.map(status => ({
            status,
            count: this.savedLeads.filter(l => l.leadStatus === status).length
        }));

        counters.innerHTML = counts.map(({ status, count }) => `
            <div class="saved-counter ${status === 'Novo' ? 'counter-info' : status === 'Contatado' ? 'counter-warning' : status === 'Em negociação' ? 'counter-orange' : status === 'Cliente' ? 'counter-success' : 'counter-danger'}">
                <span class="counter-label">${status}</span>
                <span class="counter-value">${count}</span>
            </div>
        `).join('');
    },

    renderStatusPills() {
        const pills = document.getElementById('statusPills');
        const counts = {};
        this.savedLeads.forEach(l => {
            const s = l.leadStatus || 'Novo';
            counts[s] = (counts[s] || 0) + 1;
        });

        const total = this.savedLeads.length;

        pills.innerHTML = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => `
                <span class="status-pill ${status.toLowerCase().replace(/\s+/g, '-')}">
                    ${status === 'Novo' ? '<i class="fa-regular fa-star"></i>' :
                      status === 'Contatado' ? '<i class="fa-regular fa-message"></i>' :
                      status === 'Em negociação' ? '<i class="fa-regular fa-handshake"></i>' :
                      status === 'Cliente' ? '<i class="fa-regular fa-circle-check"></i>' :
                      '<i class="fa-regular fa-circle-xmark"></i>'}
                    ${status} (${count})
                </span>
            `).join('');

        if (total > 5) {
            pills.innerHTML += `<span class="status-pill total-pill"><i class="fa-regular fa-layer-group"></i> Total: ${total}</span>`;
        }
    },

    renderSavedCard(lead) {
        const id = this.escape(lead.id);
        const name = this.escape(lead.name);
        const category = this.escape(lead.category || 'Sem categoria');
        const address = lead.address ? this.escape(lead.address) : '';
        const city = lead.city ? this.escape(lead.city) : '';
        const phone = lead.phone ? this.escape(lead.phone) : '';
        const hasWebsite = lead.hasWebsite;
        const hasMaps = lead.hasMapsLocation;
        const instagram = lead.instagram || '';
        const whatsapp = lead.whatsapp || '';
        const status = lead.leadStatus || 'Novo';
        const statusColor = status === 'Novo' ? 'info' :
            status === 'Contatado' ? 'warning' :
            status === 'Em negociação' ? 'orange' :
            status === 'Cliente' ? 'success' : 'danger';

        return `
            <div class="saved-lead-card" data-id="${id}">
                <div class="saved-lead-left">
                    <div class="saved-lead-icon">
                        <i class="fa-solid fa-store"></i>
                    </div>
                    <div class="saved-lead-info">
                        <div class="saved-lead-name">${name}</div>
                        <div class="saved-lead-category">${category}</div>

                        <div class="saved-lead-details">
                            ${address ? `
                            <div class="saved-lead-detail">
                                <i class="fa-solid fa-location-dot"></i>
                                <span>${address}${city ? `, ${city}` : ''}</span>
                            </div>` : city ? `
                            <div class="saved-lead-detail">
                                <i class="fa-solid fa-city"></i>
                                <span>${city}</span>
                            </div>` : ''}
                            ${phone ? `
                            <div class="saved-lead-detail">
                                <i class="fa-solid fa-phone"></i>
                                <a href="tel:${phone}">${phone}</a>
                            </div>` : `
                            <div class="saved-lead-detail">
                                <i class="fa-solid fa-phone-slash"></i>
                                <span>Sem telefone</span>
                            </div>`}
                        </div>

                        <div class="saved-lead-badges">
                            <span class="saved-lead-badge ${hasWebsite ? 'success' : 'danger'}">
                                <i class="fa-solid fa-globe"></i> ${hasWebsite ? 'Tem site' : 'Sem site'}
                            </span>
                            <span class="saved-lead-badge ${hasMaps ? 'success' : 'danger'}">
                                <i class="fa-solid fa-map-pin"></i> ${hasMaps ? 'No Maps' : 'Sem Google Maps'}
                            </span>
                            <span class="saved-lead-badge ${statusColor}">
                                <i class="fa-solid fa-tag"></i> ${status}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="saved-lead-actions">
                    <!-- Ações rápidas -->
                    <div class="saved-quick-actions">
                        ${phone ? `<a href="tel:${phone}" class="quick-action-btn" title="Ligar"><i class="fa-solid fa-phone"></i></a>` : ''}
                        ${whatsapp ? `<a href="https://wa.me/${whatsapp.replace(/\D/g, '')}" target="_blank" class="quick-action-btn" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
                        ${lead.hasMapsLocation ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ', ' + (address || city || ''))}" target="_blank" class="quick-action-btn" title="Abrir no Maps"><i class="fa-solid fa-location-dot"></i></a>` : ''}
                        <button class="quick-action-btn" onclick="App.showDetail('${id}')" title="Ver detalhes"><i class="fa-solid fa-eye"></i></button>
                    </div>

                    <!-- Status dropdown -->
                    <select class="saved-lead-status" data-id="${id}" onchange="App.updateLeadStatus('${id}', this.value)">
                        <option value="Novo" ${status === 'Novo' ? 'selected' : ''}>Novo</option>
                        <option value="Contatado" ${status === 'Contatado' ? 'selected' : ''}>Contatado</option>
                        <option value="Em negociação" ${status === 'Em negociação' ? 'selected' : ''}>Em negociação</option>
                        <option value="Cliente" ${status === 'Cliente' ? 'selected' : ''}>Cliente</option>
                        <option value="Descartado" ${status === 'Descartado' ? 'selected' : ''}>Descartado</option>
                    </select>
                    <button class="btn-delete-lead" onclick="App.deleteLead('${id}')" title="Excluir lead">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    },

    async updateLeadStatus(id, status) {
        try {
            await SupabaseClient.updateEstablishment(id, { leadStatus: status });

            // Update in local arrays too
            const updateIn = arr => {
                const idx = arr.findIndex(e => e.id === id);
                if (idx !== -1) arr[idx].leadStatus = status;
            };
            updateIn(this.savedLeads);
            updateIn(this.results);

            this.toast(`Status alterado para "${status}"`, 'success');
        } catch (err) {
            this.toast('Erro ao atualizar status', 'warning');
        }
    },

    async deleteLead(id) {
        if (!confirm('Tem certeza que deseja excluir este lead?')) return;

        try {
            await SupabaseClient.removeEstablishment(id);

            // Remove from all arrays
            this.savedLeads = this.savedLeads.filter(e => e.id !== id);
            this.results = this.results.filter(e => e.id !== id);
            this.filteredResults = this.filteredResults.filter(e => e.id !== id);

            this.renderSavedLeads();
            this.renderTable();
            this.updateUI();
            this.toast('Lead excluído', 'info');
        } catch (err) {
            this.toast('Erro ao excluir lead', 'warning');
        }
    },

    // ====== SEARCH RESULTS TABLE ======

    renderTable() {
        const tbody = document.getElementById('resultsBody');
        const empty = document.getElementById('emptyState');
        const count = document.getElementById('resultCount');

        count.textContent = this.filteredResults.length;

        if (!this.filteredResults.length) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            this.updatePagination();
            return;
        }

        empty.style.display = 'none';

        tbody.innerHTML = this.paginatedResults.map(est => `
            <tr>
                <td>
                    <div class="est-name">${this.escape(est.name)}</div>
                    <div class="est-category">${this.escape(est.category)}</div>
                </td>
                <td>${this.escape(est.city)}</td>
                <td>
                    ${est.phone
                        ? `<a href="tel:${est.phone}" class="phone-link">${this.escape(est.phone)}</a>`
                        : '<span class="badge badge-warning"><i class="fa-solid fa-phone-slash"></i> Sem telefone</span>'}
                </td>
                <td>
                    ${est.hasWebsite
                        ? '<span class="badge badge-success"><i class="fa-solid fa-globe"></i> Tem site</span>'
                        : '<span class="badge badge-danger"><i class="fa-solid fa-globe"></i> Sem site</span>'}
                </td>
                <td>
                    ${est.hasMapsLocation
                        ? '<span class="badge badge-success"><i class="fa-solid fa-map-pin"></i> No Maps</span>'
                        : '<span class="badge badge-danger"><i class="fa-solid fa-map-pin"></i> Sem Maps</span>'}
                </td>
                <td>
                    ${est.aiEnriched
                        ? `<span class="badge badge-info"><i class="fa-solid fa-robot"></i> ${est.leadScore || '—'}</span>`
                        : '<span class="badge badge-warning">Pendente</span>'}
                </td>
                <td>
                    <button class="btn-icon" onclick="App.showDetail('${est.id}')" title="Ver detalhes">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        this.updatePagination();
    },

    showDetail(id) {
        const est = this.results.find(e => e.id === id);
        if (!est) return;

        const grid = document.getElementById('modalGrid');
        const fields = [
            ['Nome', est.name],
            ['Categoria', est.category],
            ['Endereço', est.address || '—'],
            ['Cidade', est.city],
            ['Telefone', est.phone || '—'],
            ['WhatsApp', est.whatsapp || '—'],
            ['Site', est.website || 'Sem site'],
            ['Instagram', est.instagram || '—'],
            ['Google Maps', est.hasMapsLocation ? 'Sim' : 'Não'],
            ['Avaliação', est.rating ? `${est.rating} (${est.totalReviews} reviews)` : '—'],
            ['Score do Lead', est.leadScore ? `${est.leadScore}/100` : '—'],
            ['Status', est.leadStatus || 'Novo'],
            ['Notas da IA', est.notes || '—'],
            ['Fonte', est.source === 'google_places' ? 'Google Places' : 'OpenStreetMap (real)']
        ];

        grid.innerHTML = fields.map(([key, val]) => `
            <div class="detail-row">
                <span class="key">${key}</span>
                <span class="val">${this.escape(String(val))}</span>
            </div>
        `).join('');

        document.getElementById('detailModal').classList.add('visible');
    },

    closeModal() {
        document.getElementById('detailModal').classList.remove('visible');
    },

    filterTable(query) {
        const q = query.toLowerCase().trim();
        if (!q) {
            this.filteredResults = this.results;
        } else {
            this.filteredResults = this.results.filter(e =>
                e.name.toLowerCase().includes(q) ||
                e.category.toLowerCase().includes(q) ||
                e.city.toLowerCase().includes(q) ||
                (e.phone && e.phone.includes(q))
            );
        }
        this.currentPage = 1;
        this.renderTable();
        document.getElementById('resultCount').textContent = this.filteredResults.length;
    },

    updateUI() {
        const hasResults = this.results.length > 0;
        const resultsSection = document.getElementById('resultsSection');
        const actionsRow = document.getElementById('actionsRow');

        if (hasResults) {
            resultsSection.style.display = 'block';
            actionsRow.style.display = 'flex';
        } else {
            resultsSection.style.display = 'none';
            actionsRow.style.display = 'none';
        }

        // Update saved count badge
        const savedTab = document.querySelector('.dash-tab[data-tab="saved"]');
        if (savedTab && this.savedLeads.length) {
            savedTab.innerHTML = `<i class="fa-solid fa-bookmark"></i> Salvos (${this.savedLeads.length})`;
        }

        this.renderDashboardStats();
    },

    exportCSV() {
        if (!this.results.length) {
            this.toast('Nenhum dado para exportar', 'warning');
            return;
        }

        const headers = ['Nome', 'Categoria', 'Cidade', 'Endereço', 'Telefone', 'WhatsApp', 'Site', 'Google Maps', 'Score', 'Status', 'Notas'];
        const rows = this.results.map(e => [
            e.name, e.category, e.city, e.address || '', e.phone || '',
            e.whatsapp || '', e.website || '', e.hasMapsLocation ? 'Sim' : 'Não',
            e.leadScore || '', e.leadStatus || 'Novo', e.notes || ''
        ]);

        const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `saasmaps-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        this.toast('CSV exportado com sucesso!', 'success');
    },

    clearResults() {
        if (!confirm('Limpar todos os resultados da busca?')) return;
        this.results = [];
        this.filteredResults = [];
        this.renderTable();
        this.updateUI();
        this.toast('Resultados limpos', 'info');
    },

    showProgress(visible, text) {
        const el = document.getElementById('scanProgress');
        el.classList.toggle('visible', visible);
        if (text) document.getElementById('progressLabel').textContent = text;
        if (!visible) this.updateProgress(0, '');
    },

    updateProgress(pct, text) {
        document.getElementById('progressFill').style.width = pct + '%';
        if (text) document.getElementById('progressText').textContent = text;
    },

    toast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icons = { success: 'check-circle', warning: 'triangle-exclamation', info: 'circle-info' };
        toast.innerHTML = `<i class="fa-solid fa-${icons[type]}"></i> ${message}`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    },

    escape(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());