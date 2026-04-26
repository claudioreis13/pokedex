// ─── 1. STATE ─────────────────────────────────────────────────────────────────

const state = {
    allPokemon: new Map(),       // Cache O(1) por ID
    evolutionCache: new Map(),   // Cache de evolution chains (evita re-fetch)
    isLoading: false,
    compareSelection: [],
    itemsPerPage: 30,
    searchTimer: null,
    chartInstance: null,
    currentPokemon: null,        // Pokémon aberto no modal
};

// ─── 2. CONSTANTS ─────────────────────────────────────────────────────────────

const REGIONS = {
    all:    { start: 1,   end: 493 },
    kanto:  { start: 1,   end: 151 },
    johto:  { start: 152, end: 251 },
    hoenn:  { start: 252, end: 386 },
    sinnoh: { start: 387, end: 493 },
};

const TYPE_MAP = {
    fire:     { weak: ['water', 'ground', 'rock'],                strong: ['grass', 'ice', 'bug', 'steel'] },
    water:    { weak: ['electric', 'grass'],                      strong: ['fire', 'ground', 'rock'] },
    grass:    { weak: ['fire', 'ice', 'poison', 'flying', 'bug'], strong: ['water', 'ground', 'rock'] },
    electric: { weak: ['ground'],                                 strong: ['water', 'flying'] },
    ground:   { weak: ['water', 'grass', 'ice'],                  strong: ['fire', 'electric', 'poison', 'rock', 'steel'] },
    rock:     { weak: ['water', 'grass', 'fighting', 'ground', 'steel'], strong: ['fire', 'ice', 'flying', 'bug'] },
    ice:      { weak: ['fire', 'fighting', 'rock', 'steel'],      strong: ['grass', 'ground', 'flying', 'dragon'] },
    fighting: { weak: ['psychic', 'flying', 'fairy'],             strong: ['normal', 'ice', 'rock', 'dark', 'steel'] },
    poison:   { weak: ['ground', 'psychic'],                      strong: ['grass', 'fairy'] },
    flying:   { weak: ['electric', 'ice', 'rock'],                strong: ['grass', 'fighting', 'bug'] },
    psychic:  { weak: ['bug', 'ghost', 'dark'],                   strong: ['fighting', 'poison'] },
    bug:      { weak: ['fire', 'flying', 'rock'],                 strong: ['grass', 'psychic', 'dark'] },
    ghost:    { weak: ['ghost', 'dark'],                          strong: ['psychic', 'ghost'] },
    dragon:   { weak: ['ice', 'dragon', 'fairy'],                 strong: ['dragon'] },
    dark:     { weak: ['fighting', 'bug', 'fairy'],               strong: ['psychic', 'ghost'] },
    steel:    { weak: ['fire', 'fighting', 'ground'],             strong: ['ice', 'rock', 'fairy'] },
    fairy:    { weak: ['poison', 'steel'],                        strong: ['fighting', 'dragon', 'dark'] },
    normal:   { weak: ['fighting'],                               strong: [] },
};

// ─── 3. UTILS ─────────────────────────────────────────────────────────────────

const debounce = (func, delay) => {
    return (...args) => {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => func(...args), delay);
    };
};

const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

// ─── 4. DARK MODE ─────────────────────────────────────────────────────────────

const initDarkMode = () => {
    const toggle = document.getElementById('darkToggle');
    const icon = toggle.querySelector('.toggle-icon');
    const saved = localStorage.getItem('theme') || 'light';

    document.documentElement.setAttribute('data-theme', saved);
    icon.textContent = saved === 'dark' ? '☀️' : '🌙';

    toggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', next);
        icon.textContent = next === 'dark' ? '☀️' : '🌙';
        localStorage.setItem('theme', next);

        // Micro-interaction: rotação no ícone
        icon.style.transform = 'rotate(360deg)';
        setTimeout(() => { icon.style.transform = ''; }, 400);
    });
};

// ─── 5. FETCH ─────────────────────────────────────────────────────────────────

const fetchPokemon = async (id) => {
    if (state.allPokemon.has(id)) return state.allPokemon.get(id);
    try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        state.allPokemon.set(id, data);
        return data;
    } catch (err) {
        console.error(`Erro ao buscar pokémon #${id}:`, err);
        return null;
    }
};

/**
 * NOVO: Evolution Chain
 * Fluxo: /pokemon-species/{id} → evolution_chain.url → /evolution-chain/{id}
 * Ambas as respostas são cacheadas para evitar requests repetidos.
 */
const fetchEvolutionChain = async (pokemonId) => {
    // Chave de cache: species + pokemonId
    const cacheKey = `chain_${pokemonId}`;
    if (state.evolutionCache.has(cacheKey)) return state.evolutionCache.get(cacheKey);

    try {
        // Step 1: pega species para obter URL da evolution chain
        const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokemonId}`);
        if (!speciesRes.ok) throw new Error(`Species HTTP ${speciesRes.status}`);
        const species = await speciesRes.json();

        // Step 2: pega a evolution chain
        const chainRes = await fetch(species.evolution_chain.url);
        if (!chainRes.ok) throw new Error(`Chain HTTP ${chainRes.status}`);
        const chainData = await chainRes.json();

        // Step 3: transforma a chain recursiva em array linear
        const chain = parseEvolutionChain(chainData.chain);

        state.evolutionCache.set(cacheKey, chain);
        return chain;
    } catch (err) {
        console.error(`Erro ao buscar evolution chain para #${pokemonId}:`, err);
        return null;
    }
};

/**
 * Transforma a estrutura recursiva da API em array de objetos.
 * Suporta múltiplas evoluções (ex: Eevee → Vaporeon | Jolteon | ...)
 */
const parseEvolutionChain = (chainLink, trigger = null) => {
    const speciesUrl = chainLink.species.url;
    const id = parseInt(speciesUrl.split('/').slice(-2)[0]);
    const name = chainLink.species.name;

    // Pega o detalhe da trigger (o que causa a evolução)
    const triggerDetail = chainLink.evolution_details?.[0];
    const triggerLabel = buildTriggerLabel(triggerDetail);

    const current = { id, name, trigger: triggerLabel };

    if (!chainLink.evolves_to || chainLink.evolves_to.length === 0) {
        return [current];
    }

    // Suporta múltiplas evoluções (ex: Eevee)
    const evolutions = chainLink.evolves_to.flatMap(next =>
        parseEvolutionChain(next, next.evolution_details?.[0])
    );

    return [current, ...evolutions];
};

/**
 * Gera um label legível para o trigger de evolução.
 */
const buildTriggerLabel = (detail) => {
    if (!detail) return null;

    const method = detail.trigger?.name;
    if (method === 'level-up' && detail.min_level) return `Nv. ${detail.min_level}`;
    if (method === 'level-up') return 'Subir de nível';
    if (method === 'use-item' && detail.item) return capitalize(detail.item.name.replace(/-/g, ' '));
    if (method === 'trade') return 'Troca';
    if (detail.min_happiness) return `Amizade`;
    return capitalize(method?.replace(/-/g, ' ') || '');
};

// ─── 6. UI CONTROLLER ─────────────────────────────────────────────────────────

const UI = {
    container: document.getElementById('pokeContainer'),
    status: document.getElementById('resultsText'),
    modal: document.getElementById('modal'),
    modalBody: document.getElementById('modalBody'),
    modalHeader: document.getElementById('modalHeader'),
    sentinel: document.createElement('div'),

    init() {
        this.sentinel.id = 'sentinel';
        this.sentinel.style.height = '20px';
        document.body.appendChild(this.sentinel);
    },

    showSkeletons(count = 8) {
        for (let i = 0; i < count; i++) {
            const div = document.createElement('div');
            div.className = 'pokemon skeleton';
            this.container.appendChild(div);
        }
    },

    hideSkeletons() {
        document.querySelectorAll('.skeleton').forEach(s => s.remove());
    },

    // Micro-interaction: cards entram com animação em cascata
    createCard(p, index = 0) {
        const card = document.createElement('div');
        card.className = 'pokemon';
        const type = p.types[0].type.name;

        const gen5 = p.sprites.versions?.['generation-v']?.['black-white']?.animated;
        const normal = gen5?.front_default || p.sprites.front_default;
        const shiny  = gen5?.front_shiny  || p.sprites.front_shiny;

        card.innerHTML = `
            <div class="card-header">
                <span class="number">#${String(p.id).padStart(3, '0')}</span>
                <div class="actions">
                    <button class="shiny-toggle" title="Ver versão Shiny">✨</button>
                    <button class="compare-btn" title="Comparar pokémon">⚖️</button>
                </div>
            </div>
            <div class="imgContainer" style="background: var(--${type})22">
                <img src="${normal}" class="poke-img" loading="lazy" alt="${p.name}">
            </div>
            <h3 class="name">${p.name}</h3>
            <span class="type" style="background: var(--${type})">${type}</span>
        `;

        // Micro-interaction: entrada com delay em cascata
        card.style.animationDelay = `${Math.min(index * 40, 400)}ms`;
        card.classList.add('entering');

        card.querySelector('.shiny-toggle').onclick = (e) => {
            e.stopPropagation();
            const active = card.classList.toggle('is-shiny');
            card.querySelector('.poke-img').src = active ? shiny : normal;
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

    handleCompare(p) {
        if (state.compareSelection.find(x => x.id === p.id)) return;
        state.compareSelection.push(p);
        if (state.compareSelection.length === 2) this.showCompareModal();
    },

    showCompareModal() {
        const [p1, p2] = state.compareSelection;
        this.modalHeader.innerHTML = '';
        this.modalBody.innerHTML = `
            <h3 style="margin-bottom: 15px; color: var(--text)">Battle Stats</h3>
            <canvas id="compareChart"></canvas>
            <button onclick="UI.resetCompare()" style="background:var(--accent); color:white; border:none; padding:15px; border-radius:15px; width:100%; margin-top:20px; cursor:pointer; font-family:inherit; font-weight:700;">FECHAR</button>
        `;

        // Esconde abas para modal de comparação
        document.querySelector('.modal-tabs').style.display = 'none';
        document.querySelectorAll('.modal-tab-pane').forEach(p => p.classList.remove('active'));
        this.modalBody.parentElement.classList.add('active');

        if (state.chartInstance) state.chartInstance.destroy();
        state.chartInstance = new Chart(document.getElementById('compareChart'), {
            type: 'radar',
            data: {
                labels: ['HP', 'ATK', 'DEF', 'S-ATK', 'S-DEF', 'SPD'],
                datasets: [
                    {
                        label: p1.name.toUpperCase(),
                        data: p1.stats.map(s => s.base_stat),
                        borderColor: '#3b4cca',
                        backgroundColor: 'rgba(59,76,202,0.2)',
                        pointBackgroundColor: '#3b4cca',
                    },
                    {
                        label: p2.name.toUpperCase(),
                        data: p2.stats.map(s => s.base_stat),
                        borderColor: '#ff7675',
                        backgroundColor: 'rgba(255,118,117,0.2)',
                        pointBackgroundColor: '#ff7675',
                    },
                ],
            },
            options: {
                scales: { r: { suggestMin: 0, suggestMax: 150 } },
                plugins: { legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text') } } },
            },
        });

        this.modal.classList.add('active');
    },

    // ─── NOVO: openDetails com header separado e 3 abas ──────────────────────
    openDetails(p) {
        state.currentPokemon = p;
        const art = p.sprites.other['official-artwork'].front_default;
        const primaryType = p.types[0].type.name;
        const advantages = TYPE_MAP[primaryType]?.strong || [];
        const weaknesses = TYPE_MAP[primaryType]?.weak || [];

        // Header do modal (imagem + nome + tipos)
        this.modalHeader.innerHTML = `
            <img src="${art}" alt="${p.name}">
            <div class="modal-id">${String(p.id).padStart(3, '0')}</div>
            <h2>${p.name}</h2>
            <div class="modal-types">
                ${p.types.map(t => `<span class="type" style="background: var(--${t.type.name})">${t.type.name}</span>`).join('')}
            </div>
        `;

        // Aba Stats
        this.modalBody.innerHTML = `
            <div class="stats-section">
                <h4>Status Base</h4>
                ${p.stats.map(s => `
                    <div class="stat-row">
                        <div class="stat-label-row">
                            <span>${s.stat.name.toUpperCase().replace(/-/g, ' ')}</span>
                            <span>${s.base_stat}</span>
                        </div>
                        <div class="stat-bar-bg">
                            <div class="stat-bar-fill" style="width:${Math.min((s.base_stat/200)*100, 100)}%"></div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="type-matchup-grid">
                <div class="matchup-section strong">
                    <h4>Vantagem contra</h4>
                    <div class="type-chips">
                        ${advantages.map(t => `<span class="type" style="background:var(--${t}); font-size:0.6rem; padding:4px 8px">${t}</span>`).join('') || '<span style="color:var(--text-muted)">---</span>'}
                    </div>
                </div>
                <div class="matchup-section weak">
                    <h4>Fraqueza contra</h4>
                    <div class="type-chips">
                        ${weaknesses.map(t => `<span class="type" style="background:var(--${t}); font-size:0.6rem; padding:4px 8px">${t}</span>`).join('') || '<span style="color:var(--text-muted)">---</span>'}
                    </div>
                </div>
            </div>
        `;

        // Aba Ataques (renderiza imediatamente)
        this.renderMoves(p);

        // Aba Evolução: mostra loading e busca assíncrona
        document.getElementById('evolutionContainer').innerHTML = '<div class="evo-loading">Carregando cadeia evolutiva</div>';

        // Mostra modal
        document.querySelector('.modal-tabs').style.display = '';
        this.switchModalTab('stats');
        this.modal.classList.add('active');

        // Busca evolution chain em segundo plano
        fetchEvolutionChain(p.id).then(chain => this.renderEvolutionChain(chain, p.id));
    },

    // ─── NOVO: Evolution Chain renderer ───────────────────────────────────────
    renderEvolutionChain(chain, currentPokemonId) {
        const container = document.getElementById('evolutionContainer');

        if (!chain || chain.length === 0) {
            container.innerHTML = '<div class="evo-empty">Cadeia evolutiva não disponível</div>';
            return;
        }

        // Pokémon com cadeia de 1 (sem evolução)
        if (chain.length === 1) {
            container.innerHTML = '<div class="evo-empty">Este pokémon não possui evolução</div>';
            return;
        }

        const chainEl = document.createElement('div');
        chainEl.className = 'evolution-chain';

        chain.forEach((evo, idx) => {
            // Seta + trigger entre evoluções
            if (idx > 0) {
                const arrow = document.createElement('div');
                arrow.className = 'evo-arrow';
                arrow.innerHTML = `
                    <span>→</span>
                    ${evo.trigger ? `<span class="evo-trigger">${evo.trigger}</span>` : ''}
                `;
                chainEl.appendChild(arrow);
            }

            const step = document.createElement('div');
            step.className = 'evo-step';
            if (evo.id === currentPokemonId) step.classList.add('current-pokemon');

            const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${evo.id}.png`;
            step.innerHTML = `
                <img src="${spriteUrl}" alt="${evo.name}" loading="lazy">
                <span class="evo-name">${evo.name}</span>
                <span class="evo-id">#${String(evo.id).padStart(3, '0')}</span>
            `;

            // Clicar num pokémon na evolution chain abre os detalhes dele
            step.addEventListener('click', async () => {
                const targetPokemon = state.allPokemon.get(evo.id) || await fetchPokemon(evo.id);
                if (targetPokemon) this.openDetails(targetPokemon);
            });

            chainEl.appendChild(step);
        });

        container.innerHTML = '';
        container.appendChild(chainEl);
    },

    // ─── Moves renderer ───────────────────────────────────────────────────────
    renderMoves(pokemon) {
        const container = document.getElementById('movesContainer');

        const moves = pokemon.moves
            .filter(m =>
                m.version_group_details?.length > 0 &&
                m.version_group_details.some(v => v.move_learn_method.name === 'level-up')
            )
            .map(m => {
                const detail = m.version_group_details.find(v => v.move_learn_method.name === 'level-up');
                return { name: m.move.name, level: detail.level_learned_at };
            })
            .filter(m => m.level > 0)
            .sort((a, b) => a.level - b.level);

        if (moves.length === 0) {
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
                            <td class="move-name">${m.name.replace(/-/g, ' ')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    // ─── Tab switching ────────────────────────────────────────────────────────
    switchModalTab(tabName) {
        document.querySelectorAll('.modal-tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`tab-${tabName}`)?.classList.add('active');
        document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
    },

    resetCompare() { state.compareSelection = []; this.closeModal(); },

    closeModal() {
        this.modal.classList.remove('active');
        state.currentPokemon = null;
    },
};

// ─── 7. DATA LOADING ──────────────────────────────────────────────────────────

const ensureRegionData = async () => {
    if (state.isLoading) return;

    const region = document.getElementById('regionSelect').value;
    const { start, end } = REGIONS[region];
    const missingIds = [];

    for (let i = start; i <= end; i++) {
        if (!state.allPokemon.has(i)) missingIds.push(i);
    }

    if (missingIds.length === 0) return;

    state.isLoading = true;
    UI.showSkeletons(8);

    const batch = missingIds.slice(0, state.itemsPerPage);
    const results = await Promise.all(batch.map(id => fetchPokemon(id)));
    results.forEach(p => { if (p) state.allPokemon.set(p.id, p); });

    UI.hideSkeletons();
    state.isLoading = false;
    render();
};

// ─── 8. RENDER ────────────────────────────────────────────────────────────────

const render = () => {
    const query  = document.getElementById('searchInput').value.toLowerCase().trim();
    const region = document.getElementById('regionSelect').value;
    const sort   = document.getElementById('sortSelect').value;
    const { start, end } = REGIONS[region];

    let filtered = Array.from(state.allPokemon.values()).filter(p => {
        const matchRegion = p.id >= start && p.id <= end;
        const matchQuery  = query === '' || p.name.includes(query) || String(p.id) === query;
        return matchRegion && matchQuery;
    });

    filtered.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : a.id - b.id);

    UI.container.innerHTML = '';
    // Micro-interaction: passa o índice para animação em cascata
    filtered.forEach((p, i) => UI.createCard(p, i));
    UI.status.textContent = `${filtered.length} Pokémon encontrados`;
};

// ─── 9. EVENT LISTENERS ───────────────────────────────────────────────────────

UI.init();
initDarkMode();

document.getElementById('searchInput').oninput = debounce(render, 300);

document.getElementById('regionSelect').onchange = () => {
    UI.container.innerHTML = '';
    ensureRegionData();
};

document.getElementById('sortSelect').onchange = render;

// Fecha modal clicando fora
window.addEventListener('click', (e) => {
    if (e.target === UI.modal) UI.closeModal();
});

// Fecha modal com Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') UI.closeModal();
});

// Intersection Observer para infinite scroll
const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.isLoading) ensureRegionData();
}, { rootMargin: '400px' });

observer.observe(UI.sentinel);

// ─── Start ────────────────────────────────────────────────────────────────────
ensureRegionData();
