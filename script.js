// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
    allPokemon:      new Map(),
    evolutionCache:  new Map(),
    isLoading:       false,
    compareSelection:[],
    itemsPerPage:    30,
    searchTimer:     null,
    chartInstance:   null,
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const REGIONS = {
    all:    { start: 1,   end: 721 },
    kanto:  { start: 1,   end: 151 },
    johto:  { start: 152, end: 251 },
    hoenn:  { start: 252, end: 386 },
    sinnoh: { start: 387, end: 493 },
    unova:  { start: 494, end: 649 },
    kalos:  { start: 650, end: 721 },
};

const TYPE_MAP = {
    fire:     { weak: ['water','ground','rock'],                      strong: ['grass','ice','bug','steel'] },
    water:    { weak: ['electric','grass'],                           strong: ['fire','ground','rock'] },
    grass:    { weak: ['fire','ice','poison','flying','bug'],         strong: ['water','ground','rock'] },
    electric: { weak: ['ground'],                                     strong: ['water','flying'] },
    ground:   { weak: ['water','grass','ice'],                        strong: ['fire','electric','poison','rock','steel'] },
    rock:     { weak: ['water','grass','fighting','ground','steel'],  strong: ['fire','ice','flying','bug'] },
    ice:      { weak: ['fire','fighting','rock','steel'],             strong: ['grass','ground','flying','dragon'] },
    fighting: { weak: ['psychic','flying','fairy'],                   strong: ['normal','ice','rock','dark','steel'] },
    poison:   { weak: ['ground','psychic'],                           strong: ['grass','fairy'] },
    flying:   { weak: ['electric','ice','rock'],                      strong: ['grass','fighting','bug'] },
    psychic:  { weak: ['bug','ghost','dark'],                         strong: ['fighting','poison'] },
    bug:      { weak: ['fire','flying','rock'],                       strong: ['grass','psychic','dark'] },
    ghost:    { weak: ['ghost','dark'],                               strong: ['psychic','ghost'] },
    dragon:   { weak: ['ice','dragon','fairy'],                       strong: ['dragon'] },
    dark:     { weak: ['fighting','bug','fairy'],                     strong: ['psychic','ghost'] },
    steel:    { weak: ['fire','fighting','ground'],                   strong: ['ice','rock','fairy'] },
    fairy:    { weak: ['poison','steel'],                             strong: ['fighting','dragon','dark'] },
    normal:   { weak: ['fighting'],                                   strong: [] },
};

// ─── UTILS ────────────────────────────────────────────────────────────────────
const debounce = (fn, ms) => (...args) => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => fn(...args), ms);
};

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

// ─── DARK MODE ────────────────────────────────────────────────────────────────
const initDarkMode = () => {
    const btn  = document.getElementById('darkToggle');
    const icon = btn.querySelector('.toggle-icon');
    const saved = localStorage.getItem('pokedex-theme') || 'light';

    document.documentElement.setAttribute('data-theme', saved);
    icon.textContent = saved === 'dark' ? '☀️' : '🌙';

    btn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        icon.textContent = next === 'dark' ? '☀️' : '🌙';
        localStorage.setItem('pokedex-theme', next);
    });
};

// ─── FETCH ────────────────────────────────────────────────────────────────────
const fetchPokemon = async (id) => {
    if (state.allPokemon.has(id)) return state.allPokemon.get(id);
    try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        state.allPokemon.set(id, data);
        return data;
    } catch (err) {
        console.error(`Erro pokémon #${id}:`, err);
        return null;
    }
};

const fetchEvolutionChain = async (pokemonId) => {
    const key = `c${pokemonId}`;
    if (state.evolutionCache.has(key)) return state.evolutionCache.get(key);
    try {
        const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokemonId}`);
        if (!speciesRes.ok) throw new Error();
        const species = await speciesRes.json();

        const chainRes = await fetch(species.evolution_chain.url);
        if (!chainRes.ok) throw new Error();
        const { chain } = await chainRes.json();

        const parsed = parseChain(chain);
        state.evolutionCache.set(key, parsed);
        return parsed;
    } catch {
        return null;
    }
};

const parseChain = (link) => {
    const id = parseInt(link.species.url.split('/').slice(-2)[0]);
    const detail = link.evolution_details?.[0];
    const current = { id, name: link.species.name, trigger: buildTrigger(detail) };

    if (!link.evolves_to?.length) return [current];
    return [current, ...link.evolves_to.flatMap(n => parseChain(n))];
};

const buildTrigger = (d) => {
    if (!d) return null;
    if (d.trigger?.name === 'level-up' && d.min_level) return `Nv. ${d.min_level}`;
    if (d.trigger?.name === 'level-up') return 'Level up';
    if (d.trigger?.name === 'use-item' && d.item) return capitalize(d.item.name.replace(/-/g,' '));
    if (d.trigger?.name === 'trade') return 'Troca';
    if (d.min_happiness) return 'Amizade';
    return capitalize(d.trigger?.name?.replace(/-/g,' ') || '');
};

// ─── SPLASH SCREEN ────────────────────────────────────────────────────────────

const Splash = {
    el:       document.getElementById('splash'),
    progress: document.getElementById('splashProgress'),
    msg:      document.getElementById('splashMsg'),

    messages: [
        'Iniciando Pokédex...',
        'Conectando à PokéAPI...',
        'Carregando pokémons...',
        'Quase pronto...',
    ],

    msgIndex: 0,
    msgTimer: null,

    start() {
        this.startTime = Date.now();
        this.setProgress(0);
        this.cycleMessages();
    },

    setProgress(pct, message) {
        this.progress.style.width = `${pct}%`;
        if (message) this.msg.textContent = message;
    },

    cycleMessages() {
        this.msg.textContent = this.messages[this.msgIndex];
        this.msgIndex = (this.msgIndex + 1) % this.messages.length;
        this.msgTimer = setTimeout(() => this.cycleMessages(), 800);
    },

    dismiss() {
        clearTimeout(this.msgTimer);

        // Garante tempo mínimo de 2.5s na splash independente da velocidade da API
        const elapsed = Date.now() - this.startTime;
        const minDuration = 5000;
        const remaining = Math.max(0, minDuration - elapsed);

        setTimeout(() => {
            this.setProgress(100, 'Pronto! ✓');
            setTimeout(() => {
                this.el.classList.add('hidden');
            }, 700);
        }, remaining);
    },
};

// ─── UI ───────────────────────────────────────────────────────────────────────
const UI = {
    container:  document.getElementById('pokeContainer'),
    status:     document.getElementById('resultsText'),
    modal:      document.getElementById('modal'),
    modalBody:  document.getElementById('modalBody'),
    modalHeader:document.getElementById('modalHeader'),
    sentinel:   document.createElement('div'),

    init() {
        this.sentinel.id = 'sentinel';
        this.sentinel.style.height = '20px';
        document.body.appendChild(this.sentinel);
    },

    showSkeletons(n = 8) {
        for (let i = 0; i < n; i++) {
            const d = document.createElement('div');
            d.className = 'pokemon skeleton';
            this.container.appendChild(d);
        }
    },

    hideSkeletons() {
        document.querySelectorAll('.skeleton').forEach(s => s.remove());
    },

    // ── Card ─────────────────────────────────────────────────────────────────
    createCard(p, idx = 0) {
        const card = document.createElement('div');
        card.className = 'pokemon entering';
        card.dataset.id = p.id; // ← usado pelo render append para saber quem já está no DOM
        card.style.animationDelay = `${Math.min(idx * 35, 350)}ms`;

        const type  = p.types[0].type.name;
        const isGen6Plus = p.id >= 650;

        let normal, shiny;
        if (isGen6Plus) {
            // Gen 6+: official artwork HD (sem animação — não existe oficialmente)
            normal = p.sprites.other['official-artwork'].front_default;
            shiny  = p.sprites.other['official-artwork'].front_shiny || normal;
        } else {
            // Gen 1-5: sprite animado com fallback para estático
            const gen5 = p.sprites.versions?.['generation-v']?.['black-white']?.animated;
            normal = gen5?.front_default || p.sprites.front_default;
            shiny  = gen5?.front_shiny  || p.sprites.front_shiny;
        }

        // Abilities: normais + hidden
        const abilitiesHTML = p.abilities.map(a => `
            <span class="ability-tag ${a.is_hidden ? 'ability-hidden' : ''}">
                ${a.is_hidden ? '👁 ' : ''}${a.ability.name.replace(/-/g,' ')}
            </span>
        `).join('');

        card.innerHTML = `
            <div class="card-header">
                <span class="number">#${String(p.id).padStart(3,'0')}</span>
                <div class="actions">
                    <button class="shiny-toggle" title="Ver Shiny">✨</button>
                    <button class="compare-btn"  title="Comparar">⚖️</button>
                </div>
            </div>
            <div class="imgContainer" style="background:var(--${type})22">
                <img src="${normal}" class="poke-img ${isGen6Plus ? 'hd-sprite' : 'pixel-sprite'}" loading="lazy" alt="${p.name}">
            </div>
            <h3 class="name">${p.name}</h3>
            <div class="card-types">
                ${p.types.map(t => `<span class="type" style="background:var(--${t.type.name})">${t.type.name}</span>`).join('')}
            </div>
            <div class="abilities-section">${abilitiesHTML}</div>
        `;

        card.querySelector('.shiny-toggle').onclick = (e) => {
            e.stopPropagation();
            const on = card.classList.toggle('is-shiny');
            card.querySelector('.poke-img').src = on ? shiny : normal;
        };

        card.querySelector('.compare-btn').onclick = (e) => {
            e.stopPropagation();
            this.handleCompare(p);
        };

        card.onclick = (e) => {
            if (!e.target.closest('button')) this.openDetails(p);
        };

        this.container.appendChild(card);
    },

    // ── Compare ──────────────────────────────────────────────────────────────
    handleCompare(p) {
        if (state.compareSelection.find(x => x.id === p.id)) return;
        state.compareSelection.push(p);
        if (state.compareSelection.length === 2) this.showCompareModal();
    },

    showCompareModal() {
        const [p1, p2] = state.compareSelection;

        this.modalHeader.innerHTML = '';
        this.modalBody.innerHTML = `
            <h3 style="margin-bottom:16px;color:var(--text)">⚔️ Battle Stats</h3>
            <canvas id="compareChart"></canvas>
            <button onclick="UI.resetCompare()" style="
                background:var(--accent);color:white;border:none;padding:14px;
                border-radius:14px;width:100%;margin-top:20px;cursor:pointer;
                font-family:inherit;font-weight:700;font-size:0.9rem;">
                FECHAR
            </button>
        `;

        document.querySelector('.modal-tabs').style.visibility = 'hidden';
        document.querySelectorAll('.modal-tab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById('tab-stats').classList.add('active');

        if (state.chartInstance) state.chartInstance.destroy();
        state.chartInstance = new Chart(document.getElementById('compareChart'), {
            type: 'radar',
            data: {
                labels: ['HP','ATK','DEF','S-ATK','S-DEF','SPD'],
                datasets: [
                    { label: p1.name.toUpperCase(), data: p1.stats.map(s=>s.base_stat), borderColor:'#3b4cca', backgroundColor:'rgba(59,76,202,0.15)', pointBackgroundColor:'#3b4cca' },
                    { label: p2.name.toUpperCase(), data: p2.stats.map(s=>s.base_stat), borderColor:'#ff7675', backgroundColor:'rgba(255,118,117,0.15)', pointBackgroundColor:'#ff7675' },
                ],
            },
            options: { scales: { r: { suggestMin: 0, suggestMax: 150 } } },
        });

        this.openModal();
    },

    // ── Details ───────────────────────────────────────────────────────────────
    openDetails(p) {
        const art = p.sprites.other['official-artwork'].front_default;
        const primaryType = p.types[0].type.name;
        const { strong = [], weak = [] } = TYPE_MAP[primaryType] || {};

        // Header
        this.modalHeader.innerHTML = `
            <img src="${art}" alt="${p.name}">
            <span class="modal-id">#${String(p.id).padStart(3,'0')}</span>
            <h2>${p.name}</h2>
            <div class="modal-types">
                ${p.types.map(t=>`<span class="type" style="background:var(--${t.type.name})">${t.type.name}</span>`).join('')}
            </div>
        `;

        // Stats tab
        this.modalBody.innerHTML = `
            <div class="stats-section">
                <h4>Status Base</h4>
                ${p.stats.map(s => `
                    <div class="stat-row">
                        <div class="stat-label-row">
                            <span>${s.stat.name.toUpperCase().replace(/-/g,' ')}</span>
                            <span>${s.base_stat}</span>
                        </div>
                        <div class="stat-bar-bg">
                            <div class="stat-bar-fill" style="width:${Math.min((s.base_stat/200)*100,100)}%"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="type-matchup-grid">
                <div class="matchup-section strong">
                    <h4>Vantagem contra</h4>
                    <div class="type-chips">
                        ${strong.map(t=>`<span class="type" style="background:var(--${t});font-size:0.6rem;padding:4px 8px">${t}</span>`).join('') || '<span style="color:var(--text-muted)">---</span>'}
                    </div>
                </div>
                <div class="matchup-section weak">
                    <h4>Fraqueza contra</h4>
                    <div class="type-chips">
                        ${weak.map(t=>`<span class="type" style="background:var(--${t});font-size:0.6rem;padding:4px 8px">${t}</span>`).join('') || '<span style="color:var(--text-muted)">---</span>'}
                    </div>
                </div>
            </div>
        `;

        // Moves tab
        this.renderMoves(p);

        // Evolution tab: começa com loading, busca async
        document.getElementById('evolutionContainer').innerHTML = '<div class="evo-loading">Carregando cadeia evolutiva</div>';
        fetchEvolutionChain(p.id).then(chain => this.renderEvolution(chain, p.id));

        // Mostra modal na aba Stats
        document.querySelector('.modal-tabs').style.visibility = '';
        this.switchModalTab('stats');
        this.openModal();
    },

    // ── Evolution ─────────────────────────────────────────────────────────────
    renderEvolution(chain, currentId) {
        const container = document.getElementById('evolutionContainer');

        if (!chain) { container.innerHTML = '<div class="evo-empty">Não foi possível carregar</div>'; return; }
        if (chain.length <= 1) { container.innerHTML = '<div class="evo-empty">Este pokémon não evolui</div>'; return; }

        const el = document.createElement('div');
        el.className = 'evolution-chain';

        chain.forEach((evo, i) => {
            if (i > 0) {
                const arrow = document.createElement('div');
                arrow.className = 'evo-arrow';
                arrow.innerHTML = `→${evo.trigger ? `<span class="evo-trigger">${evo.trigger}</span>` : ''}`;
                el.appendChild(arrow);
            }

            const step = document.createElement('div');
            step.className = 'evo-step' + (evo.id === currentId ? ' current-pokemon' : '');
            step.innerHTML = `
                <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${evo.id}.png"
                     alt="${evo.name}" loading="lazy">
                <span class="evo-name">${evo.name}</span>
                <span class="evo-id">#${String(evo.id).padStart(3,'0')}</span>
            `;

            step.onclick = async () => {
                const target = state.allPokemon.get(evo.id) || await fetchPokemon(evo.id);
                if (target) this.openDetails(target);
            };

            el.appendChild(step);
        });

        container.innerHTML = '';
        container.appendChild(el);
    },

    // ── Moves ─────────────────────────────────────────────────────────────────
    renderMoves(p) {
        const container = document.getElementById('movesContainer');
        const moves = p.moves
            .filter(m => m.version_group_details?.some(v => v.move_learn_method.name === 'level-up'))
            .map(m => {
                const d = m.version_group_details.find(v => v.move_learn_method.name === 'level-up');
                return { name: m.move.name, level: d.level_learned_at };
            })
            .filter(m => m.level > 0)
            .sort((a, b) => a.level - b.level);

        if (!moves.length) {
            container.innerHTML = '<div class="no-data-message">Nenhum ataque por nível encontrado</div>';
            return;
        }

        container.innerHTML = `
            <table class="moves-table">
                <thead><tr><th>Lvl</th><th>Ataque</th></tr></thead>
                <tbody>
                    ${moves.map(m => `
                        <tr>
                            <td><span class="move-level">${m.level}</span></td>
                            <td class="move-name">${m.name.replace(/-/g,' ')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    // ── Tabs ──────────────────────────────────────────────────────────────────
    switchModalTab(name) {
        document.querySelectorAll('.modal-tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`tab-${name}`)?.classList.add('active');
        document.querySelector(`[data-tab="${name}"]`)?.classList.add('active');
    },

    // ── Modal open/close ──────────────────────────────────────────────────────
    openModal()  { this.modal.classList.add('open'); },
    closeModal() { this.modal.classList.remove('open'); state.compareSelection = []; },
    resetCompare() { this.closeModal(); },
};

// ─── DATA LOADING ─────────────────────────────────────────────────────────────
const ensureRegionData = async () => {
    if (state.isLoading) return;

    const { start, end } = REGIONS[state.currentRegion];
    const missing = [];

    for (let i = start; i <= end; i++) {
        if (!state.allPokemon.has(i)) missing.push(i);
    }

    if (!missing.length) return;

    state.isLoading = true;
    UI.showSkeletons(8);

    const batch = missing.slice(0, state.itemsPerPage);
    const total = batch.length;

    // Progresso real: atualiza a barra conforme cada pokémon carrega
    let loaded = 0;
    const results = await Promise.all(batch.map(async id => {
        const p = await fetchPokemon(id);
        loaded++;
        const pct = Math.round((loaded / total) * 90); // vai até 90%, o dismiss fecha em 100%
        Splash.setProgress(pct);
        return p;
    }));

    results.forEach(p => { if (p) state.allPokemon.set(p.id, p); });

    UI.hideSkeletons();
    state.isLoading = false;
    render();

    // Fecha splash após o primeiro lote carregar
    if (state.splashDone === undefined) {
        state.splashDone = true;
        Splash.dismiss();
    }
};

// ─── RENDER ───────────────────────────────────────────────────────────────────

/**
 * Dois modos de renderização:
 * - append (padrão): adiciona apenas cards novos ao final — sem piscar
 * - full: limpa tudo e re-renderiza (usado ao mudar filtros/busca/região)
 */
const render = (mode = 'append') => {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const sort  = document.getElementById('sortSelect').value;
    const { start, end } = REGIONS[state.currentRegion];

    let list = Array.from(state.allPokemon.values()).filter(p =>
        p.id >= start && p.id <= end &&
        (query === '' || p.name.includes(query) || String(p.id) === query)
    );

    list.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : a.id - b.id);

    if (mode === 'full') {
        // Troca de filtro/região/busca: redesenha tudo
        UI.container.innerHTML = '';
        list.forEach((p, i) => UI.createCard(p, i));
    } else {
        // Scroll infinito: só adiciona os pokémons que ainda não estão no DOM
        const existingIds = new Set(
            [...UI.container.querySelectorAll('.pokemon[data-id]')]
                .map(el => Number(el.dataset.id))
        );
        const newItems = list.filter(p => !existingIds.has(p.id));
        // Índice começa do total existente para o delay da animação em cascata ficar certo
        newItems.forEach((p, i) => UI.createCard(p, existingIds.size + i));
    }

    // Contador
    document.getElementById('resultsText').textContent =
        `${list.length} pokémon encontrado${list.length !== 1 ? 's' : ''}`;

    // Botão clear
    const hasFilter = query !== '' || state.currentRegion !== 'all';
    document.getElementById('clearFilters').style.display = hasFilter ? 'block' : 'none';

    // Botão X na busca
    document.getElementById('searchClear').classList.toggle('visible', query !== '');
};

// ─── INIT & LISTENERS ─────────────────────────────────────────────────────────
UI.init();
initDarkMode();
Splash.start();

// Estado de região agora em state
state.currentRegion = 'all';

// Region chips
document.getElementById('regionTabs').addEventListener('click', (e) => {
    const chip = e.target.closest('.region-chip');
    if (!chip) return;

    // Remove active de todos, adiciona no clicado
    document.querySelectorAll('.region-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    state.currentRegion = chip.dataset.region;
    UI.container.innerHTML = '';
    ensureRegionData();
});

// Busca com debounce — full porque filtra os existentes
document.getElementById('searchInput').oninput = debounce(() => render('full'), 300);

// Botão X limpa busca
document.getElementById('searchClear').onclick = () => {
    document.getElementById('searchInput').value = '';
    render('full');
};

// Sort — full porque reordena tudo
document.getElementById('sortSelect').onchange = () => render('full');

// Clear all filters
document.getElementById('clearFilters').onclick = () => {
    document.getElementById('searchInput').value = '';
    state.currentRegion = 'all';
    document.querySelectorAll('.region-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.region-chip[data-region="all"]').classList.add('active');
    UI.container.innerHTML = '';
    ensureRegionData();
};

// Fecha modal clicando fora ou Escape
UI.modal.addEventListener('click', e => { if (e.target === UI.modal) UI.closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') UI.closeModal(); });

// Infinite scroll
new IntersectionObserver(
    ([entry]) => { if (entry.isIntersecting && !state.isLoading) ensureRegionData(); },
    { rootMargin: '400px' }
).observe(UI.sentinel);

ensureRegionData();

