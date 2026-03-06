/**
 * Children Management Module
 * Handles adding, removing, and rendering children
 * Childcare: 3-state toggle — none / half-day / full-day
 */

const ChildrenManager = {
    children: [],

    /**
     * Add a child to the list
     * @param {number} age - Initial age
     */
    addChild(age = 5) {
        const id = Date.now();
        this.children.push({
            id,
            age,
            inChildcare: false,   // legacy compat
            fullDay: false,        // legacy compat
            careMode: 'none'       // 'none' | 'half' | 'full'
        });
        this.renderChildren();
    },

    /**
     * Replace all children with a new list
     * @param {Array<object|number>} children
     */
    setChildren(children = []) {
        this.children = children.map((child, index) => {
            const normalized = typeof child === 'number' ? { age: child } : child;
            const careMode = normalized.careMode || (normalized.inChildcare ? (normalized.fullDay ? 'full' : 'half') : 'none');
            return {
                id: Date.now() + index,
                age: normalized.age ?? 5,
                inChildcare: careMode !== 'none',
                fullDay: careMode === 'full',
                careMode
            };
        });
        this.renderChildren();
        this.updateChildCount();
        if (typeof FormManager !== 'undefined') FormManager.calculate();
    },

    /**
     * Remove a child by ID
     */
    removeChild(id) {
        this.children = this.children.filter(c => c.id !== id);
        this.renderChildren();
        this.updateChildCount();
        if (typeof FormManager !== 'undefined') FormManager.calculate();
    },

    /**
     * Remove the last child (for − button)
     */
    removeLastChild() {
        if (this.children.length > 0) {
            this.children.pop();
            this.renderChildren();
            if (typeof FormManager !== 'undefined') FormManager.calculate();
        }
    },

    /**
     * Update child count display and show/hide children section
     */
    updateChildCount() {
        const countEl = document.getElementById('childCount');
        const sectionEl = document.getElementById('childrenSection');

        if (countEl) countEl.textContent = this.children.length;
        if (sectionEl) sectionEl.style.display = this.children.length > 0 ? 'block' : 'none';
    },

    /**
     * Update child age
     */
    updateChildAge(id, age) {
        const child = this.children.find(c => c.id === id);
        if (child) {
            child.age = parseInt(age) || 0;
        }
    },

    /**
     * Set childcare mode: 'none' | 'half' | 'full'
     * Updates legacy inChildcare/fullDay flags for backward compat with benefits.js
     */
    setCareMode(id, mode) {
        const child = this.children.find(c => c.id === id);
        if (!child) return;
        child.careMode = mode;
        child.inChildcare = mode !== 'none';
        child.fullDay = mode === 'full';
        this.renderChildren();
        if (typeof FormManager !== 'undefined') FormManager.calculate();
    },

    /**
     * Legacy compat: updateChildcare(id, bool)
     */
    updateChildcare(id, inChildcare) {
        this.setCareMode(id, inChildcare ? 'half' : 'none');
    },

    /**
     * Legacy compat: updateChildcareType(id, bool)
     */
    updateChildcareType(id, fullDay) {
        const child = this.children.find(c => c.id === id);
        if (child && child.inChildcare) {
            this.setCareMode(id, fullDay ? 'full' : 'half');
        }
    },

    /**
     * Get all children ages
     */
    getChildrenAges() {
        return this.children.map(c => c.age);
    },

    /**
     * Get all children data (with legacy fields for benefits.js)
     */
    getChildren() {
        return this.children;
    },

    /**
     * Render children as compact inline chips
     */
    renderChildren() {
        const container = document.getElementById('childrenContainer');
        if (!container) return;

        const careModes = [
            { value: 'none', label: 'Keine', emoji: '🏠' },
            { value: 'half', label: 'Halbtags', emoji: '☀️' },
            { value: 'full', label: 'Ganztags', emoji: '🌟' }
        ];

        container.innerHTML = this.children.map((child, index) => `
            <div class="child-chip" data-id="${child.id}">
                <span class="child-chip-label">Kind ${index + 1}</span>
                <div class="child-chip-age">
                    <input
                        type="number"
                        min="0"
                        max="25"
                        value="${child.age}"
                        placeholder="5"
                        onchange="ChildrenManager.updateChildAge(${child.id}, this.value); FormManager.calculate();"
                        class="child-age-input"
                        title="Alter"
                    >
                    <span class="child-age-suffix">J</span>
                </div>
                <div class="care-toggle" role="group" aria-label="Kinderbetreuung">
                    ${careModes.map(m => `
                        <button
                            type="button"
                            class="care-btn${child.careMode === m.value ? ' active' : ''}"
                            onclick="ChildrenManager.setCareMode(${child.id}, '${m.value}')"
                            title="${m.label}"
                        >${m.emoji} <span class="care-btn-text">${m.label}</span></button>
                    `).join('')}
                </div>
                <button type="button" class="child-remove-btn" onclick="ChildrenManager.removeChild(${child.id})" title="Entfernen">×</button>
            </div>
        `).join('');
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChildrenManager;
}
