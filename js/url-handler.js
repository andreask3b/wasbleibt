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

        if (params.has('monatsstunden') || params.has('wochenstunden')) {
            const rawHours = params.has('monatsstunden')
                ? parseFloat(params.get('monatsstunden'))
                : (typeof FormManager !== 'undefined'
                    ? FormManager.weeklyHoursToMonthlyHours(parseFloat(params.get('wochenstunden')) || 0)
                    : Math.round((parseFloat(params.get('wochenstunden')) || 0) * 52 / 12));
            const hoursInput = document.getElementById('monthlyHours');
            const hoursSlider = document.getElementById('monthlyHoursSlider');
            if (hoursInput) hoursInput.value = rawHours;
            if (hoursSlider) hoursSlider.value = rawHours;
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
                parseFloat(document.getElementById('monthlyHours')?.value) || 0
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
        const monthlyHours = document.getElementById('monthlyHours')?.value || 0;
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
        if (incomeMode === 'hours' && parseFloat(monthlyHours) > 0) params.set('monatsstunden', monthlyHours);
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

        const query = params.toString();
        return window.location.origin + window.location.pathname + (query ? `?${query}` : '');
    },

    async shareResults(triggerButton = null) {
        const url = this.generateShareURL();
        window.history.replaceState({}, '', url);
        this.setShareStatus('');

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'was-bleibt.at - Meine Berechnung',
                    text: `Was bleibt: ${document.getElementById('disposableIncome')?.textContent || ''}`,
                    url
                });
                this.setShareStatus('Szenario geteilt');
                this.setShareURLField('', true);
                return;
            } catch (error) {
                if (error?.name === 'AbortError') {
                    return;
                }
            }
        }

        await this.copyToClipboard(url, triggerButton);
    },

    async copyToClipboard(text, triggerButton = null) {
        let copied = false;

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                copied = true;
            }
        } catch (error) {
            copied = false;
        }

        if (!copied) {
            copied = this.fallbackCopyToClipboard(text);
        }

        if (copied) {
            this.setShareStatus('Link kopiert');
            this.setShareURLField('', true);
            this.markShareButton(triggerButton || document.getElementById('heroShareBtn'));
        } else {
            this.setShareStatus('Link in der Adresszeile aktualisiert');
            this.setShareURLField(text, false);
        }
    },

    fallbackCopyToClipboard(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        try {
            return document.execCommand('copy');
        } catch (error) {
            return false;
        } finally {
            document.body.removeChild(textarea);
        }
    },

    setShareStatus(message) {
        const status = document.getElementById('shareStatus');
        if (status) status.textContent = message;
        if (!message) this.setShareURLField('', true);
    },

    setShareURLField(value, hidden) {
        const field = document.getElementById('shareUrlField');
        if (!field) return;

        field.value = value;
        field.hidden = hidden;
        if (!hidden) {
            field.focus();
            field.select();
        }
    },

    markShareButton(button) {
        const buttons = [
            button,
            document.getElementById('heroShareBtn'),
            document.getElementById('shareBtn')
        ].filter(Boolean);

        buttons.forEach(btn => {
            const originalTitle = btn.title;
            const originalLabel = btn.querySelector('span')?.textContent;
            btn.dataset.shareActive = 'true';
            btn.title = 'Link kopiert!';

            const label = btn.querySelector('span');
            if (label && btn.id === 'heroShareBtn') {
                label.textContent = 'Link kopiert';
            }

            setTimeout(() => {
                btn.title = originalTitle;
                delete btn.dataset.shareActive;
                if (label && originalLabel) {
                    label.textContent = originalLabel;
                }
            }, 2200);
        });
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = URLHandler;
}
