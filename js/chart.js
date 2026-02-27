/**
 * Chart visualization for Austrian Tax Calculator
 * Stacked bar chart showing household income breakdown
 */

const ChartManager = {
    chart: null,

    // Chart colors - Staatlich Light palette
    COLORS: {
        netto: 'rgba(29, 155, 240, 0.85)',          // Light Blue - Net income
        familienbeihilfe: 'rgba(26, 68, 128, 0.85)',// Government Blue
        sozialhilfe: 'rgba(183, 28, 28, 0.85)',     // Austrian Red
        wohnbeihilfe: 'rgba(245, 158, 11, 0.85)',   // Amber
        kinderzuschlag: 'rgba(123, 31, 162, 0.85)', // Purple
        currentMarker: 'rgba(26, 68, 128, 1)',      // Government Blue
        housingCost: 'rgba(239, 68, 68, 0.85)',     // Red - costs
        wasBleibt: 'rgba(21, 128, 61, 1)'           // Green Line - Disposable
    },

    /**
     * Generate chart data for income range
     * @param {object} situation - User's situation
     * @param {number} currentGross - User's current gross income
     * @returns {object} Chart.js compatible data
     */
    generateChartData(situation, currentGross) {
        const step = 100;
        const maxGross = 6000;
        const labels = [];
        const nettoData = [];
        const familienbeihilfeData = [];
        const wohnbeihilfeData = [];
        const kinderzuschlagData = [];
        const sozialhilfeData = [];
        const housingCostData = [];
        const wasBleibtData = [];

        for (let gross = 0; gross <= maxGross; gross += step) {
            labels.push(gross);

            // Calculate net income for primary earner
            const taxResult = TaxCalculator.calculateMonthlyNet(gross);

            // Calculate partner's net income (if married and partner has income)
            let partnerNetIncome = 0;
            let combinedMonthlyNet = taxResult.net;

            if (situation.familyStatus === 'married' && situation.partnerIncome > 0) {
                const partnerTaxResult = TaxCalculator.calculateMonthlyNet(situation.partnerIncome);
                partnerNetIncome = partnerTaxResult.net;
                combinedMonthlyNet = taxResult.net + partnerNetIncome;
            }

            // Calculate benefits for this income level (using combined income)
            const benefits = BenefitsCalculator.calculateAllBenefits({
                ...situation,
                monthlyGross: gross,
                monthlyNet: taxResult.net,
                partnerNetIncome: partnerNetIncome,
                combinedMonthlyNet: combinedMonthlyNet,
                annualTax: taxResult.annualTax
            });

            // Calculate true net (including tax credits)
            const trueNet = combinedMonthlyNet + (benefits.totalTaxCredits / 12);
            nettoData.push(Math.round(trueNet));
            familienbeihilfeData.push(Math.round(benefits.familienbeihilfe.total));
            wohnbeihilfeData.push(Math.round(benefits.wohnbeihilfe.amount));
            kinderzuschlagData.push(Math.round(benefits.familienbonus.monthlyKindermehrbetrag || 0));
            sozialhilfeData.push(Math.round(benefits.sozialhilfe.amount));

            // Housing costs (negative)
            const housingAmount = situation.monthlyRent || 0;
            housingCostData.push(-Math.round(housingAmount));

            // What remains line
            const totalPos = trueNet + benefits.familienbeihilfe.total + benefits.wohnbeihilfe.amount + (benefits.familienbonus.monthlyKindermehrbetrag || 0) + benefits.sozialhilfe.amount;
            const totalNeg = housingAmount;
            wasBleibtData.push(Math.round(totalPos - totalNeg));
        }

        const hasPartnerIncome = situation.familyStatus === 'married' && situation.partnerIncome > 0;

        return {
            labels: labels,
            datasets: [
                {
                    label: 'Was bleibt',
                    data: wasBleibtData,
                    type: 'line',
                    borderColor: this.COLORS.wasBleibt,
                    backgroundColor: this.COLORS.wasBleibt,
                    borderWidth: 3,
                    pointRadius: 2,
                    fill: false,
                    order: 0 // Draw on top
                },
                {
                    label: hasPartnerIncome ? 'Haushaltsnetto' : 'Nettoeinkommen',
                    data: nettoData,
                    backgroundColor: this.COLORS.netto,
                    borderColor: this.COLORS.netto,
                    borderWidth: 0,
                    stack: 'Stack 0'
                },
                {
                    label: 'Familienbeihilfe',
                    data: familienbeihilfeData,
                    backgroundColor: this.COLORS.familienbeihilfe,
                    borderColor: this.COLORS.familienbeihilfe,
                    borderWidth: 0,
                    stack: 'Stack 0'
                },
                {
                    label: 'Wohnbeihilfe',
                    data: wohnbeihilfeData,
                    backgroundColor: this.COLORS.wohnbeihilfe,
                    borderColor: this.COLORS.wohnbeihilfe,
                    borderWidth: 0,
                    stack: 'Stack 0'
                },
                {
                    label: 'Kindermehrbetrag',
                    data: kinderzuschlagData,
                    backgroundColor: this.COLORS.kinderzuschlag,
                    borderColor: this.COLORS.kinderzuschlag,
                    borderWidth: 0,
                    stack: 'Stack 0'
                },
                {
                    label: 'Sozialhilfe',
                    data: sozialhilfeData,
                    backgroundColor: this.COLORS.sozialhilfe,
                    borderColor: this.COLORS.sozialhilfe,
                    borderWidth: 0,
                    stack: 'Stack 0'
                },

                {
                    label: 'Wohnkosten',
                    data: housingCostData,
                    backgroundColor: this.COLORS.housingCost,
                    borderColor: this.COLORS.housingCost,
                    borderWidth: 0,
                    stack: 'Stack 0'
                }
            ],
            currentIndex: Math.round(currentGross / step)
        };
    },

    /**
     * Create or update the chart
     * @param {string} canvasId - Canvas element ID
     * @param {object} situation - User's situation
     * @param {number} currentGross - Current gross income
     */
    createChart(canvasId, situation, currentGross) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const chartData = this.generateChartData(situation, currentGross);
        const currentIndex = chartData.currentIndex;

        // Destroy existing chart
        if (this.chart) {
            this.chart.destroy();
        }

        // Create annotation for current income
        const verticalLinePlugin = {
            id: 'verticalLine',
            afterDraw: (chart) => {
                if (currentIndex >= 0 && currentIndex < chart.data.labels.length) {
                    const ctx = chart.ctx;
                    const xAxis = chart.scales.x;
                    const yAxis = chart.scales.y;

                    // Get the x position for current income
                    const x = xAxis.getPixelForValue(currentIndex);

                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(x, yAxis.top);
                    ctx.lineTo(x, yAxis.bottom);
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = this.COLORS.currentMarker;
                    ctx.setLineDash([5, 5]);
                    ctx.stroke();

                    // Label - dark text with white outline for light theme
                    ctx.fillStyle = '#1a4480';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 3;
                    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
                    ctx.textAlign = 'center';
                    // Draw stroke first (white outline), position inside chart
                    ctx.strokeText('Ihr Einkommen', x, yAxis.top + 20);
                    // Then fill (dark text)
                    ctx.fillText('Ihr Einkommen', x, yAxis.top + 20);
                    ctx.restore();
                }
            }
        };

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#4a5568',
                            font: {
                                family: '-apple-system, BlinkMacSystemFont, sans-serif',
                                size: 12
                            },
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'rectRounded'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        titleColor: '#1b1b1b',
                        bodyColor: '#4a5568',
                        borderColor: 'rgba(0, 0, 0, 0.1)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: {
                            family: '-apple-system, BlinkMacSystemFont, sans-serif',
                            weight: 'bold'
                        },
                        bodyFont: {
                            family: '-apple-system, BlinkMacSystemFont, sans-serif'
                        },
                        callbacks: {
                            title: (items) => {
                                return `Brutto: € ${items[0].label}/Monat`;
                            },
                            label: (item) => {
                                return `${item.dataset.label}: € ${Math.abs(item.raw)}`;
                            },
                            afterBody: (items) => {
                                const index = items[0].dataIndex;
                                const gross = chartData.labels[index];
                                let totalPos = 0;
                                let totalNeg = 0;

                                chartData.datasets.forEach(ds => {
                                    if (ds.type !== 'line') {
                                        const val = ds.data[index];
                                        if (val > 0) totalPos += val;
                                        else totalNeg += Math.abs(val);
                                    }
                                });

                                const disposable = Math.max(0, totalPos - totalNeg);
                                const lines = [];

                                lines.push(`(+) Einnahmen: € ${totalPos}`);
                                lines.push(`(-) Abzüge & Kosten: -€ ${totalNeg}`);
                                lines.push(`==================`);
                                lines.push(`Was bleibt: € ${disposable}`);

                                return lines;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        title: {
                            display: true,
                            text: 'Bruttolohn (€/Monat)',
                            color: '#4a5568',
                            font: {
                                family: '-apple-system, BlinkMacSystemFont, sans-serif',
                                size: 14,
                                weight: '500'
                            }
                        },
                        ticks: {
                            color: '#718096',
                            callback: (value, index) => {
                                // Show every 5th label
                                if (index % 5 === 0) {
                                    return '€' + chartData.labels[index];
                                }
                                return '';
                            },
                            maxRotation: 0
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    y: {
                        stacked: true,
                        title: {
                            display: false // Hidden to save space - € prefix on values is clear
                        },
                        ticks: {
                            color: '#718096',
                            callback: (value) => '€' + value.toLocaleString('de-AT')
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
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
     * @param {object} situation - User's situation
     * @returns {Array} Array of trap zones
     */
    findTrapZones(situation) {
        const step = 100;
        const maxGross = 6000;
        const results = [];
        const trapZones = [];

        for (let gross = 0; gross <= maxGross; gross += step) {
            const taxResult = TaxCalculator.calculateMonthlyNet(gross);

            // Calculate partner's net income (if married and partner has income)
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
                partnerNetIncome: partnerNetIncome,
                combinedMonthlyNet: combinedMonthlyNet,
                annualTax: taxResult.annualTax
            });

            results.push({
                gross: gross,
                total: benefits.totalHouseholdIncome
            });
        }

        // Find zones where increasing gross doesn't increase total
        for (let i = 1; i < results.length; i++) {
            const prev = results[i - 1];
            const curr = results[i];

            if (curr.total <= prev.total && curr.gross > prev.gross) {
                trapZones.push({
                    fromGross: prev.gross,
                    toGross: curr.gross,
                    fromTotal: prev.total,
                    toTotal: curr.total,
                    difference: prev.total - curr.total
                });
            }
        }

        return trapZones;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChartManager;
}
