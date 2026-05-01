// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
    allPokemon: new Map(),
    evolutionCache: new Map(),
    isLoading: false,
    compareSelection: [],
    itemsPerPage: 30,
    searchTimer: null,
    chartInstance: null,
    currentRegion: 'all',
    loadedCount: 0,
};

// ─── AUDIO ────────────────────────────────────────────────────────────────────
let currentAudio = null;

const normalizeCryName = (name) => {
    return encodeURIComponent(String(name).toLowerCase().trim());
};

const getPokemonCryUrl = (name) => {
    return `https://play.pokemonshowdown.com/audio/cries/${normalizeCryName(name)}.mp3`;
};

const playPokemonCry = (name) => {
    try {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }

        const audio = new Audio(getPokemonCryUrl(name));
        audio.volume = 0.4;

        audio.play().catch(() => {
            // alguns navegadores/arquivos podem bloquear ou falhar silenciosamente
        });

        currentAudio = audio;
    } catch (err) {
        console.warn('Erro ao tocar áudio:', err);
    }
};

const stopPokemonCry = () => {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const REGIONS = {
    all: { start: 1, end: 721 },
    kanto: { start: 1, end: 151 },
    johto: { start: 152, end: 251 },
    hoenn: { start: 252, end: 386 },
    sinnoh: { start: 387, end: 493 },
    unova: { start: 494, end: 649 },
    kalos: { start: 650, end: 721 },
};

const TYPE_MAP = {
    fire:     { weak: ['water', 'ground', 'rock'],                     strong: ['grass', 'ice', 'bug', 'steel'] },
    water:    { weak: ['electric', 'grass'],                           strong: ['fire', 'ground', 'rock'] },
    grass:    { weak: ['fire', 'ice', 'poison', 'flying', 'bug'],      strong: ['water', 'ground', 'rock'] },
    electric: { weak: ['ground'],                                      strong: ['water', 'flying'] },
    ground:   { weak: ['water', 'grass', 'ice'],                       strong: ['fire', 'electric', 'poison', 'rock', 'steel'] },
    rock:     { weak: ['water', 'grass', 'fighting', 'ground', 'steel'], strong: ['fire', 'ice', 'flying', 'bug'] },
    ice:      { weak: ['fire', 'fighting', 'rock', 'steel'],           strong: ['grass', 'ground', 'flying', 'dragon'] },
    fighting: { weak: ['psychic', 'flying', 'fairy'],                  strong: ['normal', 'ice', 'rock', 'dark', 'steel'] },
    poison:   { weak: ['ground', 'psychic'],                           strong: ['grass', 'fairy'] },
    flying:   { weak: ['electric', 'ice', 'rock'],                     strong: ['grass', 'fighting', 'bug'] },
    psychic:  { weak: ['bug', 'ghost', 'dark'],                        strong: ['fighting', 'poison'] },
    bug:      { weak: ['fire', 'flying', 'rock'],                      strong: ['grass', 'psychic', 'dark'] },
    ghost:    { weak: ['ghost', 'dark'],                                strong: ['psychic', 'ghost'] },
    dragon:   { weak: ['ice', 'dragon', 'fairy'],                      strong: ['dragon'] },
    dark:     { weak: ['fighting', 'bug', 'fairy'],                    strong: ['psychic', 'ghost'] },
    steel:    { weak: ['fire', 'fighting', 'ground'],                  strong: ['ice', 'rock', 'fairy'] },
    fairy:    { weak: ['poison', 'steel'],                              strong: ['fighting', 'dragon', 'dark'] },
    normal:   { weak: ['fighting'],                                     strong: [] },
};

// ─── UTILS ────────────────────────────────────────────────────────────────────
const debounce = (fn, ms) => (...args) => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => fn(...args), ms);
};

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const formatPokemonName = (name) => {
    return String(name)
        .split('-')
        .map(capitalize)
        .join(' ');
};

const getPrimaryType = (types) => {
    return types?.[0]?.type?.name ?? 'normal';
};

const getTypeColor = (type) => {
    return `var(--${type}, var(--normal))`;
};

const hasMorePokemonToLoad = () => {
    const region = REGIONS[state.currentRegion] || REGIONS.all;
    for (let i = region.start; i <= region.end; i++) {
        if (!state.allPokemon.has(i)) return true;
    }
    return false;
};

// ─── DARK MODE ────────────────────────────────────────────────────────────────
const initDarkMode = () => {
    const btn = document.getElementById('darkToggle');
    if (!btn) return;

    const icon = btn.querySelector('.toggle-icon');
    const saved = localStorage.getItem('pokedex-theme') || 'light';

    document.documentElement.setAttribute('data-theme', saved);
    if (icon) icon.textContent = saved === 'dark' ? '☀️' : '🌙';

    btn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        if (icon) icon.textContent = next === 'dark' ? '☀️' : '🌙';
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
        if (!speciesRes.ok) throw new Error(`HTTP ${speciesRes.status}`);
        const species = await speciesRes.json();

        const chainRes = await fetch(species.evolution_chain.url);
        if (!chainRes.ok) throw new Error(`HTTP ${chainRes.status}`);
        const { chain } = await chainRes.json();

        const parsed = parseChain(chain);
        state.evolutionCache.set(key, parsed);
        return parsed;
    } catch (err) {
        console.warn(`[Pokédex] Falha ao carregar evolução de #${pokemonId}`, err);
        return null;
    }
};

const parseChain = (link) => {
    const id = parseInt(link.species.url.split('/').slice(-2)[0], 10);
    const detail = link.evolution_details?.[0];
    const current = { id, name: link.species.name, trigger: buildTrigger(detail) };

    if (!link.evolves_to?.length) return [current];
    return [current, ...link.evolves_to.flatMap((n) => parseChain(n))];
};

const buildTrigger = (d) => {
    if (!d) return null;
    if (d.trigger?.name === 'level-up' && d.min_level) return `Nv. ${d.min_level}`;
    if (d.trigger?.name === 'level-up') return 'Level up';
    if (d.trigger?.name === 'use-item' && d.item) return capitalize(d.item.name.replace(/-/g, ' '));
    if (d.trigger?.name === 'trade') return 'Troca';
    if (d.min_happiness) return 'Amizade';
    return capitalize(d.trigger?.name?.replace(/-/g, ' ') || '');
};

// ─── SPLASH SCREEN ────────────────────────────────────────────────────────────
const Splash = {
    el: document.getElementById('splash'),
    progress: document.getElementById('splashProgress'),
    msg: document.getElementById('splashMsg'),

    messages: [
        'Iniciando Pokédex...',
        'Conectando à PokéAPI...',
        'Carregando pokémons...',
        'Quase pronto...',
    ],

    msgIndex: 0,
    msgTimer: null,
    startTime: 0,

    start() {
        this.startTime = Date.now();
        this.setProgress(0);
        this.cycleMessages();
    },

    setProgress(pct, message) {
        if (this.progress) this.progress.style.width = `${pct}%`;
        if (message && this.msg) this.msg.textContent = message;
    },

    cycleMessages() {
        if (this.msg) this.msg.textContent = this.messages[this.msgIndex];
        this.msgIndex = (this.msgIndex + 1) % this.messages.length;
        this.msgTimer = setTimeout(() => this.cycleMessages(), 800);
    },

    dismiss() {
        clearTimeout(this.msgTimer);

        const elapsed = Date.now() - this.startTime;
        const minDuration = 5000;
        const remaining = Math.max(0, minDuration - elapsed);

        setTimeout(() => {
            this.setProgress(100, 'Pronto! ✓');
            setTimeout(() => {
                if (this.el) this.el.classList.add('hidden');
            }, 700);
        }, remaining);
    },
};

// ─── UI ───────────────────────────────────────────────────────────────────────
const UI = {
    container: document.getElementById('pokeContainer'),
    status: document.getElementById('resultsText'),
    modal: document.getElementById('modal'),
    modalBody: document.getElementById('modalBody'),
    modalHeader: document.getElementById('modalHeader'),
    sentinel: document.getElementById('sentinel'),

    init() {
        if (!this.sentinel) {
            this.sentinel = document.createElement('div');
            this.sentinel.id = 'sentinel';
            this.sentinel.style.height = '1px';
            document.body.appendChild(this.sentinel);
        }
    },

    showSkeletons(n = 8) {
        if (!this.container) return;

        const fragment = document.createDocumentFragment();

        for (let i = 0; i < n; i++) {
            const d = document.createElement('div');
            d.className = 'pokemon skeleton';
            fragment.appendChild(d);
        }

        this.container.appendChild(fragment);
    },

    hideSkeletons() {
        document.querySelectorAll('.skeleton').forEach((s) => s.remove());
    },

    createCard(p, idx = 0, target = this.container) {
        if (!p || !target) return null;

        const card = document.createElement('div');
        card.className = 'pokemon entering';
        card.dataset.id = p.id;
        card.style.animationDelay = `${Math.min(idx * 35, 350)}ms`;

        const primaryType = getPrimaryType(p.types);
        const isGen6Plus = p.id >= 650;

        let normal;
        let shiny;

        if (isGen6Plus) {
            normal = p.sprites.other?.['official-artwork']?.front_default || p.sprites.front_default;
            shiny = p.sprites.other?.['official-artwork']?.front_shiny || p.sprites.front_shiny || normal;
        } else {
            const gen5 = p.sprites.versions?.['generation-v']?.['black-white']?.animated;
            normal = gen5?.front_default || p.sprites.front_default;
            shiny = gen5?.front_shiny || p.sprites.front_shiny || normal;
        }

        const abilitiesHTML = p.abilities.map((a) => `
            <span class="ability-tag ${a.is_hidden ? 'ability-hidden' : ''}">
                ${a.is_hidden ? '👁 ' : ''}${a.ability.name.replace(/-/g, ' ')}
            </span>
        `).join('');

        card.innerHTML = `
            <div class="card-header">
                <span class="number">#${String(p.id).padStart(3, '0')}</span>
                <div class="actions">
                    <button class="shiny-toggle" title="Ver Shiny" type="button">✨</button>
                    <button class="compare-btn" title="Comparar" type="button">⚖️</button>
                </div>
            </div>

            <div class="imgContainer" style="background:${getTypeColor(primaryType)}22">
                <img
                    src="${normal}"
                    class="poke-img ${isGen6Plus ? 'hd-sprite' : 'pixel-sprite'}"
                    loading="lazy"
                    alt="${formatPokemonName(p.name)}"
                >
            </div>

            <h3 class="name">${formatPokemonName(p.name)}</h3>

            <div class="card-types">
                ${p.types.map((t) => `
                    <span class="type" style="background:${getTypeColor(t.type.name)}">
                        ${t.type.name}
                    </span>
                `).join('')}
            </div>

            <div class="abilities-section">${abilitiesHTML}</div>
        `;

        const imgEl = card.querySelector('.poke-img');
        const shinyBtn = card.querySelector('.shiny-toggle');
        const compareBtn = card.querySelector('.compare-btn');

        if (shinyBtn && imgEl) {
            shinyBtn.onclick = (e) => {
                e.stopPropagation();
                const on = card.classList.toggle('is-shiny');
                imgEl.src = on ? shiny : normal;
            };
        }

        if (compareBtn) {
            compareBtn.onclick = (e) => {
                e.stopPropagation();
                this.handleCompare(p);
            };
        }

        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Ver detalhes de ${p.name}`);

        card.onclick = (e) => {
            if (!e.target.closest('button')) {
                state.lastFocusedCard = card;
                this.openDetails(p);
            }
        };

        // Suporte a teclado: Enter e Espaço abrem o modal
        card.onkeydown = (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) {
                e.preventDefault();
                state.lastFocusedCard = card;
                this.openDetails(p);
            }
        };

        target.appendChild(card);
        return card;
    },

    handleCompare(p) {
        if (state.compareSelection.find((x) => x.id === p.id)) return;
        state.compareSelection.push(p);

        if (state.compareSelection.length === 2) {
            this.showCompareModal();
        }
    },

    showCompareModal() {
        const [p1, p2] = state.compareSelection;

        if (!p1 || !p2) return;

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

        const tabs = document.querySelector('.modal-tabs');
        if (tabs) tabs.style.visibility = 'hidden';

        document.querySelectorAll('.modal-tab-pane').forEach((pane) => pane.classList.remove('active'));
        const statsTab = document.getElementById('tab-stats');
        if (statsTab) statsTab.classList.add('active');

        if (state.chartInstance) state.chartInstance.destroy();

        const canvas = document.getElementById('compareChart');
        if (canvas) {
            state.chartInstance = new Chart(canvas, {
                type: 'radar',
                data: {
                    labels: ['HP', 'ATK', 'DEF', 'S-ATK', 'S-DEF', 'SPD'],
                    datasets: [
                        {
                            label: p1.name.toUpperCase(),
                            data: p1.stats.map((s) => s.base_stat),
                            borderColor: '#3b4cca',
                            backgroundColor: 'rgba(59,76,202,0.15)',
                            pointBackgroundColor: '#3b4cca',
                        },
                        {
                            label: p2.name.toUpperCase(),
                            data: p2.stats.map((s) => s.base_stat),
                            borderColor: '#ff7675',
                            backgroundColor: 'rgba(255,118,117,0.15)',
                            pointBackgroundColor: '#ff7675',
                        },
                    ],
                },
                options: {
                    scales: {
                        r: {
                            suggestMin: 0,
                            suggestMax: 150,
                        },
                    },
                },
            });
        }

        this.openModal();
    },

    openDetails(p) {
        playPokemonCry(p.name);

        const art = p.sprites.other?.['official-artwork']?.front_default || p.sprites.front_default;
        const primaryType = getPrimaryType(p.types);
        const { strong = [], weak = [] } = TYPE_MAP[primaryType] || {};

        this.modalHeader.innerHTML = `
            <img src="${art}" alt="${formatPokemonName(p.name)}">
            <span class="modal-id">#${String(p.id).padStart(3, '0')}</span>
            <h2>${formatPokemonName(p.name)}</h2>
            <div class="modal-types">
                ${p.types.map((t) => `
                    <span class="type" style="background:${getTypeColor(t.type.name)}">
                        ${t.type.name}
                    </span>
                `).join('')}
            </div>
        `;

        this.modalBody.innerHTML = `
            <div class="stats-section">
                <h4>Status Base</h4>
                ${p.stats.map((s) => `
                    <div class="stat-row">
                        <div class="stat-label-row">
                            <span>${s.stat.name.toUpperCase().replace(/-/g, ' ')}</span>
                            <span>${s.base_stat}</span>
                        </div>
                        <div class="stat-bar-bg">
                            <div class="stat-bar-fill" style="width:${Math.min((s.base_stat / 200) * 100, 100)}%"></div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="type-matchup-grid">
                <div class="matchup-section strong">
                    <h4>Vantagem contra</h4>
                    <div class="type-chips">
                        ${strong.map((t) => `
                            <span class="type" style="background:${getTypeColor(t)};font-size:0.6rem;padding:4px 8px">${t}</span>
                        `).join('') || '<span style="color:var(--text-muted)">---</span>'}
                    </div>
                </div>

                <div class="matchup-section weak">
                    <h4>Fraqueza contra</h4>
                    <div class="type-chips">
                        ${weak.map((t) => `
                            <span class="type" style="background:${getTypeColor(t)};font-size:0.6rem;padding:4px 8px">${t}</span>
                        `).join('') || '<span style="color:var(--text-muted)">---</span>'}
                    </div>
                </div>
            </div>
        `;

        this.renderMoves(p);

        const evoContainer = document.getElementById('evolutionContainer');
        if (evoContainer) evoContainer.innerHTML = '<div class="evo-loading">Carregando cadeia evolutiva...</div>';

        fetchEvolutionChain(p.id).then((chain) => this.renderEvolution(chain, p.id));

        const tabs = document.querySelector('.modal-tabs');
        if (tabs) tabs.style.visibility = '';
        this.switchModalTab('stats');
        this.openModal();
    },

    renderEvolution(chain, currentId) {
        const container = document.getElementById('evolutionContainer');
        if (!container) return;

        if (!chain) {
            container.innerHTML = '<div class="evo-empty">Não foi possível carregar</div>';
            return;
        }

        if (chain.length <= 1) {
            container.innerHTML = '<div class="evo-empty">Este pokémon não evolui</div>';
            return;
        }

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
            step.className = `evo-step${evo.id === currentId ? ' current-pokemon' : ''}`;
            step.innerHTML = `
                <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${evo.id}.png"
                     alt="${formatPokemonName(evo.name)}" loading="lazy">
                <span class="evo-name">${formatPokemonName(evo.name)}</span>
                <span class="evo-id">#${String(evo.id).padStart(3, '0')}</span>
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

    renderMoves(p) {
        const container = document.getElementById('movesContainer');
        if (!container) return;

        const moves = p.moves
            .filter((m) => m.version_group_details?.some((v) => v.move_learn_method.name === 'level-up'))
            .map((m) => {
                const d = m.version_group_details.find((v) => v.move_learn_method.name === 'level-up');
                return { name: m.move.name, level: d.level_learned_at };
            })
            .filter((m) => m.level > 0)
            .sort((a, b) => a.level - b.level);

        if (!moves.length) {
            container.innerHTML = '<div class="no-data-message">Nenhum ataque por nível encontrado</div>';
            return;
        }

        container.innerHTML = `
            <table class="moves-table">
                <thead>
                    <tr><th>Lvl</th><th>Ataque</th></tr>
                </thead>
                <tbody>
                    ${moves.map((m) => `
                        <tr>
                            <td><span class="move-level">${m.level}</span></td>
                            <td class="move-name">${m.name.replace(/-/g, ' ')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    switchModalTab(name) {
        document.querySelectorAll('.modal-tab-pane').forEach((p) => p.classList.remove('active'));
        document.querySelectorAll('.modal-tab-btn').forEach((b) => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
        document.getElementById(`tab-${name}`)?.classList.add('active');
        const activeBtn = document.querySelector(`[data-tab="${name}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.setAttribute('aria-selected', 'true');
        }
    },

    openModal() {
        this.modal?.classList.add('open');
        this.modal?.removeAttribute('aria-hidden');
        // Foco vai para o botão fechar ao abrir
        setTimeout(() => document.getElementById('modalClose')?.focus(), 50);
        // Ativa focus trap
        this._trapFocus();
        // Impede scroll do body
        document.body.style.overflow = 'hidden';
    },

    closeModal() {
        this.modal?.classList.remove('open');
        this.modal?.setAttribute('aria-hidden', 'true');
        state.compareSelection = [];
        stopPokemonCry();
        document.body.style.overflow = '';

        if (state.chartInstance) {
            state.chartInstance.destroy();
            state.chartInstance = null;
        }

        const tabs = document.querySelector('.modal-tabs');
        if (tabs) tabs.style.visibility = '';

        // Remove focus trap
        if (this._trapHandler) {
            document.removeEventListener('keydown', this._trapHandler);
            this._trapHandler = null;
        }

        // Devolve foco ao card que abriu o modal
        state.lastFocusedCard?.focus();
    },

    _trapFocus() {
        const modal = this.modal;
        if (!modal) return;

        const focusable = 'button, [href], input, select, [tabindex]:not([tabindex="-1"])';

        this._trapHandler = (e) => {
            if (e.key !== 'Tab') return;

            const elements = [...modal.querySelectorAll(focusable)].filter(
                el => !el.disabled && el.offsetParent !== null
            );
            if (!elements.length) return;

            const first = elements[0];
            const last  = elements[elements.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', this._trapHandler);
    },

    resetCompare() {
        this.closeModal();
    },
};

// ─── DATA LOADING ─────────────────────────────────────────────────────────────
const ensureRegionData = async () => {
    if (state.isLoading) return;

    const region = REGIONS[state.currentRegion] || REGIONS.all;
    const missing = [];

    for (let i = region.start; i <= region.end; i++) {
        if (!state.allPokemon.has(i)) missing.push(i);
    }

    if (!missing.length) return;

    state.isLoading = true;
    UI.showSkeletons(8);

    const batch = missing.slice(0, state.itemsPerPage);
    const total = batch.length;
    let loaded = 0;

    try {
        const results = await Promise.all(
            batch.map(async (id) => {
                const p = await fetchPokemon(id);
                loaded++;
                const pct = Math.round((loaded / total) * 90);
                Splash.setProgress(pct);
                return p;
            })
        );

        results.forEach((p) => {
            if (p) state.allPokemon.set(p.id, p);
        });

        state.loadedCount = Math.max(state.loadedCount, batch[batch.length - 1] || state.loadedCount);
    } catch (err) {
        console.error('[Pokédex] Erro ao carregar pokémons:', err);
    } finally {
        UI.hideSkeletons();
        state.isLoading = false;
        render();

        if (state.splashDone === undefined) {
            state.splashDone = true;
            Splash.dismiss();
        }
    }
};

// ─── RENDER ───────────────────────────────────────────────────────────────────
const render = (mode = 'append') => {
    if (!UI.container) return;

    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const resultsText = document.getElementById('resultsText');
    const clearFiltersBtn = document.getElementById('clearFilters');
    const searchClearBtn = document.getElementById('searchClear');

    const query = (searchInput?.value || '').toLowerCase().trim();
    const sort = sortSelect?.value || 'id';
    const region = REGIONS[state.currentRegion] || REGIONS.all;

    let list = Array.from(state.allPokemon.values()).filter((p) => {
        const inRegion = p.id >= region.start && p.id <= region.end;
        const matchesQuery = query === '' || p.name.includes(query) || String(p.id) === query;
        return inRegion && matchesQuery;
    });

    list.sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name);
        return a.id - b.id;
    });

    if (mode === 'full') {
        UI.container.innerHTML = '';

        if (!list.length) {
            UI.container.innerHTML = `
                <div class="no-data-message" style="grid-column: 1 / -1;">
                    Ops! Nenhum Pokémon encontrado.
                </div>
            `;
        } else {
            const fragment = document.createDocumentFragment();
            list.forEach((p, i) => UI.createCard(p, i, fragment));
            UI.container.appendChild(fragment);
        }
    } else {
        const existingIds = new Set(
            [...UI.container.querySelectorAll('.pokemon[data-id]')].map((el) => Number(el.dataset.id))
        );

        const newItems = list.filter((p) => !existingIds.has(p.id));
        const fragment = document.createDocumentFragment();
        newItems.forEach((p, i) => UI.createCard(p, existingIds.size + i, fragment));
        UI.container.appendChild(fragment);
    }

    if (resultsText) {
        resultsText.textContent = list.length
            ? `${list.length} pokémon encontrado${list.length !== 1 ? 's' : ''}`
            : '0 pokémon encontrados';
    }

    const hasFilter = query !== '' || state.currentRegion !== 'all';
    if (clearFiltersBtn) clearFiltersBtn.style.display = hasFilter ? 'block' : 'none';
    if (searchClearBtn) searchClearBtn.classList.toggle('visible', query !== '');
};

// ─── INIT & LISTENERS ─────────────────────────────────────────────────────────
UI.init();
initDarkMode();
Splash.start();

// Region chips
document.getElementById('regionTabs')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.region-chip');
    if (!chip) return;

    document.querySelectorAll('.region-chip').forEach((c) => {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
    });
    chip.classList.add('active');
    chip.setAttribute('aria-pressed', 'true');

    state.currentRegion = chip.dataset.region;
    UI.container.innerHTML = '';
    ensureRegionData();
});

// Busca com debounce
document.getElementById('searchInput')?.addEventListener('input', debounce(() => render('full'), 300));

// Botão X limpa busca
document.getElementById('searchClear')?.addEventListener('click', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    render('full');
});

// Sort
document.getElementById('sortSelect')?.addEventListener('change', () => render('full'));

// Clear all filters
document.getElementById('clearFilters')?.addEventListener('click', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    state.currentRegion = 'all';

    document.querySelectorAll('.region-chip').forEach((c) => c.classList.remove('active'));
    document.querySelector('.region-chip[data-region="all"]')?.classList.add('active');

    UI.container.innerHTML = '';
    ensureRegionData();
});

// Fecha modal clicando fora ou Escape
UI.modal?.addEventListener('click', (e) => {
    if (e.target === UI.modal) UI.closeModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') UI.closeModal();

    // Navegação por setas nas abas do modal
    if (e.target.matches('.modal-tab-btn')) {
        const tabs = [...document.querySelectorAll('.modal-tab-btn')];
        const idx  = tabs.indexOf(e.target);
        if (e.key === 'ArrowRight') { e.preventDefault(); tabs[(idx + 1) % tabs.length].focus(); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); tabs[(idx - 1 + tabs.length) % tabs.length].focus(); }
    }
});

// Botão fechar via click (HTML usa id ao invés de onclick inline)
document.getElementById('modalClose')?.addEventListener('click', () => UI.closeModal());

// Infinite scroll
new IntersectionObserver(
    ([entry]) => {
        if (entry.isIntersecting && !state.isLoading && hasMorePokemonToLoad()) {
            ensureRegionData();
        }
    },
    { rootMargin: '400px' }
).observe(UI.sentinel);

// Primeira carga
ensureRegionData();
// ─── MUSIC PLAYER ─────────────────────────────────────────────────────────────

const PLAYLIST = [
    // Kanto (FireRed/LeafGreen - GBA) — URLs com pasta Disc 1 confirmadas
    { title: 'Pallet Town',          url: 'https://archive.org/download/pkmn-frlg-soundtrack/Disc%201/04%20-%20Pallet%20Town.mp3' },
    { title: 'Route 1',              url: 'https://archive.org/download/pkmn-frlg-soundtrack/Disc%201/12%20-%20Route%201.mp3' },
    { title: 'Pewter City',          url: 'https://archive.org/download/pkmn-frlg-soundtrack/Disc%201/15%20-%20Pewter%20City.mp3' },
    { title: 'Pokémon Center',  url: 'https://archive.org/download/pkmn-frlg-soundtrack/Disc%201/16%20-%20Pok%C3%A9mon%20Center.mp3' },
    { title: 'Viridian Forest',      url: 'https://archive.org/download/pkmn-frlg-soundtrack/Disc%201/19%20-%20Viridian%20Forest.mp3' },
    { title: 'Cerulean City',        url: 'https://archive.org/download/pkmn-frlg-soundtrack/Disc%201/31%20-%20Cerulean%20City.mp3' },
    { title: 'Lavender Town',        url: 'https://archive.org/download/pkmn-frlg-soundtrack/Disc%201/39%20-%20Lavender%20Town.mp3' },
    { title: 'Celadon City',         url: 'https://archive.org/download/pkmn-frlg-soundtrack/Disc%201/41%20-%20Celadon%20City.mp3' },
    { title: 'Surf',                 url: 'https://archive.org/download/pkmn-frlg-soundtrack/Disc%201/51%20-%20Surf.mp3' },
    { title: 'Battle! (Trainer)',    url: 'https://archive.org/download/pkmn-frlg-soundtrack/Disc%201/09%20-%20Battle%21%20%28Trainer%29%20.mp3' },
    { title: 'Battle! (Gym Leader)', url: 'https://archive.org/download/pkmn-frlg-soundtrack/Disc%201/25%20-%20Battle%21%20%28Gym%20Leader%29.mp3' },
    { title: 'Pokémon Gym',     url: 'https://archive.org/download/pkmn-frlg-soundtrack/Disc%201/23%20-%20Pok%C3%A9mon%20Gym.mp3' },
    // Johto (Gold/Silver)
    { title: 'New Bark Town',        url: 'https://archive.org/download/pkmn-gsc-soundtrack/04%20New%20Bark%20Town.mp3' },
    { title: 'Route 29',             url: 'https://archive.org/download/pkmn-gsc-soundtrack/05%20Route%2029.mp3' },
    { title: 'Goldenrod City',       url: 'https://archive.org/download/pkmn-gsc-soundtrack/16%20Goldenrod%20City.mp3' },
    // Hoenn (Ruby/Sapphire)
    { title: 'Littleroot Town',      url: 'https://archive.org/download/pkmn-rse-soundtrack/04%20Littleroot%20Town.mp3' },
    { title: 'Route 101',            url: 'https://archive.org/download/pkmn-rse-soundtrack/05%20Route%20101.mp3' },
    { title: 'Petalburg City',       url: 'https://archive.org/download/pkmn-rse-soundtrack/06%20Petalburg%20City.mp3' },
    // Sinnoh (Diamond/Pearl)
    { title: 'Twinleaf Town',        url: 'https://archive.org/download/pkmn-dppt-soundtrack/04%20Twinleaf%20Town.mp3' },
    { title: 'Route 201',            url: 'https://archive.org/download/pkmn-dppt-soundtrack/05%20Route%20201%20%28Day%29.mp3' },
    { title: 'Jubilife City',        url: 'https://archive.org/download/pkmn-dppt-soundtrack/07%20Jubilife%20City.mp3' },
];

const MusicPlayer = {
    audio:   new Audio(),
    index:   0,
    isMuted: false,

    init() {
        this.audio.volume = 0.30;
        this.audio.loop   = false;
        this.audio.addEventListener('ended', () => this.next());
        this.audio.addEventListener('error', () => {
            console.warn('Erro ao carregar música, pulando...');
            setTimeout(() => this.next(), 1000);
        });

        // Controles
        document.getElementById('musicPlay')?.addEventListener('click', () => this.togglePlay());
        document.getElementById('musicPrev')?.addEventListener('click', () => this.prev());
        document.getElementById('musicNext')?.addEventListener('click', () => this.next());
        document.getElementById('musicMute')?.addEventListener('click', () => this.toggleMute());
        document.getElementById('musicVolume')?.addEventListener('input', (e) => {
            this.audio.volume = e.target.value / 100;
            if (this.isMuted) this.toggleMute(); // desmuta ao ajustar volume
        });

        // Começa a tocar ao iniciar (assim que splash aparecer)
        this.load(0);
        this.play();
    },

    load(idx) {
        this.index = (idx + PLAYLIST.length) % PLAYLIST.length;
        const track = PLAYLIST[this.index];
        this.audio.src = track.url;
        const titleEl = document.getElementById('musicTitle');
        if (titleEl) titleEl.textContent = track.title;
    },

    play() {
        this.audio.play().then(() => {
            // Tocou com sucesso
            const btn = document.getElementById('musicPlay');
            if (btn) btn.textContent = '⏸';
        }).catch(() => {
            // Bloqueado pelo browser — mostra ▶ e aguarda primeiro clique em qualquer lugar
            const btn = document.getElementById('musicPlay');
            if (btn) btn.textContent = '▶';

            const startOnInteraction = () => {
                this.audio.play().then(() => {
                    if (btn) btn.textContent = '⏸';
                }).catch(() => {});
            };

            document.addEventListener('click', startOnInteraction, { once: true });
            document.addEventListener('keydown', startOnInteraction, { once: true });
        });
    },

    pause() {
        this.audio.pause();
        const btn = document.getElementById('musicPlay');
        if (btn) btn.textContent = '▶';
    },

    togglePlay() {
        this.audio.paused ? this.play() : this.pause();
    },

    prev() {
        this.load(this.index - 1);
        this.play();
    },

    next() {
        this.load(this.index + 1);
        this.play();
    },

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.audio.muted = this.isMuted;
        const btn = document.getElementById('musicMute');
        const player = document.getElementById('musicPlayer');
        if (btn) btn.textContent = this.isMuted ? '🔇' : '🔊';
        if (player) player.classList.toggle('muted', this.isMuted);
    },
};

// Inicia o player junto com o resto da app
MusicPlayer.init();
