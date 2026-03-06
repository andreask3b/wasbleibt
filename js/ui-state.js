const UIState = {
    defaults: {
        single: {
            rent: 700,
            apartmentSize: 60
        },
        singleParent: {
            rent: 850,
            apartmentSize: 70
        },
        married: {
            partnerIncome: 1800,
            rent: 900,
            apartmentSize: 75
        }
    },

    _savedPartnerIncome: null,

    handleStatusToggle(status, options = {}) {
        const { skipCalculation = false } = options;
        document.getElementById('familyStatus').value = status;

        document.querySelectorAll('.household-option').forEach(button => {
            button.classList.toggle('active', button.dataset.status === status);
        });

        document.querySelectorAll('.status-card').forEach(card => {
            card.classList.toggle('active', card.dataset.status === status);
        });

        const income2Group = document.getElementById('income2Group');
        const partnerIncomeInput = document.getElementById('partnerIncome');
        const partnerSlider = document.getElementById('partnerIncomeSlider');
        const housingCostInput = document.getElementById('housingCost');
        const housingCostSlider = document.getElementById('housingCostSlider');
        const apartmentSizeInput = document.getElementById('apartmentSize');
        const apartmentSizeSlider = document.getElementById('apartmentSizeSlider');

        if (status === 'married') {
            if (income2Group) income2Group.style.display = 'block';

            const restoreValue = this._savedPartnerIncome !== null
                ? this._savedPartnerIncome
                : this.defaults.married.partnerIncome;

            if (partnerIncomeInput && (!parseFloat(partnerIncomeInput.value) || parseFloat(partnerIncomeInput.value) === 0)) {
                partnerIncomeInput.value = restoreValue;
            }
            if (partnerSlider && (!parseFloat(partnerSlider.value) || parseFloat(partnerSlider.value) === 0)) {
                partnerSlider.value = restoreValue;
            }

            if (housingCostInput && [this.defaults.single.rent, this.defaults.singleParent.rent].includes(parseFloat(housingCostInput.value))) {
                housingCostInput.value = this.defaults.married.rent;
                if (housingCostSlider) housingCostSlider.value = this.defaults.married.rent;
            }

            if (apartmentSizeInput && [this.defaults.single.apartmentSize, this.defaults.singleParent.apartmentSize].includes(parseFloat(apartmentSizeInput.value))) {
                apartmentSizeInput.value = this.defaults.married.apartmentSize;
                if (apartmentSizeSlider) apartmentSizeSlider.value = this.defaults.married.apartmentSize;
            }
        } else {
            const currentPartnerIncome = parseFloat(partnerIncomeInput?.value) || 0;
            if (currentPartnerIncome > 0) {
                this._savedPartnerIncome = currentPartnerIncome;
            }

            if (income2Group) income2Group.style.display = 'none';
            if (partnerIncomeInput) partnerIncomeInput.value = 0;
            if (partnerSlider) partnerSlider.value = 0;

            const defaults = this.defaults[status] || this.defaults.single;
            const currentRent = parseFloat(housingCostInput?.value) || 0;
            const currentSize = parseFloat(apartmentSizeInput?.value) || 0;

            if (housingCostInput && [this.defaults.single.rent, this.defaults.singleParent.rent, this.defaults.married.rent].includes(currentRent)) {
                housingCostInput.value = defaults.rent;
                if (housingCostSlider) housingCostSlider.value = defaults.rent;
            }

            if (apartmentSizeInput && [this.defaults.single.apartmentSize, this.defaults.singleParent.apartmentSize, this.defaults.married.apartmentSize].includes(currentSize)) {
                apartmentSizeInput.value = defaults.apartmentSize;
                if (apartmentSizeSlider) apartmentSizeSlider.value = defaults.apartmentSize;
            }
        }

        this.syncIncomeModeUI();

        if (!skipCalculation && typeof FormManager !== 'undefined') {
            FormManager.calculate();
        }
    },

    handleIncomeModeToggle(mode, options = {}) {
        const { skipCalculation = false } = options;

        document.querySelectorAll('[name="incomeMode"]').forEach(radio => {
            radio.checked = radio.value === mode;
        });

        this.syncIncomeModeUI();

        if (typeof FormManager !== 'undefined') {
            FormManager.syncDerivedIncomeHint();
        }

        if (!skipCalculation && typeof FormManager !== 'undefined') {
            FormManager.calculate();
        }
    },

    syncIncomeModeUI() {
        const mode = document.querySelector('[name="incomeMode"]:checked')?.value || 'salary';
        const familyStatus = document.getElementById('familyStatus')?.value || 'single';
        const income1Group = document.getElementById('income1Group');
        const hoursIncomeGroup = document.getElementById('hoursIncomeGroup');
        const periodToggleGroup = document.getElementById('periodToggleGroup');
        const incomeLabel2 = document.getElementById('incomeLabel2');
        const incomePeriod = document.querySelector('[name="incomePeriod"]:checked')?.value || 'monthly';
        const isYearly = incomePeriod === 'yearly';

        if (income1Group) income1Group.style.display = mode === 'salary' ? 'block' : 'none';
        if (hoursIncomeGroup) hoursIncomeGroup.style.display = mode === 'hours' ? 'block' : 'none';

        if (periodToggleGroup) {
            periodToggleGroup.style.display = mode === 'salary' || familyStatus === 'married' ? '' : 'none';
        }

        if (mode === 'hours' && incomeLabel2) {
            incomeLabel2.innerHTML = `Partner:in verdient brutto <span id="periodLabel2">${isYearly ? 'jährlich' : 'monatlich'}</span>`;
        }
    },

    handlePeriodToggle(period) {
        const isYearly = period === 'yearly';
        const periodText = isYearly ? 'jährlich' : 'monatlich';
        const suffix = isYearly ? '€/Jahr' : '€/Monat';

        document.querySelectorAll('[name="incomePeriod"]').forEach(radio => {
            radio.checked = radio.value === period;
        });

        const income1 = document.getElementById('grossIncome');
        const income2 = document.getElementById('partnerIncome');
        const wasYearly = income1?.dataset.period === 'yearly';

        document.getElementById('periodLabel1').textContent = periodText;
        document.getElementById('periodLabel2').textContent = periodText;
        document.getElementById('incomeSuffix1').textContent = suffix;
        document.getElementById('incomeSuffix2').textContent = suffix;

        if (income1 && income2 && wasYearly !== isYearly) {
            if (isYearly) {
                income1.value = Math.round((parseFloat(income1.value) || 0) * 14);
                income2.value = Math.round((parseFloat(income2.value) || 0) * 14);
            } else {
                income1.value = Math.round((parseFloat(income1.value) || 0) / 14);
                income2.value = Math.round((parseFloat(income2.value) || 0) / 14);
            }
        }

        if (income1) income1.dataset.period = period;
        if (income2) income2.dataset.period = period;

        this.syncIncomeModeUI();

        if (typeof FormManager !== 'undefined') {
            FormManager.calculate();
        }
    },

    initStickyBar() {
        const stickyBar = document.getElementById('stickyResultBar');
        const inputSection = document.querySelector('.input-section');
        const header = document.querySelector('.header');

        if (!stickyBar || !inputSection) return;

        let hasInteracted = false;

        const showStickyBar = () => {
            hasInteracted = true;
            const headerBottom = header ? header.getBoundingClientRect().bottom : -1;
            if (headerBottom < 0) {
                stickyBar.classList.add('visible');
            }
        };

        inputSection.addEventListener('click', showStickyBar);
        inputSection.addEventListener('focusin', showStickyBar);

        window.addEventListener('scroll', () => {
            if (!hasInteracted) return;

            const headerBottom = header ? header.getBoundingClientRect().bottom : -1;
            if (headerBottom > 0) {
                stickyBar.classList.remove('visible');
            } else {
                stickyBar.classList.add('visible');
            }
        });
    },

    updateStickyBar(disposableIncome, totalHousehold, benefits) {
        const formatCurrency = value => {
            return new Intl.NumberFormat('de-AT', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(value);
        };

        document.getElementById('stickyDisposable').textContent = formatCurrency(disposableIncome);
        document.getElementById('stickyTotal').textContent = formatCurrency(totalHousehold);
        document.getElementById('stickyBenefits').textContent = '+' + formatCurrency(benefits);
    },

    updateHousingLabel(type) {
        const labelSpan = document.getElementById('housingCostLabel');
        const hint = document.querySelector('#housingCostGroup .input-hint');

        const config = {
            rent: { label: 'Miete', hint: 'Hauptmietzins ohne Betriebskosten' },
            owned: { label: 'Wohnnebenkosten', hint: 'Monatliche Betriebskosten (ohne Kredit)' },
            loan: { label: 'Kreditrate + Nebenkosten', hint: 'Monatliche Kreditrate inkl. Betriebskosten' }
        };

        const cfg = config[type] || config.rent;
        if (labelSpan) labelSpan.textContent = cfg.label;
        if (hint) hint.textContent = cfg.hint;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIState;
}
