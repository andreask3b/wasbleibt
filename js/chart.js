/**
 * Chart visualization for Austrian Tax Calculator
 * Two-line chart: "Was bleibt" + "Nettoeinkommen" for reference
 */

const ChartManager = {
    chart: null,

    COLORS: {
        wasBleibt: { line: '#16a34a', fill: 'rgba(22, 163, 74, 0.12)' },
        netto: { line: '#94a3b8', fill: 'transparent' }, // muted grey — reference only
        currentMarker: '#1a4480',
    },

    /**
     * Generate data for income range
     */
    generateChartData(situation, currentGross) {
        const step = 100;
        const maxGross = 6000;
        const labels = [];
        const wasBleibtData = [];
        const nettoData = [];

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
            const totalBenefits = benefits.familienbeihilfe.total
                + benefits.wohnbeihilfe.amount
                + (benefits.familienbonus.monthlyKindermehrbetrag || 0)
                + benefits.sozialhilfe.amount;

            nettoData.push(Math.round(trueNet));
            wasBleibtData.push(Math.round(trueNet + totalBenefits - housing));
        }

        return {
            labels,
            wasBleibtData,
            nettoData,
            currentIndex: Math.round(currentGross / step),
            situation,
        };
    },

    /**
     * Create or update the chart
     */
    createChart(canvasId, situation, currentGross) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const chartData = this.generateChartData(situation, currentGross);

        if (this.chart) this.chart.destroy();

        // --- Vertical marker plugin ("Ihr Einkommen") ---
        const verticalLinePlugin = {
            id: 'verticalLine',
            afterDraw: (chart) => {
                const idx = chartData.currentIndex;
                if (idx < 0 || idx >= chart.data.labels.length) return;

                const ctx = chart.ctx;
                const xAxis = chart.scales.x;
                const yAxis = chart.scales.y;
                const x = xAxis.getPixelForValue(idx);

                // Dashed line
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, yAxis.top);
                ctx.lineTo(x, yAxis.bottom);
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = this.COLORS.currentMarker;
                ctx.setLineDash([5, 4]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Pill label
                const label = 'Ihr Einkommen';
                ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
                ctx.textBaseline = 'middle';
                const tw = ctx.measureText(label).width;
                const pad = 7, rh = 20;
                const rx = x - tw / 2 - pad;
                const ry = yAxis.top + 6;
                const rw = tw + pad * 2;

                ctx.fillStyle = this.COLORS.currentMarker;
                ctx.beginPath();
                ctx.roundRect(rx, ry, rw, rh, 4);
                ctx.fill();

                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.fillText(label, x, ry + rh / 2);
                ctx.restore();
            }
        };

        const hasPartner = situation.familyStatus === 'married' && situation.partnerIncome > 0;

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
                        label: hasPartner ? 'Haushaltsnetto (Referenz)' : 'Nettoeinkommen (Referenz)',
                        data: chartData.nettoData,
                        borderColor: this.COLORS.netto.line,
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        borderDash: [6, 3],
                        pointRadius: 0,
                        pointHoverRadius: 3,
                        fill: false,
                        tension: 0.35,
                        order: 2,
                    },
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 250 },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#718096',
                            font: { size: 11, family: '-apple-system, BlinkMacSystemFont, sans-serif' },
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: 'line',
                            boxWidth: 24,
                        }
                    },
                    tooltip: {
                        // Minimal: just show values at hover point, no external panel
                        backgroundColor: 'rgba(255,255,255,0.96)',
                        titleColor: '#1b1b1b',
                        bodyColor: '#4a5568',
                        borderColor: 'rgba(0,0,0,0.10)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            title: (items) => `Brutto: € ${items[0].label}/Monat`,
                            label: (item) => {
                                const v = item.raw;
                                const suffix = item.datasetIndex === 1 ? ' (ohne Leistungen/Kosten)' : '';
                                return ` ${item.dataset.label.split(' (')[0]}: € ${v.toLocaleString('de-AT')}${suffix}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Bruttolohn (€/Monat)',
                            color: '#94a3b8',
                            font: { size: 11, family: '-apple-system, BlinkMacSystemFont, sans-serif' }
                        },
                        ticks: {
                            color: '#94a3b8',
                            maxRotation: 0,
                            font: { size: 10 },
                            callback: (value, index) => {
                                if (index % 5 === 0) return '€' + chartData.labels[index];
                                return '';
                            }
                        },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    },
                    y: {
                        ticks: {
                            color: '#94a3b8',
                            font: { size: 10 },
                            callback: (v) => '€' + v.toLocaleString('de-AT')
                        },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    }
                },
                interaction: { mode: 'index', intersect: false }
            },
            plugins: [verticalLinePlugin]
        });
    },

    /**
     * Find "trap zones" — income ranges where more gross → less total
     */
    findTrapZones(situation) {
        const step = 100;
        const results = [];
        const trapZones = [];

        for (let gross = 0; gross <= 6000; gross += step) {
            const taxResult = TaxCalculator.calculateMonthlyNet(gross);
            let partnerNetIncome = 0;
            let combinedMonthlyNet = taxResult.net;
            if (situation.familyStatus === 'married' && situation.partnerIncome > 0) {
                const partnerTaxResult = TaxCalculator.calculateMonthlyNet(situation.partnerIncome);
                partnerNetIncome = partnerTaxResult.net;
                combinedMonthlyNet = taxResult.net + partnerNetIncome;
            }
            const benefits = BenefitsCalculator.calculateAllBenefits({
                ...situation, monthlyGross: gross, monthlyNet: taxResult.net,
                partnerNetIncome, combinedMonthlyNet, annualTax: taxResult.annualTax
            });
            results.push({ gross, total: benefits.totalHouseholdIncome });
        }

        for (let i = 1; i < results.length; i++) {
            const prev = results[i - 1], curr = results[i];
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
