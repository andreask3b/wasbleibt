/**
 * Form Manager - Core calculation and rendering
 * Delegates to UIState, ChildrenManager, URLHandler for specific functionality
 */

const FormManager = {
    /**
     * Initialize form and all modules
     */
    init() {
        // Initialize UI event listeners via UIState
        document.querySelectorAll('.status-card').forEach(card => {
            card.addEventListener('click', () => {
                UIState.handleStatusToggle(card.dataset.status);
            });
        });

        // Period toggle
        document.querySelectorAll('[name="period"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                UIState.handlePeriodToggle(e.target.value);
            });
        });

        // Child counter buttons (+/-)
        document.getElementById('addChildBtnTop')?.addEventListener('click', () => {
            ChildrenManager.addChild();
            ChildrenManager.updateChildCount();
            this.calculate();
        });
        document.getElementById('removeChildBtn')?.addEventListener('click', () => {
            ChildrenManager.removeLastChild();
            ChildrenManager.updateChildCount();
            this.calculate();
        });

        // Bind Sliders to Number inputs and vice versa
        const bindSlider = (sliderId, inputId) => {
            const slider = document.getElementById(sliderId);
            const input = document.getElementById(inputId);
            if (slider && input) {
                // Update input when slider moves
                slider.addEventListener('input', (e) => {
                    input.value = e.target.value;
                    this.calculate();
                });
                // Update slider when input changes
                input.addEventListener('input', (e) => {
                    slider.value = e.target.value;
                    this.calculate();
                });
            }
        };

        bindSlider('grossIncomeSlider', 'grossIncome');
        bindSlider('partnerIncomeSlider', 'partnerIncome');
        bindSlider('housingCostSlider', 'housingCost');
        bindSlider('apartmentSizeSlider', 'apartmentSize');

        // Form inputs - trigger calculation on change
        document.querySelectorAll('input[type="number"], select').forEach(input => {
            input.addEventListener('change', () => this.calculate());
            input.addEventListener('input', () => this.calculate());
        });

        // Housing type changes
        document.getElementById('housingType')?.addEventListener('change', (e) => {
            UIState.updateHousingLabel(e.target.value);
            this.calculate();
        });

        // Share button
        document.getElementById('shareBtn')?.addEventListener('click', () => {
            URLHandler.shareResults();
        });

        // Initialize sticky bar
        UIState.initStickyBar();

        // Load from URL parameters (if any)
        URLHandler.loadFromURL();

        // Initial calculation
        this.calculate();
    },

    /**
     * Get current form values
     */
    getFormData() {
        const grossInput = document.getElementById('grossIncome');
        const partnerInput = document.getElementById('partnerIncome');
        const isYearly = grossInput?.dataset.period === 'yearly';

        let monthlyGross = parseFloat(grossInput?.value) || 0;
        let partnerIncome = parseFloat(partnerInput?.value) || 0;

        if (isYearly) {
            monthlyGross = monthlyGross / 14;
            partnerIncome = partnerIncome / 14;
        }

        return {
            monthlyGross: monthlyGross,
            familyStatus: document.getElementById('familyStatus')?.value || 'single',
            partnerIncome: partnerIncome,
            childrenAges: ChildrenManager.getChildrenAges(),
            children: ChildrenManager.getChildren(),
            housingType: document.getElementById('housingType')?.value || 'rent',
            monthlyRent: parseFloat(document.getElementById('housingCost')?.value) || 0,
            apartmentSize: parseFloat(document.getElementById('apartmentSize')?.value) || 60,
            federalState: document.getElementById('federalState')?.value || 'vienna',
            wiedereinsteiger: document.getElementById('wiedereinsteiger')?.checked || false
        };
    },

    /**
     * Perform calculation and update results
     */
    calculate() {
        const formData = this.getFormData();

        // Calculate net income for primary earner
        const taxResult = TaxCalculator.calculateMonthlyNet(formData.monthlyGross);

        // Calculate net income for partner (if applicable)
        let partnerTaxResult = null;
        let combinedMonthlyNet = taxResult.net;

        if (formData.familyStatus === 'married' && formData.partnerIncome > 0) {
            partnerTaxResult = TaxCalculator.calculateMonthlyNet(formData.partnerIncome);
            combinedMonthlyNet = taxResult.net + partnerTaxResult.net;
        }

        // Calculate all benefits
        const benefits = BenefitsCalculator.calculateAllBenefits({
            ...formData,
            monthlyNet: taxResult.net,
            partnerNetIncome: partnerTaxResult ? partnerTaxResult.net : 0,
            combinedMonthlyNet: combinedMonthlyNet,
            annualTax: taxResult.annualTax
        });

        // Update summary cards
        document.getElementById('totalHousehold').textContent =
            this.formatCurrency(benefits.totalHouseholdIncome);
        document.getElementById('netIncome').textContent =
            this.formatCurrency(benefits.trueNetIncome);
        document.getElementById('totalBenefits').textContent =
            this.formatCurrency(benefits.totalMonthlyBenefits);

        // Update breakdown table
        this.renderBreakdown(formData, taxResult, benefits, partnerTaxResult);

        // Update chart
        ChartManager.createChart('incomeChart', formData, formData.monthlyGross);

        // Update recommendations
        RecommendationsManager.generateRecommendations(formData, taxResult, benefits);

        // Update sticky bar
        UIState.updateStickyBar(benefits.totalHouseholdIncome, benefits.trueNetIncome, benefits.totalMonthlyBenefits);
    },

    /**
     * Render detailed breakdown table
     */
    renderBreakdown(formData, taxResult, benefits, partnerTaxResult = null) {
        const container = document.getElementById('breakdownTable');
        if (!container) return;

        const hasPartner = partnerTaxResult && formData.partnerIncome > 0;
        const rows = [];

        // Primary earner income
        rows.push({
            label: hasPartner ? 'Bruttoeinkommen (Person 1)' : 'Bruttoeinkommen',
            value: formData.monthlyGross,
            color: '#1d9bf0'
        });
        rows.push({
            label: hasPartner ? 'Sozialversicherung (Person 1)' : 'Sozialversicherung',
            value: -taxResult.socialSecurity.total,
            color: '#dc2626',
            negative: true
        });
        rows.push({
            label: hasPartner ? 'Lohnsteuer (Person 1)' : 'Lohnsteuer',
            value: -taxResult.monthlyTax,
            color: '#dc2626',
            negative: true
        });

        // Partner income (if applicable)
        if (hasPartner) {
            rows.push({
                label: 'Bruttoeinkommen (Partner:in)',
                value: formData.partnerIncome,
                color: '#1d9bf0'
            });
            rows.push({
                label: 'Sozialversicherung (Partner:in)',
                value: -partnerTaxResult.socialSecurity.total,
                color: '#dc2626',
                negative: true
            });
            rows.push({
                label: 'Lohnsteuer (Partner:in)',
                value: -partnerTaxResult.monthlyTax,
                color: '#dc2626',
                negative: true
            });
        }

        // Tax credits
        if (benefits.familienbonus.usedBonus > 0) {
            rows.push({
                label: 'Familienbonus Plus (Steuerersparnis)',
                value: benefits.familienbonus.usedBonus / 12,
                color: '#00a67e',
                isCredit: true
            });
        }

        // Net income subtotal (includes applied tax credits)
        rows.push({
            label: hasPartner ? 'Haushaltsnetto (beide)' : 'Nettoeinkommen',
            value: benefits.trueNetIncome,
            color: '#2e7d32',
            isSubtotal: true
        });

        // Benefits
        if (benefits.familienbeihilfe.total > 0) {
            rows.push({
                label: `Familienbeihilfe (${benefits.familienbeihilfe.numChildren} Kind${benefits.familienbeihilfe.numChildren > 1 ? 'er' : ''})`,
                value: benefits.familienbeihilfe.total,
                color: '#1565c0'
            });
        }

        if (benefits.wohnbeihilfe.amount > 0) {
            const stateNames = {
                'vienna': 'Wien', 'steiermark': 'Steiermark', 'upperAustria': 'Oberösterreich',
                'lowerAustria': 'Niederösterreich', 'salzburg': 'Salzburg', 'tyrol': 'Tirol',
                'vorarlberg': 'Vorarlberg', 'carinthia': 'Kärnten', 'burgenland': 'Burgenland'
            };
            const stateName = stateNames[formData.federalState] || formData.federalState;
            const wbLabel = formData.federalState === 'steiermark' ? 'Wohnunterstützung' : 'Wohnbeihilfe';
            rows.push({
                label: `${wbLabel} (${stateName})`,
                value: benefits.wohnbeihilfe.amount,
                color: '#f9a825'
            });
        }

        if (benefits.familienbonus.monthlyKindermehrbetrag > 0) {
            rows.push({
                label: 'Kindermehrbetrag',
                value: benefits.familienbonus.monthlyKindermehrbetrag,
                color: '#6a1b9a'
            });
        }

        if (benefits.sozialhilfe.amount > 0) {
            rows.push({
                label: 'Sozialhilfe/Mindestsicherung',
                value: benefits.sozialhilfe.amount,
                color: '#c62828'
            });
        }

        // Childcare costs (negative)
        if (benefits.childcareCosts && benefits.childcareCosts.total > 0) {
            rows.push({
                label: `Kinderbetreuung (${benefits.childcareCosts.breakdown.length} Kind${benefits.childcareCosts.breakdown.length > 1 ? 'er' : ''})`,
                value: -benefits.childcareCosts.total,
                color: '#ff6f00',
                negative: true
            });
        }

        // Total
        // Total Household Income
        rows.push({
            label: 'Haushaltskasse gesamt',
            value: benefits.totalHouseholdIncome,
            color: '#1d9bf0',
            isTotal: true
        });

        // Housing Costs
        if (benefits.housingCost > 0) {
            rows.push({
                label: 'Wohnkosten (Miete/Kredit)',
                value: -benefits.housingCost,
                color: '#ef4444',
                negative: true
            });
        }

        // Disposable Income ("Was bleibt")
        rows.push({
            label: 'Was bleibt (frei verfügbar)',
            value: benefits.disposableIncome,
            color: '#15803d',
            isTotal: true,
            highlight: true
        });

        container.innerHTML = rows.map(row => `
            <div class="breakdown-row ${row.negative ? 'negative' : ''} ${row.isTotal ? 'total' : ''}" 
                 style="--row-color: ${row.color}">
                <span class="row-label">
                    <span class="row-icon" style="background: ${row.color}"></span>
                    ${row.label}
                </span>
                <span class="row-value">
                    ${this.formatCurrency(row.value)}
                </span>
            </div>
        `).join('');
    },

    /**
     * Format number as currency
     */
    formatCurrency(value) {
        return new Intl.NumberFormat('de-AT', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(Math.round(value));
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FormManager;
}
