// 1. STATE MANAGEMENT (Uso de Map para busca O(1) e controle de instâncias)
const state = {
    allPokemon: new Map(), 
    isLoading: false,
    compareSelection: [],
    itemsPerPage: 30,
    searchTimer: null,
    chartInstance: null // Controle para evitar memory leak no Chart.js
};

const REGIONS = {
    all: { start: 1, end: 493 },
    kanto: { start: 1, end: 151 },
    johto: { start: 152, end: 251 },
    hoenn: { start: 252, end: 386 },
    sinnoh: { start: 387, end: 493 }
};

const TYPE_MAP = {
    fire: { weak: ['water', 'ground', 'rock'], strong: ['grass', 'ice', 'bug', 'steel'] },
    water: { weak: ['electric', 'grass'], strong: ['fire', 'ground', 'rock'] },
    grass: { weak: ['fire', 'ice', 'poison', 'flying', 'bug'], strong: ['water', 'ground', 'rock'] },
    electric: { weak: ['ground'], strong: ['water', 'flying'] },
    ground: { weak: ['water', 'grass', 'ice'], strong: ['fire', 'electric', 'poison', 'rock', 'steel'] },
    rock: { weak: ['water', 'grass', 'fighting', 'ground', 'steel'], strong: ['fire', 'ice', 'flying', 'bug'] },
    ice: { weak: ['fire', 'fighting', 'rock', 'steel'], strong: ['grass', 'ground', 'flying', 'dragon'] },
    fighting: { weak: ['psychic', 'flying', 'fairy'], strong: ['normal', 'ice', 'rock', 'dark', 'steel'] },
    poison: { weak: ['ground', 'psychic'], strong: ['grass', 'fairy'] },
    flying: { weak: ['electric', 'ice', 'rock'], strong: ['grass', 'fighting', 'bug'] },
    psychic: { weak: ['bug', 'ghost', 'dark'], strong: ['fighting', 'poison'] },
    bug: { weak: ['fire', 'flying', 'rock'], strong: ['grass', 'psychic', 'dark'] },
    ghost: { weak: ['ghost', 'dark'], strong: ['psychic', 'ghost'] },
    dragon: { weak: ['ice', 'dragon', 'fairy'], strong: ['dragon'] },
    dark: { weak: ['fighting', 'bug', 'fairy'], strong: ['psychic', 'ghost'] },
    steel: { weak: ['fire', 'fighting', 'ground'], strong: ['ice', 'rock', 'fairy'] },
    fairy: { weak: ['poison', 'steel'], strong: ['fighting', 'dragon', 'dark'] },
    normal: { weak: ['fighting'], strong: [] }
};

// 2. UTILS: Debounce para otimizar a busca
const debounce = (func, delay) => {
    return (...args) => {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => func(...args), delay);
    };
};

// 3. UI CONTROLLER
const UI = {
    container: document.getElementById('pokeContainer'),
    status: document.getElementById('resultsText'),
    modal: document.getElementById('modal'),
    modalBody: document.getElementById('modalBody'),
    sentinel: document.createElement('div'), // Sentinela para o Infinite Scroll

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

    hideSkeletons() { document.querySelectorAll('.skeleton').forEach(s => s.remove()); },

    createCard(p) {
        const card = document.createElement('div');
        card.className = 'pokemon';
        const type = p.types[0].type.name;
        const gen5 = p.sprites.versions['generation-v']['black-white'].animated;
        const normal = gen5.front_default || p.sprites.front_default;
        const shiny = gen5.front_shiny || p.sprites.front_shiny;

        card.innerHTML = `
            <div class="card-header">
                <span class="number">#${p.id.toString().padStart(3, '0')}</span>
                <div class="actions">
                    <button class="shiny-toggle">✨</button>
                    <button class="compare-btn">⚖️</button>
                </div>
            </div>
            <div class="imgContainer" style="background: var(--${type})22">
                <img src="${normal}" class="poke-img" loading="lazy" alt="${p.name}">
            </div>
            <h3 class="name">${p.name}</h3>
            <span class="type" style="background: var(--${type})">${type}</span>
        `;

        card.querySelector('.shiny-toggle').onclick = (e) => {
            e.stopPropagation();
            const active = card.classList.toggle('is-shiny');
            card.querySelector('.poke-img').src = active ? shiny : normal;
        };

        card.querySelector('.compare-btn').onclick = (e) => { 
            e.stopPropagation(); 
            this.handleCompare(p); 
        };

        card.onclick = (e) => { if(!e.target.closest('button')) this.openDetails(p); };
        this.container.appendChild(card);
    },

    handleCompare(p) {
        if (state.compareSelection.find(x => x.id === p.id)) return;
        state.compareSelection.push(p);
        if (state.compareSelection.length === 2) this.showCompareModal();
    },

    showCompareModal() {
        const [p1, p2] = state.compareSelection;
        this.modalBody.innerHTML = `<h3>Battle Stats</h3><canvas id="compareChart"></canvas><button onclick="UI.resetCompare()" style="background:var(--accent); color:white; border:none; padding:15px; border-radius:15px; width:100%; margin-top:20px; cursor:pointer">FECHAR</button>`;
        this.modal.style.display = "block";
        
        // CORREÇÃO: Limpar instância anterior do Chart.js para evitar vazamento de memória
        if (state.chartInstance) state.chartInstance.destroy();

        state.chartInstance = new Chart(document.getElementById('compareChart'), {
            type: 'radar',
            data: {
                labels: ['HP', 'ATK', 'DEF', 'S-ATK', 'S-DEF', 'SPD'],
                datasets: [
                    { label: p1.name.toUpperCase(), data: p1.stats.map(s => s.base_stat), borderColor: '#3b4cca', backgroundColor: 'rgba(59,76,202,0.2)' },
                    { label: p2.name.toUpperCase(), data: p2.stats.map(s => s.base_stat), borderColor: '#ff7675', backgroundColor: 'rgba(255,118,117,0.2)' }
                ]
            }
        });
    },

    openDetails(p) {
        const art = p.sprites.other['official-artwork'].front_default;
        const primaryType = p.types[0].type.name;
        const advantages = TYPE_MAP[primaryType]?.strong || [];
        const weaknesses = TYPE_MAP[primaryType]?.weak || [];

        this.modalBody.innerHTML = `
            <img src="${art}" style="width:180px">
            <h2 class="name" style="font-size:2rem; margin:10px 0">${p.name}</h2>
            <div style="text-align:left; max-width:350px; margin:auto">
                <h4 style="margin-bottom:10px; color:#64748b; font-size:0.7rem">STATUS BASE</h4>
                ${p.stats.map(s => `
                    <div style="margin-bottom:8px">
                        <div style="display:flex; justify-content:space-between; font-size:0.7rem; font-weight:bold">
                            <span>${s.stat.name.toUpperCase()}</span><span>${s.base_stat}</span>
                        </div>
                        <div style="background:#eee; height:6px; border-radius:3px">
                            <div style="width:${(s.base_stat/200)*100}%; background:var(--accent); height:100%; border-radius:3px"></div>
                        </div>
                    </div>`).join('')}
            </div>
            <div style="margin-top:25px; display:grid; grid-template-columns: 1fr 1fr; gap:15px; text-align:left">
                <div>
                    <h4 style="font-size:0.6rem; color:#059669; margin-bottom:8px">VANTAGEM</h4>
                    <div style="display:flex; flex-wrap:wrap; gap:4px">
                        ${advantages.map(t => `<span class="type" style="background:var(--${t}); font-size:0.5rem; padding:4px 8px">${t}</span>`).join('') || '---'}
                    </div>
                </div>
                <div>
                    <h4 style="font-size:0.6rem; color:#dc2626; margin-bottom:8px">FRAQUEZA</h4>
                    <div style="display:flex; flex-wrap:wrap; gap:4px">
                        ${weaknesses.map(t => `<span class="type" style="background:var(--${t}); font-size:0.5rem; padding:4px 8px">${t}</span>`).join('') || '---'}
                    </div>
                </div>
            </div>
        `;
        this.modal.style.display = "block";
    },

    resetCompare() { state.compareSelection = []; this.closeModal(); },
    closeModal() { this.modal.style.display = "none"; }
};

// 4. LÓGICA DE REQUISIÇÃO (Com tratamento de Erros)
const fetchPokemon = async (id) => {
    try {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`Erro ao carregar Pokémon ${id}:`, error);
        return null;
    }
};

const ensureRegionData = async () => {
    if (state.isLoading) return;
    
    const region = document.getElementById('regionSelect').value;
    const { start, end } = REGIONS[region];
    const missingIds = [];
    
    // O(1) Lookup usando o Map
    for(let i = start; i <= end; i++) { 
        if(!state.allPokemon.has(i)) missingIds.push(i); 
    }

    if(missingIds.length > 0) {
        state.isLoading = true;
        UI.showSkeletons(8);
        
        const batch = missingIds.slice(0, state.itemsPerPage);
        const results = await Promise.all(batch.map(id => fetchPokemon(id)));
        
        // Adiciona ao Map apenas resultados válidos
        results.forEach(p => { if (p) state.allPokemon.set(p.id, p); });
        
        UI.hideSkeletons();
        state.isLoading = false;
        render();
    }
};

// 5. RENDERIZAÇÃO E FILTROS (Com busca otimizada)
const render = () => {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const region = document.getElementById('regionSelect').value;
    const sort = document.getElementById('sortSelect').value;
    const { start, end } = REGIONS[region];

    // Transforma o Map num array iterável apenas para a região atual
    let filtered = Array.from(state.allPokemon.values()).filter(p => {
        const matchRegion = p.id >= start && p.id <= end;
        const matchQuery = query === '' || p.name.includes(query) || p.id.toString() === query;
        return matchRegion && matchQuery;
    });

    filtered.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : a.id - b.id);

    UI.container.innerHTML = '';
    filtered.forEach(p => UI.createCard(p));
    UI.status.textContent = `${filtered.length} Pokémon encontrados`;
};

// 6. EVENT LISTENERS E OBSERVERS
UI.init();

// Debounce aplicado no input de busca para não rodar a cada letra digitada
document.getElementById('searchInput').oninput = debounce(render, 300);

document.getElementById('regionSelect').onchange = () => { 
    UI.container.innerHTML = ''; // Limpa a tela imediatamente ao mudar
    ensureRegionData(); 
};
document.getElementById('sortSelect').onchange = render;

window.onclick = (e) => { if (e.target == UI.modal) UI.closeModal(); };

// CORREÇÃO: Intersection Observer no lugar de window.onscroll (Mais performático)
const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.isLoading) {
        ensureRegionData();
    }
}, { rootMargin: '400px' });
observer.observe(UI.sentinel);

// Start
ensureRegionData();