const URLHandler = {
    loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        if (params.toString() === '') return;

        if (params.has('status')) {
            UIState.handleStatusToggle(params.get('status'), { skipCalculation: true });
        }

        if (params.has('modus')) {
            UIState.handleIncomeModeToggle(params.get('modus'), { skipCalculation: true });
        }

        if (params.has('periode')) {
            UIState.handlePeriodToggle(params.get('periode'));
        }

        if (params.has('brutto')) {
            const grossInput = document.getElementById('grossIncome');
            if (grossInput) grossInput.value = params.get('brutto');
            const grossSlider = document.getElementById('grossIncomeSlider');
            if (grossSlider) grossSlider.value = params.get('brutto');
        }

        if (params.has('partner')) {
            const partnerInput = document.getElementById('partnerIncome');
            if (partnerInput) partnerInput.value = params.get('partner');
            const partnerSlider = document.getElementById('partnerIncomeSlider');
            if (partnerSlider) partnerSlider.value = params.get('partner');
        }

        if (params.has('stundenlohn')) {
            const hourlyInput = document.getElementById('hourlyWage');
            const hourlySlider = document.getElementById('hourlyWageSlider');
            if (hourlyInput) hourlyInput.value = params.get('stundenlohn');
            if (hourlySlider) hourlySlider.value = params.get('stundenlohn');
        }

        if (params.has('wochenstunden')) {
            const hoursInput = document.getElementById('weeklyHours');
            const hoursSlider = document.getElementById('weeklyHoursSlider');
            if (hoursInput) hoursInput.value = params.get('wochenstunden');
            if (hoursSlider) hoursSlider.value = params.get('wochenstunden');
        }

        if (params.has('miete')) {
            const housingInput = document.getElementById('housingCost');
            if (housingInput) housingInput.value = params.get('miete');
            const housingSlider = document.getElementById('housingCostSlider');
            if (housingSlider) housingSlider.value = params.get('miete');
        }

        if (params.has('groesse')) {
            const sizeInput = document.getElementById('apartmentSize');
            const sizeSlider = document.getElementById('apartmentSizeSlider');
            if (sizeInput) sizeInput.value = params.get('groesse');
            if (sizeSlider) sizeSlider.value = params.get('groesse');
        }

        if (params.has('bundesland')) {
            const stateInput = document.getElementById('federalState');
            if (stateInput) stateInput.value = params.get('bundesland');
        }

        if (params.has('wiedereinsteiger')) {
            const checkbox = document.getElementById('wiedereinsteiger');
            if (checkbox) checkbox.checked = params.get('wiedereinsteiger') === '1';
        }

        if (params.has('kinder')) {
            const ages = params.get('kinder').split(',').map(age => parseInt(age, 10)).filter(age => !Number.isNaN(age));
            const careModes = params.has('betreuung')
                ? params.get('betreuung').split(',')
                : [];

            ChildrenManager.setChildren(ages.map((age, index) => ({
                age,
                careMode: careModes[index] || 'none'
            })));
        }

        if (params.get('modus') === 'hours' && typeof FormManager !== 'undefined') {
            const derived = FormManager.calculateHourlyIncome(
                parseFloat(document.getElementById('hourlyWage')?.value) || 0,
                parseFloat(document.getElementById('weeklyHours')?.value) || 0
            );
            const grossInput = document.getElementById('grossIncome');
            const grossSlider = document.getElementById('grossIncomeSlider');
            if (grossInput) grossInput.value = Math.round(derived.monthlyGross14);
            if (grossSlider) grossSlider.value = Math.round(derived.monthlyGross14);
        }

        UIState.updateHousingLabel(document.getElementById('housingType')?.value || 'rent');
        if (typeof FormManager !== 'undefined') {
            FormManager.syncDerivedIncomeHint();
            FormManager.calculate();
        }
    },

    generateShareURL() {
        const params = new URLSearchParams();
        const incomeMode = document.querySelector('[name="incomeMode"]:checked')?.value || 'salary';
        const incomePeriod = document.querySelector('[name="incomePeriod"]:checked')?.value || 'monthly';
        const familyStatus = document.getElementById('familyStatus')?.value || 'single';
        const grossIncome = document.getElementById('grossIncome')?.value || 0;
        const partnerIncome = document.getElementById('partnerIncome')?.value || 0;
        const hourlyWage = document.getElementById('hourlyWage')?.value || 0;
        const weeklyHours = document.getElementById('weeklyHours')?.value || 0;
        const housingCost = document.getElementById('housingCost')?.value || 0;
        const apartmentSize = document.getElementById('apartmentSize')?.value || 0;
        const federalState = document.getElementById('federalState')?.value || 'vienna';
        const wiedereinsteiger = document.getElementById('wiedereinsteiger')?.checked;

        if (familyStatus !== 'single') params.set('status', familyStatus);
        if (incomeMode !== 'salary') params.set('modus', incomeMode);
        if (incomePeriod !== 'monthly') params.set('periode', incomePeriod);
        if (incomeMode === 'salary' && parseFloat(grossIncome) > 0) params.set('brutto', grossIncome);
        if (parseFloat(partnerIncome) > 0) params.set('partner', partnerIncome);
        if (incomeMode === 'hours' && parseFloat(hourlyWage) > 0) params.set('stundenlohn', hourlyWage);
        if (incomeMode === 'hours' && parseFloat(weeklyHours) > 0) params.set('wochenstunden', weeklyHours);
        if (parseFloat(housingCost) > 0) params.set('miete', housingCost);
        if (parseFloat(apartmentSize) > 0) params.set('groesse', apartmentSize);
        if (federalState !== 'vienna') params.set('bundesland', federalState);
        if (wiedereinsteiger) params.set('wiedereinsteiger', '1');

        if (typeof ChildrenManager !== 'undefined') {
            const children = ChildrenManager.getChildren();
            if (children.length > 0) {
                params.set('kinder', children.map(child => child.age).join(','));
                params.set('betreuung', children.map(child => child.careMode || 'none').join(','));
            }
        }

        return window.location.origin + window.location.pathname + '?' + params.toString();
    },

    async shareResults() {
        const url = this.generateShareURL();
        window.history.replaceState({}, '', url);

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'was-bleibt.at - Meine Berechnung',
                    text: `Was bleibt: ${document.getElementById('stickyDisposable')?.textContent || ''}`,
                    url
                });
                return;
            } catch (error) {
                this.copyToClipboard(url);
                return;
            }
        }

        this.copyToClipboard(url);
    },

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('shareBtn');
            if (!btn) return;

            const originalTitle = btn.title;
            btn.title = 'Link kopiert!';
            btn.style.background = 'rgba(46, 125, 50, 0.8)';
            setTimeout(() => {
                btn.title = originalTitle;
                btn.style.background = '';
            }, 2000);
        });
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = URLHandler;
}
