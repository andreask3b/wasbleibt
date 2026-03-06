const PovertyTrapPage = {
    currentPresetId: 'single-parent-trap',

    async init() {
        await BenefitsCalculator.loadData();
        this.renderPresetButtons();
        this.renderPreset(this.currentPresetId);
    },

    renderPresetButtons() {
        const container = document.getElementById('trapPresetStrip');
        if (!container) return;

        container.innerHTML = ScenarioPresets.definitions.map(preset => `
            <button type="button" class="preset-btn ${preset.id === this.currentPresetId ? 'active' : ''}" data-trap-preset="${preset.id}">
                <span class="preset-title">${preset.label}</span>
                <span class="preset-desc">${preset.description}</span>
            </button>
        `).join('');

        container.querySelectorAll('[data-trap-preset]').forEach(button => {
            button.addEventListener('click', () => {
                this.currentPresetId = button.dataset.trapPreset;
                this.renderPresetButtons();
                this.renderPreset(this.currentPresetId);
            });
        });
    },

    renderPreset(presetId) {
        const preset = ScenarioPresets.getPreset(presetId);
        if (!preset) return;

        const rows = this.buildRows(preset);
        const baseline = rows[0];
        const currentRow = rows.find(row => row.isCurrent) || rows[Math.min(1, rows.length - 1)];
        const bestRow = rows.reduce((best, row) => row.disposableIncome > best.disposableIncome ? row : best, rows[0]);
        const breakEvenRow = rows.find(row => row.disposableIncome >= baseline.disposableIncome + 25 && row.gross > 0);

        this.renderSummaryCards(baseline, currentRow, bestRow);
        this.renderTable(rows, preset);

        const summaryNote = document.getElementById('trapSummaryNote');
        if (summaryNote) {
            if (breakEvenRow) {
                summaryNote.innerHTML = `<strong>Wendepunkt:</strong> Erst ab ${this.formatCurrency(breakEvenRow.gross)} brutto pro Monat liegt das frei verfügbare Einkommen in diesem Szenario klar über dem Niveau ohne Arbeit.`;
            } else {
                summaryNote.innerHTML = `<strong>Keine klare Entlastung:</strong> Innerhalb dieses Szenarios wird das Niveau ohne Arbeit noch nicht deutlich übertroffen.`;
            }
        }

        const link = document.getElementById('trapPresetLink');
        if (link) {
            link.href = `index.html?${ScenarioPresets.buildShareParams(preset.id)}`;
        }
    },

    buildRows(preset) {
        const values = preset.values;
        const analysis = preset.analysis || { type: 'hours', hourlyWage: values.hourlyWage, hours: [0, 10, 20, 30, 40] };
        const childrenAges = values.children.map(child => child.age);

        if (analysis.type === 'hours') {
            return analysis.hours.map(hours => {
                const income = this.calculateHourlyIncome(analysis.hourlyWage, hours);
                const result = this.calculateScenario({
                    ...values,
                    weeklyHours: hours,
                    hourlyWage: analysis.hourlyWage,
                    monthlyGross: income.monthlyGross14,
                    childrenAges,
                    children: values.children
                });

                return {
                    label: `${hours} Std.`,
                    hours,
                    gross: income.monthlyGross14,
                    netIncome: result.taxResult.net,
                    sozialhilfe: result.benefits.sozialhilfe.amount,
                    wohnbeihilfe: result.benefits.wohnbeihilfe.amount,
                    disposableIncome: result.benefits.disposableIncome,
                    transferIncome: result.benefits.totalMonthlyBenefits,
                    isCurrent: hours === values.weeklyHours
                };
            });
        }

        return [];
    },

    calculateScenario(values) {
        const taxResult = TaxCalculator.calculateMonthlyNet(values.monthlyGross || 0);
        const benefits = BenefitsCalculator.calculateAllBenefits({
            ...values,
            monthlyNet: taxResult.net,
            combinedMonthlyNet: taxResult.net,
            partnerNetIncome: 0,
            annualTax: taxResult.annualTax
        });

        return { taxResult, benefits };
    },

    renderSummaryCards(baseline, currentRow, bestRow) {
        const container = document.getElementById('trapSummaryCards');
        if (!container) return;

        container.innerHTML = `
            <div class="summary-card">
                <span class="card-label">Ohne Arbeit</span>
                <span class="card-value">${this.formatCurrency(baseline.disposableIncome)}</span>
                <span class="card-detail">Frei verfügbar bei 0 Stunden</span>
            </div>
            <div class="summary-card highlight disposable">
                <span class="card-label">Ausgewähltes Szenario</span>
                <span class="card-value">${this.formatCurrency(currentRow.disposableIncome)}</span>
                <span class="card-detail">${currentRow.label} pro Woche</span>
            </div>
            <div class="summary-card benefits">
                <span class="card-label">Bester Wert in der Tabelle</span>
                <span class="card-value">${this.formatCurrency(bestRow.disposableIncome)}</span>
                <span class="card-detail">${bestRow.label} pro Woche</span>
            </div>
        `;
    },

    renderTable(rows, preset) {
        const head = document.getElementById('trapTableHead');
        const body = document.getElementById('trapTableBody');
        if (!head || !body) return;

        const baseline = rows[0];
        head.innerHTML = `
            <tr>
                <th>Std./Woche</th>
                <th>Brutto/Monat</th>
                <th>Sozialhilfe</th>
                <th>Wohnbeihilfe</th>
                <th>Was bleibt</th>
                <th>Δ zu 0h</th>
            </tr>
        `;

        body.innerHTML = rows.map(row => {
            const delta = row.disposableIncome - baseline.disposableIncome;
            const rowClass = delta < 0 ? 'highlight-row-negative' : (row.isCurrent ? 'highlight-row' : '');
            const deltaClass = delta < 0 ? 'highlight-red' : 'highlight-green';

            return `
                <tr class="${rowClass}">
                    <td><strong>${row.label}</strong></td>
                    <td>${this.formatCurrency(row.gross)}</td>
                    <td>${this.formatCurrency(row.sozialhilfe)}</td>
                    <td>${this.formatCurrency(row.wohnbeihilfe)}</td>
                    <td><strong>${this.formatCurrency(row.disposableIncome)}</strong></td>
                    <td class="${deltaClass}">${delta >= 0 ? '+' : ''}${this.formatCurrency(delta)}</td>
                </tr>
            `;
        }).join('');
    },

    calculateHourlyIncome(hourlyWage, weeklyHours) {
        const annualGross = (hourlyWage || 0) * (weeklyHours || 0) * 52;
        return {
            annualGross,
            monthlyGross14: annualGross / 14
        };
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

document.addEventListener('DOMContentLoaded', () => {
    PovertyTrapPage.init();
});
