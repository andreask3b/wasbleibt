const FormManager = {
    HOURS_PER_YEAR_FACTOR: 52 / 14,

    init() {
        document.querySelectorAll('.household-option').forEach(button => {
            button.addEventListener('click', () => {
                UIState.handleStatusToggle(button.dataset.status);
            });
        });

        document.querySelectorAll('.status-card').forEach(card => {
            card.addEventListener('click', () => {
                UIState.handleStatusToggle(card.dataset.status);
            });
        });

        document.querySelectorAll('[name="incomeMode"]').forEach(radio => {
            radio.addEventListener('change', event => {
                UIState.handleIncomeModeToggle(event.target.value);
            });
        });

        document.querySelectorAll('[name="incomePeriod"]').forEach(radio => {
            radio.addEventListener('change', event => {
                UIState.handlePeriodToggle(event.target.value);
            });
        });

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

        document.querySelectorAll('.preset-btn').forEach(button => {
            button.addEventListener('click', () => {
                this.applyPreset(button.dataset.preset);
            });
        });

        this.bindSlider('grossIncomeSlider', 'grossIncome');
        this.bindSlider('partnerIncomeSlider', 'partnerIncome');
        this.bindSlider('housingCostSlider', 'housingCost');
        this.bindSlider('apartmentSizeSlider', 'apartmentSize');
        this.bindSlider('hourlyWageSlider', 'hourlyWage');
        this.bindSlider('weeklyHoursSlider', 'weeklyHours');

        document.querySelectorAll('input[type="number"], select, input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', () => this.calculate());
            input.addEventListener('input', () => this.calculate());
        });

        document.getElementById('housingType')?.addEventListener('change', event => {
            UIState.updateHousingLabel(event.target.value);
            this.calculate();
        });

        document.getElementById('shareBtn')?.addEventListener('click', () => {
            URLHandler.shareResults();
        });

        UIState.initStickyBar();
        UIState.handleStatusToggle(document.getElementById('familyStatus')?.value || 'single', { skipCalculation: true });
        UIState.handleIncomeModeToggle(document.querySelector('[name="incomeMode"]:checked')?.value || 'salary', { skipCalculation: true });
        this.syncDerivedIncomeHint();

        URLHandler.loadFromURL();
        this.calculate();
    },

    bindSlider(sliderId, inputId) {
        const slider = document.getElementById(sliderId);
        const input = document.getElementById(inputId);
        if (!slider || !input) return;

        slider.addEventListener('input', event => {
            input.value = event.target.value;
            this.calculate();
        });

        input.addEventListener('input', event => {
            slider.value = event.target.value;
            this.calculate();
        });
    },

    getSelectedValue(name, fallback) {
        return document.querySelector(`[name="${name}"]:checked`)?.value || fallback;
    },

    calculateHourlyIncome(hourlyWage, weeklyHours) {
        const annualGross = (hourlyWage || 0) * (weeklyHours || 0) * 52;
        const monthlyGross14 = annualGross / 14;
        const monthlyAverage12 = annualGross / 12;

        return {
            annualGross,
            monthlyGross14,
            monthlyAverage12
        };
    },

    syncDerivedIncomeHint() {
        const hourlyWage = parseFloat(document.getElementById('hourlyWage')?.value) || 0;
        const weeklyHours = parseFloat(document.getElementById('weeklyHours')?.value) || 0;
        const hint = document.getElementById('derivedIncomeHint');
        if (!hint) return;

        const derived = this.calculateHourlyIncome(hourlyWage, weeklyHours);
        const gross14 = this.formatCurrency(derived.monthlyGross14);
        const gross12 = this.formatCurrency(derived.monthlyAverage12);

        hint.textContent = `Entspricht rund ${gross14} brutto je Zahlung bei 14 Gehältern/Jahr (${gross12} Monatsdurchschnitt auf 12 Monate).`;
    },

    getFormData() {
        const incomeMode = this.getSelectedValue('incomeMode', 'salary');
        const incomePeriod = this.getSelectedValue('incomePeriod', 'monthly');
        const isYearly = incomePeriod === 'yearly';

        let monthlyGross = parseFloat(document.getElementById('grossIncome')?.value) || 0;
        const partnerInputValue = parseFloat(document.getElementById('partnerIncome')?.value) || 0;
        let partnerIncome = isYearly ? partnerInputValue / 14 : partnerInputValue;

        const hourlyWage = parseFloat(document.getElementById('hourlyWage')?.value) || 0;
        const weeklyHours = parseFloat(document.getElementById('weeklyHours')?.value) || 0;
        const derivedIncome = this.calculateHourlyIncome(hourlyWage, weeklyHours);

        if (incomeMode === 'salary' && isYearly) {
            monthlyGross = monthlyGross / 14;
        }

        if (incomeMode === 'hours') {
            monthlyGross = derivedIncome.monthlyGross14;
        }

        return {
            incomeMode,
            incomePeriod,
            monthlyGross,
            hourlyWage,
            weeklyHours,
            derivedMonthlyGross: derivedIncome.monthlyGross14,
            derivedMonthlyAverage: derivedIncome.monthlyAverage12,
            familyStatus: document.getElementById('familyStatus')?.value || 'single',
            partnerIncome,
            childrenAges: ChildrenManager.getChildrenAges(),
            children: ChildrenManager.getChildren(),
            housingType: document.getElementById('housingType')?.value || 'rent',
            monthlyRent: parseFloat(document.getElementById('housingCost')?.value) || 0,
            apartmentSize: parseFloat(document.getElementById('apartmentSize')?.value) || 60,
            federalState: document.getElementById('federalState')?.value || 'vienna',
            wiedereinsteiger: document.getElementById('wiedereinsteiger')?.checked || false
        };
    },

    calculate() {
        this.syncDerivedIncomeHint();

        const formData = this.getFormData();
        if (formData.incomeMode === 'hours') {
            this.setInputValue('grossIncome', Math.round(formData.monthlyGross));
            this.setInputValue('grossIncomeSlider', Math.round(formData.monthlyGross));
        }
        const taxResult = TaxCalculator.calculateMonthlyNet(formData.monthlyGross);

        let partnerTaxResult = null;
        let combinedMonthlyNet = taxResult.net;

        if (formData.familyStatus === 'married' && formData.partnerIncome > 0) {
            partnerTaxResult = TaxCalculator.calculateMonthlyNet(formData.partnerIncome);
            combinedMonthlyNet = taxResult.net + partnerTaxResult.net;
        }

        const benefits = BenefitsCalculator.calculateAllBenefits({
            ...formData,
            monthlyNet: taxResult.net,
            partnerNetIncome: partnerTaxResult ? partnerTaxResult.net : 0,
            combinedMonthlyNet,
            annualTax: taxResult.annualTax
        });

        document.getElementById('disposableIncome').textContent = this.formatCurrency(benefits.disposableIncome);
        document.getElementById('totalHousehold').textContent = this.formatCurrency(benefits.totalHouseholdIncome);
        document.getElementById('netIncome').textContent = this.formatCurrency(benefits.trueNetIncome);
        document.getElementById('totalBenefits').textContent = this.formatCurrency(benefits.totalMonthlyBenefits);

        this.renderBreakdown(formData, taxResult, benefits, partnerTaxResult);
        ChartManager.createChart('incomeChart', formData, formData.monthlyGross);
        RecommendationsManager.generateRecommendations(formData, taxResult, benefits);
        UIState.updateStickyBar(benefits.disposableIncome, benefits.totalHouseholdIncome, benefits.totalMonthlyBenefits);
    },

    renderBreakdown(formData, taxResult, benefits, partnerTaxResult = null) {
        const container = document.getElementById('breakdownTable');
        if (!container) return;

        const CLR = {
            brutto: '#1a4480',
            netto: '#1d9bf0',
            steuern: '#dc2626',
            steuerentlastung: '#60b4f8',
            familienbeihilfe: '#4f46e5',
            sozialhilfe: '#ef4444',
            wohnbeihilfe: '#f59e0b',
            kinderbetreuung: '#f97316',
            wohnkosten: '#f87171',
            wasBleibt: '#16a34a'
        };

        const hasPartner = !!partnerTaxResult && formData.partnerIncome > 0;
        const rows = [];

        if (formData.incomeMode === 'hours') {
            rows.push({
                label: `Arbeitszeit (${formData.hourlyWage.toFixed(1)} €/Stunde, ${Math.round(formData.weeklyHours)} Std./Woche)`,
                value: formData.monthlyGross,
                color: CLR.brutto,
                info: 'umgerechnet auf 14 Gehälter'
            });
        }

        rows.push({
            label: hasPartner ? 'Bruttoeinkommen (Person 1)' : 'Bruttoeinkommen',
            value: formData.monthlyGross,
            color: CLR.brutto
        });
        rows.push({
            label: hasPartner ? 'Sozialversicherung (Person 1)' : 'Sozialversicherung',
            value: -taxResult.socialSecurity.total,
            color: CLR.steuern,
            negative: true
        });
        rows.push({
            label: hasPartner ? 'Lohnsteuer (Person 1)' : 'Lohnsteuer',
            value: -taxResult.monthlyTax,
            color: CLR.steuern,
            negative: true
        });

        if (hasPartner) {
            rows.push({
                label: 'Bruttoeinkommen (Partner:in)',
                value: formData.partnerIncome,
                color: CLR.brutto
            });
            rows.push({
                label: 'Sozialversicherung (Partner:in)',
                value: -partnerTaxResult.socialSecurity.total,
                color: CLR.steuern,
                negative: true
            });
            rows.push({
                label: 'Lohnsteuer (Partner:in)',
                value: -partnerTaxResult.monthlyTax,
                color: CLR.steuern,
                negative: true
            });
        }

        if (benefits.avab.annualCredit > 0) {
            rows.push({
                label: benefits.avab.type || 'Alleinverdiener-/Alleinerzieherabsetzbetrag',
                value: benefits.avab.annualCredit / 12,
                color: CLR.steuerentlastung
            });
        }

        if (benefits.familienbonus.usedBonus > 0) {
            rows.push({
                label: 'Familienbonus Plus (genutzt)',
                value: benefits.familienbonus.usedBonus / 12,
                color: CLR.steuerentlastung
            });
        }

        rows.push({
            label: hasPartner ? 'Netto & Steuergutschriften (Haushalt)' : 'Netto & Steuergutschriften',
            value: benefits.trueNetIncome,
            color: CLR.netto,
            isSubtotal: true
        });

        if (benefits.familienbeihilfe.total > 0) {
            rows.push({
                label: `Familienbeihilfe (${benefits.familienbeihilfe.numChildren} Kind${benefits.familienbeihilfe.numChildren > 1 ? 'er' : ''})`,
                value: benefits.familienbeihilfe.total,
                color: CLR.familienbeihilfe
            });
        }

        if (benefits.familienbonus.monthlyKindermehrbetrag > 0) {
            rows.push({
                label: 'Kindermehrbetrag',
                value: benefits.familienbonus.monthlyKindermehrbetrag,
                color: CLR.familienbeihilfe
            });
        }

        if (benefits.sozialhilfe.amount > 0) {
            rows.push({
                label: 'Sozialhilfe/Mindestsicherung',
                value: benefits.sozialhilfe.amount,
                color: CLR.sozialhilfe
            });
        }

        if (benefits.wohnbeihilfe.amount > 0) {
            const stateNames = {
                vienna: 'Wien',
                steiermark: 'Steiermark',
                upperAustria: 'Oberösterreich',
                lowerAustria: 'Niederösterreich',
                salzburg: 'Salzburg',
                tyrol: 'Tirol',
                vorarlberg: 'Vorarlberg',
                carinthia: 'Kärnten',
                burgenland: 'Burgenland'
            };
            const label = formData.federalState === 'steiermark' ? 'Wohnunterstützung' : 'Wohnbeihilfe';
            rows.push({
                label: `${label} (${stateNames[formData.federalState] || formData.federalState})`,
                value: benefits.wohnbeihilfe.amount,
                color: CLR.wohnbeihilfe
            });
        }

        if (benefits.childcareCosts?.total > 0) {
            rows.push({
                label: `Kinderbetreuung (${benefits.childcareCosts.breakdown.length} Kind${benefits.childcareCosts.breakdown.length > 1 ? 'er' : ''})`,
                value: -benefits.childcareCosts.total,
                color: CLR.kinderbetreuung,
                negative: true
            });
        }

        rows.push({
            label: 'Haushaltskasse gesamt',
            value: benefits.totalHouseholdIncome,
            color: CLR.netto,
            isTotal: true
        });

        if (benefits.housingCost > 0) {
            rows.push({
                label: 'Wohnkosten (Miete/Kredit)',
                value: -benefits.housingCost,
                color: CLR.wohnkosten,
                negative: true
            });
        }

        rows.push({
            label: 'Was bleibt (frei verfügbar)',
            value: benefits.disposableIncome,
            color: CLR.wasBleibt,
            isTotal: true,
            highlight: true
        });

        container.innerHTML = rows.map(row => `
            <div class="breakdown-row ${row.negative ? 'negative' : ''} ${row.isTotal ? 'total' : ''}"
                 style="--row-color: ${row.color}">
                <span class="row-label">
                    <span class="row-icon" style="background: ${row.color}"></span>
                    ${row.label}${row.info ? ` <small>${row.info}</small>` : ''}
                </span>
                <span class="row-value">${this.formatCurrency(row.value)}</span>
            </div>
        `).join('');
    },

    applyPreset(presetId) {
        const preset = ScenarioPresets.getPreset(presetId);
        if (!preset) return;

        document.querySelectorAll('.preset-btn').forEach(button => {
            button.classList.toggle('active', button.dataset.preset === presetId);
        });

        const values = preset.values;
        const derivedPresetGross = values.incomeMode === 'hours'
            ? this.calculateHourlyIncome(values.hourlyWage || 0, values.weeklyHours || 0).monthlyGross14
            : (values.monthlyGross || 0);

        UIState.handleStatusToggle(values.familyStatus, { skipCalculation: true });
        this.setRadioValue('incomeMode', values.incomeMode || 'salary');
        UIState.handleIncomeModeToggle(values.incomeMode || 'salary', { skipCalculation: true });
        this.setRadioValue('incomePeriod', 'monthly');
        document.getElementById('grossIncome').dataset.period = 'monthly';
        document.getElementById('partnerIncome').dataset.period = 'monthly';
        document.getElementById('periodLabel1').textContent = 'monatlich';
        document.getElementById('periodLabel2').textContent = 'monatlich';
        document.getElementById('incomeSuffix1').textContent = '€/Monat';
        document.getElementById('incomeSuffix2').textContent = '€/Monat';

        this.setInputValue('grossIncome', Math.round(derivedPresetGross));
        this.setInputValue('grossIncomeSlider', Math.round(derivedPresetGross));
        this.setInputValue('hourlyWage', values.hourlyWage || 0);
        this.setInputValue('hourlyWageSlider', values.hourlyWage || 0);
        this.setInputValue('weeklyHours', values.weeklyHours || 0);
        this.setInputValue('weeklyHoursSlider', values.weeklyHours || 0);
        this.setInputValue('partnerIncome', values.partnerIncome || 0);
        this.setInputValue('partnerIncomeSlider', values.partnerIncome || 0);
        this.setInputValue('housingCost', values.monthlyRent || 0);
        this.setInputValue('housingCostSlider', values.monthlyRent || 0);
        this.setInputValue('apartmentSize', values.apartmentSize || 60);
        this.setInputValue('apartmentSizeSlider', values.apartmentSize || 60);

        const housingType = document.getElementById('housingType');
        if (housingType) housingType.value = values.housingType || 'rent';

        const federalState = document.getElementById('federalState');
        if (federalState) federalState.value = values.federalState || 'vienna';

        const wiedereinsteiger = document.getElementById('wiedereinsteiger');
        if (wiedereinsteiger) wiedereinsteiger.checked = !!values.wiedereinsteiger;

        UIState.updateHousingLabel(values.housingType || 'rent');
        ChildrenManager.setChildren(values.children || []);
        this.syncDerivedIncomeHint();
        this.calculate();
    },

    setRadioValue(name, value) {
        document.querySelectorAll(`[name="${name}"]`).forEach(radio => {
            radio.checked = radio.value === value;
        });
    },

    setInputValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        }
    },

    formatCurrency(value) {
        return new Intl.NumberFormat('de-AT', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(Math.round(value));
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FormManager;
}
