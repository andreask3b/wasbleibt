/**
 * Chart visualization for Austrian Tax Calculator
 * Main: "Was bleibt" (solid green fill)
 * Reference dashed lines: Nettoeinkommen, Familienbeihilfe, Wohnbeihilfe, Sozialhilfe, Wohnkosten
 */

const ChartManager = {
    chart: null,

    COLORS: {
        wasBleibt: { line: '#16a34a', fill: 'rgba(22,163,74,0.10)' },
        netto: '#94a3b8',   // grey dashed
        familienbeihilfe: '#1a4480', // gov blue dashed
        wohnbeihilfe: '#f59e0b',   // amber dashed
        sozialhilfe: '#ef4444',   // red dashed
        wohnkosten: '#f87171',   // light-red dashed (cost, shown positive)
        currentMarker: '#1a4480',
    },

    generateChartData(situation, currentGross) {
        const step = 100;
        const maxGross = 6000;
        const labels = [];
        const wasBleibt = [], netto = [], familienbeihilfe = [],
            wohnbeihilfe = [], sozialhilfe = [], wohnkosten = [];

        for (let gross = 0; gross <= maxGross; gross += step) {
            labels.push(gross);

            const tax = TaxCalculator.calculateMonthlyNet(gross);
            let partnerNet = 0, combinedNet = tax.net;
            if (situation.familyStatus === 'married' && situation.partnerIncome > 0) {
                const p = TaxCalculator.calculateMonthlyNet(situation.partnerIncome);
                partnerNet = p.net;
                combinedNet = tax.net + p.net;
            }

            const b = BenefitsCalculator.calculateAllBenefits({
                ...situation,
                monthlyGross: gross, monthlyNet: tax.net,
                partnerNetIncome: partnerNet, combinedMonthlyNet: combinedNet,
                annualTax: tax.annualTax
            });

            const trueNet = combinedNet + (b.totalTaxCredits / 12);
            const housing = situation.monthlyRent || 0;

            netto.push(Math.round(trueNet));
            familienbeihilfe.push(Math.round(b.familienbeihilfe.total
                + (b.familienbonus.monthlyKindermehrbetrag || 0)));
            wohnbeihilfe.push(Math.round(b.wohnbeihilfe.amount));
            sozialhilfe.push(Math.round(b.sozialhilfe.amount));
            wohnkosten.push(housing);   // shown as positive so it's visible on chart
            wasBleibt.push(Math.round(
                trueNet + b.familienbeihilfe.total
                + (b.familienbonus.monthlyKindermehrbetrag || 0)
                + b.wohnbeihilfe.amount + b.sozialhilfe.amount - housing));
        }

        return {
            labels, currentIndex: Math.round(currentGross / step),
            wasBleibt, netto, familienbeihilfe, wohnbeihilfe, sozialhilfe, wohnkosten,
            situation,
        };
    },

    createChart(canvasId, situation, currentGross) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const d = this.generateChartData(situation, currentGross);
        if (this.chart) this.chart.destroy();

        // --- "Ihr Einkommen" vertical marker ---
        const markerPlugin = {
            id: 'verticalLine',
            afterDraw: (chart) => {
                const idx = d.currentIndex;
                if (idx < 0 || idx >= chart.data.labels.length) return;
                const ctx = chart.ctx;
                const x = chart.scales.x.getPixelForValue(idx);
                const { top, bottom } = chart.scales.y;

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, top); ctx.lineTo(x, bottom);
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = this.COLORS.currentMarker;
                ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);

                const label = 'Ihr Einkommen';
                ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
                const tw = ctx.measureText(label).width;
                const pad = 7, rh = 20, rx = x - tw / 2 - pad, ry = top + 6, rw = tw + pad * 2;
                ctx.fillStyle = this.COLORS.currentMarker;
                ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 4); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(label, x, ry + rh / 2);
                ctx.restore();
            }
        };

        const hasPartner = situation.familyStatus === 'married' && situation.partnerIncome > 0;
        const DASH = [5, 4];
        const mkDashed = (label, data, color, hidden = false) => ({
            label, data,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: DASH,
            pointRadius: 0,
            pointHoverRadius: 3,
            fill: false,
            tension: 0.35,
            hidden,   // collapse by default if all-zero
        });

        // Determine which dashed lines have any non-zero data
        const anyFB = d.familienbeihilfe.some(v => v > 0);
        const anyWB = d.wohnbeihilfe.some(v => v > 0);
        const anySH = d.sozialhilfe.some(v => v > 0);
        const anyWK = d.wohnkosten.some(v => v > 0);

        this.chart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: d.labels,
                datasets: [
                    // 1. Was bleibt — solid green, filled
                    {
                        label: 'Was bleibt',
                        data: d.wasBleibt,
                        borderColor: this.COLORS.wasBleibt.line,
                        backgroundColor: this.COLORS.wasBleibt.fill,
                        borderWidth: 2.5,
                        pointRadius: 0, pointHoverRadius: 5,
                        fill: 'origin', tension: 0.35, order: 1,
                    },
                    // 2. Nettoeinkommen — grey dashed reference
                    {
                        label: hasPartner ? 'Haushaltsnetto' : 'Nettoeinkommen',
                        data: d.netto,
                        borderColor: this.COLORS.netto,
                        backgroundColor: 'transparent',
                        borderWidth: 1.5, borderDash: DASH,
                        pointRadius: 0, pointHoverRadius: 3,
                        fill: false, tension: 0.35, order: 2,
                    },
                    // 3. Familienbeihilfe — blue dashed
                    { ...mkDashed('Familienbeihilfe', d.familienbeihilfe, this.COLORS.familienbeihilfe, !anyFB), order: 3 },
                    // 4. Wohnbeihilfe — amber dashed
                    { ...mkDashed('Wohnbeihilfe', d.wohnbeihilfe, this.COLORS.wohnbeihilfe, !anyWB), order: 4 },
                    // 5. Sozialhilfe — red dashed
                    { ...mkDashed('Sozialhilfe', d.sozialhilfe, this.COLORS.sozialhilfe, !anySH), order: 5 },
                    // 6. Wohnkosten — light-red dashed (shown as positive magnitude)
                    { ...mkDashed('Wohnkosten', d.wohnkosten, this.COLORS.wohnkosten, !anyWK), order: 6 },
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
                            font: { size: 11 },
                            padding: 14,
                            usePointStyle: true,
                            pointStyle: 'line',
                            boxWidth: 24,
                            filter: (item) => !item.hidden,
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(255,255,255,0.97)',
                        titleColor: '#1b1b1b',
                        bodyColor: '#4a5568',
                        borderColor: 'rgba(0,0,0,0.10)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        filter: (item) => item.raw > 0,   // hide zero rows
                        callbacks: {
                            title: (items) => `Brutto: € ${items[0].label}/Monat`,
                            label: (item) => {
                                const v = item.raw;
                                const name = item.dataset.label;
                                const prefix = name === 'Wohnkosten' ? ' −' : '  ';
                                return `${prefix}${name}: € ${Math.round(v).toLocaleString('de-AT')}`;
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
                            font: { size: 11 }
                        },
                        ticks: {
                            color: '#94a3b8', maxRotation: 0, font: { size: 10 },
                            callback: (val, idx) => idx % 5 === 0 ? '€' + d.labels[idx] : ''
                        },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    },
                    y: {
                        ticks: {
                            color: '#94a3b8', font: { size: 10 },
                            callback: (v) => '€' + v.toLocaleString('de-AT')
                        },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    }
                },
                interaction: { mode: 'index', intersect: false }
            },
            plugins: [markerPlugin]
        });
    },

    findTrapZones(situation) {
        const step = 100;
        const results = [];
        const trapZones = [];
        for (let gross = 0; gross <= 6000; gross += step) {
            const tax = TaxCalculator.calculateMonthlyNet(gross);
            let partnerNet = 0, combinedNet = tax.net;
            if (situation.familyStatus === 'married' && situation.partnerIncome > 0) {
                const p = TaxCalculator.calculateMonthlyNet(situation.partnerIncome);
                partnerNet = p.net; combinedNet = tax.net + p.net;
            }
            const b = BenefitsCalculator.calculateAllBenefits({
                ...situation, monthlyGross: gross, monthlyNet: tax.net,
                partnerNetIncome: partnerNet, combinedMonthlyNet: combinedNet,
                annualTax: tax.annualTax
            });
            results.push({ gross, total: b.totalHouseholdIncome });
        }
        for (let i = 1; i < results.length; i++) {
            const prev = results[i - 1], curr = results[i];
            if (curr.total <= prev.total && curr.gross > prev.gross)
                trapZones.push({
                    fromGross: prev.gross, toGross: curr.gross,
                    fromTotal: prev.total, toTotal: curr.total, difference: prev.total - curr.total
                });
        }
        return trapZones;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = ChartManager;
