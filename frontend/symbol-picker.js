// Symbol Picker - Media Manager Component for End Users
// This is a reusable component that can be embedded in any page

class SymbolPicker {
    constructor(options = {}) {
        this.onSelect = options.onSelect || (() => {});
        this.modalId = options.modalId || 'symbolPickerModal';
        this.selectedSymbol = null;
        this.symbols = [];
        this.init();
    }

    init() {
        // Create modal HTML
        this.createModal();
        // Load symbols on initialization
        this.loadSymbols();
    }

    createModal() {
        // Check if modal already exists
        if (document.getElementById(this.modalId)) {
            return;
        }

        const modalHTML = `
            <div id="${this.modalId}" class="symbol-picker-modal">
                <div class="symbol-picker-overlay" onclick="symbolPicker.close()"></div>
                <div class="symbol-picker-content">
                    <div class="symbol-picker-header">
                        <h2>🎯 Select Symbol</h2>
                        <button class="symbol-picker-close" onclick="symbolPicker.close()">&times;</button>
                    </div>

                    <div class="symbol-picker-search">
                        <input 
                            type="text" 
                            id="symbolPickerSearch" 
                            placeholder="🔍 Search symbols..." 
                            oninput="symbolPicker.filterSymbols()"
                        >
                        <select id="symbolPickerCategory" onchange="symbolPicker.filterSymbols()">
                            <option value="">All Categories</option>
                            <option value="political-party">Political Party</option>
                            <option value="independent">Independent</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div class="symbol-picker-loading" id="symbolPickerLoading">
                        <div class="symbol-picker-spinner"></div>
                        <p>Loading symbols...</p>
                    </div>

                    <div class="symbol-picker-grid" id="symbolPickerGrid" style="display: none;">
                        <!-- Symbols will be loaded here -->
                    </div>

                    <div class="symbol-picker-empty" id="symbolPickerEmpty" style="display: none;">
                        <div class="empty-icon">🎯</div>
                        <p>No symbols found</p>
                        <small>Try adjusting your search or filters</small>
                    </div>

                    <div class="symbol-picker-footer">
                        <button class="btn-cancel" onclick="symbolPicker.close()">Cancel</button>
                        <button class="btn-select" onclick="symbolPicker.confirmSelection()" disabled id="symbolPickerConfirm">
                            Select Symbol
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Inject modal into body
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Inject styles
        this.injectStyles();
    }

    injectStyles() {
        if (document.getElementById('symbol-picker-styles')) {
            return;
        }

        const styles = `
            <style id="symbol-picker-styles">
                .symbol-picker-modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 10000;
                    animation: fadeIn 0.2s ease;
                }

                .symbol-picker-modal.active {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .symbol-picker-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(4px);
                }

                .symbol-picker-content {
                    position: relative;
                    background: white;
                    border-radius: 16px;
                    width: 95%;
                    max-width: 1100px;
                    max-height: 85vh;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    animation: slideUp 0.3s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes slideUp {
                    from { 
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to { 
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .symbol-picker-header {
                    padding: 1.5rem;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .symbol-picker-header h2 {
                    margin: 0;
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: #1f2937;
                }

                .symbol-picker-close {
                    background: none;
                    border: none;
                    font-size: 2rem;
                    color: #6b7280;
                    cursor: pointer;
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    transition: all 0.2s;
                }

                .symbol-picker-close:hover {
                    background: #f3f4f6;
                    color: #1f2937;
                }

                .symbol-picker-search {
                    padding: 1.5rem;
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: 1rem;
                    border-bottom: 2px solid #e5e7eb;
                    background: #f9fafb;
                }

                .symbol-picker-search input {
                    padding: 1rem 1.25rem;
                    border: 2px solid #d1d5db;
                    border-radius: 10px;
                    font-size: 1.05rem;
                    font-weight: 500;
                    transition: all 0.2s;
                    background: white;
                    color: #1f2937;
                    width: 100%;
                }

                .symbol-picker-search input::placeholder {
                    color: #6b7280;
                    font-weight: 400;
                }

                .symbol-picker-search input:focus {
                    outline: none;
                    border-color: #006D3B;
                    box-shadow: 0 0 0 4px rgba(0, 109, 59, 0.15);
                    background: #ffffff;
                }

                .symbol-picker-search select {
                    padding: 1rem 1.25rem;
                    padding-right: 2.5rem;
                    border: 2px solid #d1d5db;
                    border-radius: 10px;
                    font-size: 1.05rem;
                    font-weight: 500;
                    background: white;
                    cursor: pointer;
                    width: 220px;
                    color: #1f2937;
                    appearance: none;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23333' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 1rem center;
                }

                .symbol-picker-search select:focus {
                    outline: none;
                    border-color: #006D3B;
                    box-shadow: 0 0 0 4px rgba(0, 109, 59, 0.15);
                }

                @media (max-width: 768px) {
                    .symbol-picker-search {
                        grid-template-columns: 1fr;
                    }
                    
                    .symbol-picker-search select {
                        width: 100%;
                    }
                }

                .symbol-picker-loading {
                    padding: 3rem;
                    text-align: center;
                    color: #6b7280;
                }

                .symbol-picker-spinner {
                    border: 3px solid #f3f4f6;
                    border-top-color: #667eea;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 1rem;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .symbol-picker-grid {
                    padding: 1.5rem;
                    overflow-y: auto;
                    flex: 1;
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                    gap: 1rem;
                    max-height: 50vh;
                }

                .symbol-picker-item {
                    border: 2px solid #e5e7eb;
                    border-radius: 10px;
                    padding: 1rem;
                    text-align: center;
                    cursor: pointer;
                    transition: all 0.2s;
                    background: white;
                }

                .symbol-picker-item:hover {
                    border-color: #667eea;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
                    transform: translateY(-2px);
                }

                .symbol-picker-item.selected {
                    border-color: #667eea;
                    background: #ede9fe;
                    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
                }

                .symbol-picker-item img {
                    width: 80px;
                    height: 80px;
                    object-fit: contain;
                    margin-bottom: 0.5rem;
                }

                .symbol-picker-item-name {
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: #1f2937;
                    margin-bottom: 0.25rem;
                    word-break: break-word;
                }

                .symbol-picker-item-category {
                    font-size: 0.75rem;
                    color: #6b7280;
                    text-transform: capitalize;
                }

                .symbol-picker-empty {
                    padding: 3rem;
                    text-align: center;
                    color: #9ca3af;
                }

                .empty-icon {
                    font-size: 3rem;
                    margin-bottom: 1rem;
                }

                .symbol-picker-footer {
                    padding: 1rem 1.5rem;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    gap: 1rem;
                    justify-content: flex-end;
                }

                .symbol-picker-footer button {
                    padding: 0.75rem 1.5rem;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.95rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .btn-cancel {
                    background: #f3f4f6;
                    color: #374151;
                }

                .btn-cancel:hover {
                    background: #e5e7eb;
                }

                .btn-select {
                    background: #667eea;
                    color: white;
                }

                .btn-select:hover:not(:disabled) {
                    background: #5568d3;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                }

                .btn-select:disabled {
                    background: #d1d5db;
                    cursor: not-allowed;
                }

                @media (max-width: 768px) {
                    .symbol-picker-content {
                        width: 95%;
                        max-height: 90vh;
                    }

                    .symbol-picker-search {
                        flex-direction: column;
                    }

                    .symbol-picker-search select {
                        width: 100%;
                    }

                    .symbol-picker-grid {
                        grid-template-columns: repeat(2, 1fr);
                        gap: 0.75rem;
                        padding: 1rem;
                    }

                    .symbol-picker-item img {
                        width: 60px;
                        height: 60px;
                    }
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    }

    async loadSymbols() {
        const loading = document.getElementById('symbolPickerLoading');
        const grid = document.getElementById('symbolPickerGrid');
        const empty = document.getElementById('symbolPickerEmpty');

        loading.style.display = 'block';
        grid.style.display = 'none';
        empty.style.display = 'none';

        try {
            // Fetch only active symbols using public endpoint
            const response = await fetch('/api/symbols', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load symbols');
            }

            const data = await response.json();
            this.symbols = data.symbols;
            
            loading.style.display = 'none';
            this.renderSymbols(this.symbols);

        } catch (error) {
            console.error('Error loading symbols:', error);
            loading.style.display = 'none';
            empty.style.display = 'block';
            document.querySelector('.symbol-picker-empty p').textContent = 'Failed to load symbols';
        }
    }

    renderSymbols(symbols) {
        const grid = document.getElementById('symbolPickerGrid');
        const empty = document.getElementById('symbolPickerEmpty');

        if (symbols.length === 0) {
            grid.style.display = 'none';
            empty.style.display = 'block';
            return;
        }

        grid.style.display = 'grid';
        empty.style.display = 'none';

        grid.innerHTML = symbols.map(symbol => `
            <div class="symbol-picker-item" data-symbol-id="${symbol._id}" onclick="symbolPicker.selectSymbol('${symbol._id}')">
                <img src="${symbol.imageUrl}" alt="${symbol.nameMalayalam || symbol.name}">
                ${symbol.nameMalayalam ? `<div class="symbol-picker-item-name">${symbol.nameMalayalam}</div>` : `<div class="symbol-picker-item-name">${symbol.name}</div>`}
                <div class="symbol-picker-item-category">${symbol.name}${symbol.category ? ` • ${symbol.category.replace('-', ' ')}` : ''}</div>
            </div>
        `).join('');
    }

    filterSymbols() {
        const searchValue = document.getElementById('symbolPickerSearch').value.toLowerCase();
        const categoryValue = document.getElementById('symbolPickerCategory').value;

        const filtered = this.symbols.filter(symbol => {
            const matchesSearch = symbol.name.toLowerCase().includes(searchValue) || 
                                  (symbol.nameMalayalam && symbol.nameMalayalam.includes(searchValue));
            const matchesCategory = !categoryValue || symbol.category === categoryValue;
            return matchesSearch && matchesCategory;
        });

        this.renderSymbols(filtered);
    }

    selectSymbol(symbolId) {
        // Remove previous selection
        document.querySelectorAll('.symbol-picker-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Add selection to clicked item
        const item = document.querySelector(`[data-symbol-id="${symbolId}"]`);
        if (item) {
            item.classList.add('selected');
        }

        // Store selected symbol
        this.selectedSymbol = this.symbols.find(s => s._id === symbolId);

        // Enable confirm button
        document.getElementById('symbolPickerConfirm').disabled = false;
    }

    confirmSelection() {
        if (!this.selectedSymbol) {
            return;
        }

        // Call the callback with selected symbol
        this.onSelect(this.selectedSymbol);

        // Close modal
        this.close();
    }

    open() {
        const modal = document.getElementById(this.modalId);
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Reset state
        this.selectedSymbol = null;
        document.getElementById('symbolPickerConfirm').disabled = true;
        document.getElementById('symbolPickerSearch').value = '';
        document.getElementById('symbolPickerCategory').value = '';
        
        // Reload symbols
        this.loadSymbols();
    }

    close() {
        const modal = document.getElementById(this.modalId);
        modal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Clear selection
        document.querySelectorAll('.symbol-picker-item').forEach(item => {
            item.classList.remove('selected');
        });
    }
}

// Global instance (will be initialized in the page that uses it)
let symbolPicker = null;

// Initialize function to be called from pages
function initSymbolPicker(callback) {
    if (!symbolPicker) {
        symbolPicker = new SymbolPicker({
            onSelect: callback
        });
    }
    return symbolPicker;
}
