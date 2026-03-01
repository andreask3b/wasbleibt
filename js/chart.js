/**
 * Chart visualization for Austrian Tax Calculator
 * Line chart with filled areas — clean, mobile-friendly
 */

const ChartManager = {
    chart: null,

    // Color palette
    COLORS: {
        wasBleibt: { line: '#16a34a', fill: 'rgba(22, 163, 74, 0.12)' },   // Green
        netto: { line: '#1d9bf0', fill: 'rgba(29, 155, 240, 0.10)' },   // Blue
        sozialleistungen: { line: '#f59e0b', fill: 'rgba(245, 158, 11, 0.10)' },   // Amber
        sozialhilfe: { line: '#ef4444', fill: 'rgba(239, 68, 68, 0.10)' },    // Red
        currentMarker: '#1a4480',
    },

    /**
     * Generate chart data for income range
     */
    generateChartData(situation, currentGross) {
        const step = 100;
        const maxGross = 6000;
        const labels = [];
        const wasBleibtData = [];
        const nettoData = [];
        const sozialleistungenData = [];
        const sozialhilfeData = [];

        for (let gross = 0; gross <= maxGross; gross += step) {
            labels.push(gross);

            const taxResult = TaxCalculator.calculateMonthlyNet(gross);

            let partnerNetIncome = 0;
            let combinedMonthlyNet = taxResult.net;
            if (situation.familyStatus === 'married' && situation.partnerIncome > 0) {
                const partnerTaxResult = TaxCalculator.calculateMonthlyNet(situation.partnerIncome);
                partnerNetIncome = partnerTaxResult.net;
                combinedMonthlyNet = taxResult.net + partnerNetIncome;
            }

            const benefits = BenefitsCalculator.calculateAllBenefits({
                ...situation,
                monthlyGross: gross,
                monthlyNet: taxResult.net,
                partnerNetIncome,
                combinedMonthlyNet,
                annualTax: taxResult.annualTax
            });

            const trueNet = combinedMonthlyNet + (benefits.totalTaxCredits / 12);
            const housing = situation.monthlyRent || 0;
            const bene = benefits.familienbeihilfe.total
                + benefits.wohnbeihilfe.amount
                + (benefits.familienbonus.monthlyKindermehrbetrag || 0);

            nettoData.push(Math.round(trueNet));
            sozialleistungenData.push(Math.round(bene));
            sozialhilfeData.push(Math.round(benefits.sozialhilfe.amount));
            wasBleibtData.push(Math.round(trueNet + bene + benefits.sozialhilfe.amount - housing));
        }

        return {
            labels,
            currentIndex: Math.round(currentGross / step),
            wasBleibtData,
            nettoData,
            sozialleistungenData,
            sozialhilfeData,
            situation,
        };
    },

    /**
     * Build the fixed tooltip panel HTML — shown above chart on hover/touch
     */
    _tooltipPanelId: 'chartTooltipPanel',

    _ensureTooltipPanel(container) {
        let panel = document.getElementById(this._tooltipPanelId);
        if (!panel) {
            panel = document.createElement('div');
            panel.id = this._tooltipPanelId;
            panel.className = 'chart-tooltip-panel';
            container.insertAdjacentElement('beforebegin', panel);
        }
        return panel;
    },

    _updateTooltipPanel(panel, gross, chartData, index) {
        const fmt = (v) => '€\u202f' + Math.round(v).toLocaleString('de-AT');
        const housing = chartData.situation.monthlyRent || 0;

        const netto = chartData.nettoData[index] || 0;
        const bene = chartData.sozialleistungenData[index] || 0;
        const sh = chartData.sozialhilfeData[index] || 0;
        const wasBleibt = chartData.wasBleibtData[index] || 0;

        panel.innerHTML = `
            <span class="ctp-gross">Brutto: <strong>${fmt(gross)}</strong></span>
            <span class="ctp-sep">|</span>
            <span class="ctp-item ctp-netto">Netto <strong>${fmt(netto)}</strong></span>
            ${bene > 0 ? `<span class="ctp-sep">+</span><span class="ctp-item ctp-bene">Leistungen <strong>${fmt(bene)}</strong></span>` : ''}
            ${sh > 0 ? `<span class="ctp-sep">+</span><span class="ctp-item ctp-sh">Sozialhilfe <strong>${fmt(sh)}</strong></span>` : ''}
            ${housing > 0 ? `<span class="ctp-sep">−</span><span class="ctp-item ctp-housing">Wohnen <strong>${fmt(housing)}</strong></span>` : ''}
            <span class="ctp-sep">=</span>
            <span class="ctp-item ctp-wasbleibt">Was bleibt <strong>${fmt(wasBleibt)}</strong></span>
        `;
        panel.classList.add('visible');
    },

    /**
     * Create or update the chart
     */
    createChart(canvasId, situation, currentGross) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const chartData = this.generateChartData(situation, currentGross);

        if (this.chart) {
            this.chart.destroy();
        }

        // Ensure tooltip panel
        const container = canvas.closest('.chart-container') || canvas.parentElement;
        const panel = this._ensureTooltipPanel(canvas.closest('.chart-wrapper') || container);

        // --- Vertical line plugin ---
        const verticalLinePlugin = {
            id: 'verticalLine',
            afterDraw: (chart) => {
                const idx = chartData.currentIndex;
                if (idx < 0 || idx >= chart.data.labels.length) return;
                const ctx = chart.ctx;
                const xAxis = chart.scales.x;
                const yAxis = chart.scales.y;
                const x = xAxis.getPixelForValue(idx);

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, yAxis.top);
                ctx.lineTo(x, yAxis.bottom);
                ctx.lineWidth = 2;
                ctx.strokeStyle = this.COLORS.currentMarker;
                ctx.setLineDash([5, 4]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Label
                const label = 'Ihr Einkommen';
                ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
                const textWidth = ctx.measureText(label).width;
                const padding = 6;
                const rectX = x - textWidth / 2 - padding;
                const rectY = yAxis.top + 6;
                const rectW = textWidth + padding * 2;
                const rectH = 20;

                // Background pill
                ctx.fillStyle = this.COLORS.currentMarker;
                ctx.beginPath();
                ctx.roundRect(rectX, rectY, rectW, rectH, 4);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, x, rectY + rectH / 2);
                ctx.restore();
            }
        };

        const hasPartnerIncome = situation.familyStatus === 'married' && situation.partnerIncome > 0;

        this.chart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [
                    {
                        label: 'Was bleibt',
                        data: chartData.wasBleibtData,
                        borderColor: this.COLORS.wasBleibt.line,
                        backgroundColor: this.COLORS.wasBleibt.fill,
                        borderWidth: 2.5,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        fill: 'origin',
                        tension: 0.35,
                        order: 1,
                    },
                    {
                        label: hasPartnerIncome ? 'Haushaltsnetto' : 'Nettoeinkommen',
                        data: chartData.nettoData,
                        borderColor: this.COLORS.netto.line,
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        fill: false,
                        tension: 0.35,
                        borderDash: [],
                        order: 2,
                    },
                    {
                        label: 'Sozialleistungen',
                        data: chartData.sozialleistungenData,
                        borderColor: this.COLORS.sozialleistungen.line,
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        fill: false,
                        tension: 0.35,
                        order: 3,
                    },
                    {
                        label: 'Sozialhilfe',
                        data: chartData.sozialhilfeData,
                        borderColor: this.COLORS.sozialhilfe.line,
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        fill: false,
                        tension: 0.35,
                        order: 4,
                    },
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#718096',
                            font: { size: 11, family: '-apple-system, BlinkMacSystemFont, sans-serif' },
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: 'line',
                            boxWidth: 20,
                        }
                    },
                    tooltip: {
                        // Disable the floating tooltip — we use the fixed panel instead
                        enabled: false,
                        external: (context) => {
                            if (context.tooltip.opacity === 0) return;
                            const index = context.tooltip.dataPoints?.[0]?.dataIndex;
                            if (index === undefined) return;
                            const gross = chartData.labels[index];
                            this._updateTooltipPanel(panel, gross, chartData, index);
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Bruttolohn (€/Monat)',
                            color: '#718096',
                            font: { size: 12, family: '-apple-system, BlinkMacSystemFont, sans-serif' }
                        },
                        ticks: {
                            color: '#718096',
                            maxRotation: 0,
                            callback: (value, index) => {
                                if (index % 5 === 0) return '€' + chartData.labels[index];
                                return '';
                            }
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    y: {
                        ticks: {
                            color: '#718096',
                            callback: (v) => '€' + v.toLocaleString('de-AT')
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                }
            },
            plugins: [verticalLinePlugin]
        });
    },

    /**
     * Find "trap zones" where earning more doesn't increase total income
     */
    findTrapZones(situation) {
        const step = 100;
        const maxGross = 6000;
        const results = [];
        const trapZones = [];

        for (let gross = 0; gross <= maxGross; gross += step) {
            const taxResult = TaxCalculator.calculateMonthlyNet(gross);
            let partnerNetIncome = 0;
            let combinedMonthlyNet = taxResult.net;
            if (situation.familyStatus === 'married' && situation.partnerIncome > 0) {
                const partnerTaxResult = TaxCalculator.calculateMonthlyNet(situation.partnerIncome);
                partnerNetIncome = partnerTaxResult.net;
                combinedMonthlyNet = taxResult.net + partnerNetIncome;
            }
            const benefits = BenefitsCalculator.calculateAllBenefits({
                ...situation,
                monthlyGross: gross,
                monthlyNet: taxResult.net,
                partnerNetIncome,
                combinedMonthlyNet,
                annualTax: taxResult.annualTax
            });
            results.push({ gross, total: benefits.totalHouseholdIncome });
        }

        for (let i = 1; i < results.length; i++) {
            const prev = results[i - 1];
            const curr = results[i];
            if (curr.total <= prev.total && curr.gross > prev.gross) {
                trapZones.push({
                    fromGross: prev.gross, toGross: curr.gross,
                    fromTotal: prev.total, toTotal: curr.total,
                    difference: prev.total - curr.total
                });
            }
        }
        return trapZones;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChartManager;
}
