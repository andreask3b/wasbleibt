/**
 * Chart visualization — was-bleibt.at
 * Stacked cumulative line chart:
 *   Each line is a running total, so the BAND between two lines = one component.
 *
 * Color constants mirror css/variables.css --c-* values exactly.
 */

const ChartManager = {
    chart: null,

    // Mirror of css/variables.css --c-* (keep in sync!)
    C: {
        netto: '#1d9bf0',
        familienbonus: '#60b4f8',
        familienbeihilfe: '#4f46e5',
        sozialhilfe: '#ef4444',
        wohnbeihilfe: '#f59e0b',
        wasBleibt: '#16a34a',
        wasBleibtFill: 'rgba(22,163,74,0.13)',
        wohnkosten: '#f87171',
        wohnkostenFill: 'rgba(248,113,113,0.12)',
        marker: '#1a4480',
    },

    // ─── Data Generation ─────────────────────────────────────────────────────

    generateChartData(situation, currentGross) {
        const STEP = 100, MAX = 6000;
        const labels = [];

        // Per-component arrays (individual values)
        const raw = {
            netto: [], familienbonus: [], familienbeihilfe: [],
            sozialhilfe: [], wohnbeihilfe: [], wohnkosten: []
        };

        for (let gross = 0; gross <= MAX; gross += STEP) {
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

            // Pure netto (no tax credits yet)
            raw.netto.push(Math.round(combinedNet));

            // Familienbonus = tax credit applied on top of combinedNet
            const fb = Math.round((b.totalTaxCredits / 12)
                - (b.familienbonus.monthlyKindermehrbetrag || 0));
            raw.familienbonus.push(Math.max(0, fb));

            // Kindermehrbetrag is counted here together with Familienbeihilfe
            raw.familienbeihilfe.push(Math.round(b.familienbeihilfe.total
                + (b.familienbonus.monthlyKindermehrbetrag || 0)));

            raw.sozialhilfe.push(Math.round(b.sozialhilfe.amount));
            raw.wohnbeihilfe.push(Math.round(b.wohnbeihilfe.amount));
            raw.wohnkosten.push(situation.monthlyRent || 0);
        }

        // Build CUMULATIVE lines (each line = running sum up to that component)
        const cum = {
            netto: [],
            plusFamilienbonus: [],
            plusFambeihilfe: [],
            plusSozialhilfe: [],
            plusWohnbeihilfe: [],
            wasBleibt: [],
            minusWohnkosten: [],   // negative band below zero
        };

        for (let i = 0; i < labels.length; i++) {
            const n = raw.netto[i];
            const fb = raw.familienbonus[i];
            const fa = raw.familienbeihilfe[i];
            const sh = raw.sozialhilfe[i];
            const wb = raw.wohnbeihilfe[i];
            const wk = raw.wohnkosten[i];

            cum.netto[i] = n;
            cum.plusFamilienbonus[i] = n + fb;
            cum.plusFambeihilfe[i] = n + fb + fa;
            cum.plusSozialhilfe[i] = n + fb + fa + sh;
            cum.plusWohnbeihilfe[i] = n + fb + fa + sh + wb;
            cum.wasBleibt[i] = n + fb + fa + sh + wb - wk;
            cum.minusWohnkosten[i] = -wk;  // shown below zero
        }

        // Determine which optional lines have any non-zero value
        const anyFB = raw.familienbonus.some(v => v > 0);
        const anyFA = raw.familienbeihilfe.some(v => v > 0);
        const anySH = raw.sozialhilfe.some(v => v > 0);
        const anyWB = raw.wohnbeihilfe.some(v => v > 0);
        const anyWK = raw.wohnkosten.some(v => v > 0);

        return {
            labels,
            cum,
            raw,
            anyFB, anyFA, anySH, anyWB, anyWK,
            currentIndex: Math.round(currentGross / STEP),
            situation,
        };
    },

    // ─── Chart Creation ───────────────────────────────────────────────────────

    createChart(canvasId, situation, currentGross) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const d = this.generateChartData(situation, currentGross);
        if (this.chart) this.chart.destroy();

        // — Vertical "Ihr Einkommen" marker —
        const markerPlugin = {
            id: 'verticalLine',
            afterDraw: (chart) => {
                const idx = d.currentIndex;
                if (idx < 0 || idx >= chart.data.labels.length) return;
                const ctx = chart.ctx;
                const x = chart.scales.x.getPixelForValue(idx);
                const { top, bottom } = chart.scales.y;
                ctx.save();
                ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom);
                ctx.lineWidth = 1.5; ctx.strokeStyle = this.C.marker;
                ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
                const lbl = 'Ihr Einkommen';
                ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
                const tw = ctx.measureText(lbl).width;
                const pad = 7, rh = 20;
                const rx = x - tw / 2 - pad, ry = top + 6, rw = tw + pad * 2;
                ctx.fillStyle = this.C.marker;
                ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 4); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(lbl, x, ry + rh / 2);
                ctx.restore();
            }
        };

        const DASH = [5, 4];
        const hasP = situation.familyStatus === 'married' && situation.partnerIncome > 0;

        // Helper: build a dashed "band top" dataset
        const band = (label, data, color, hidden = false, fillTarget = '-1') => ({
            label,
            data,
            borderColor: color,
            backgroundColor: color + '28',  // ~16% opacity fill
            borderWidth: 1.5,
            borderDash: DASH,
            pointRadius: 0,
            pointHoverRadius: 3,
            fill: fillTarget,
            tension: 0.35,
            hidden,
            order: 10,
        });

        const datasets = [
            // ── 0. Wohnkosten (negative area below zero) ──────────────────
            ...(d.anyWK ? [{
                label: 'Wohnkosten',
                data: d.cum.minusWohnkosten,
                borderColor: this.C.wohnkosten,
                backgroundColor: this.C.wohnkostenFill,
                borderWidth: 1.5,
                borderDash: DASH,
                pointRadius: 0,
                pointHoverRadius: 3,
                fill: 'origin',   // fill down to zero
                tension: 0.1,     // nearly flat (fixed cost)
                order: 12,
            }] : []),

            // ── 1. Nettoeinkommen (base line, thicker) ────────────────────
            {
                label: hasP ? 'Haushaltsnetto' : 'Nettoeinkommen',
                data: d.cum.netto,
                borderColor: this.C.netto,
                backgroundColor: 'transparent',
                borderWidth: 2.5,
                borderDash: DASH,
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: false,
                tension: 0.35,
                order: 9,
            },

            // ── 2. + Familienbonus (Steuerkredit) ─────────────────────────
            ...(d.anyFB ? [band(
                'Familienbonus (Steuerkredit)',
                d.cum.plusFamilienbonus,
                this.C.familienbonus,
                false,
                '-1'    // fill to netto
            )] : []),

            // ── 3. + Familienbeihilfe ─────────────────────────────────────
            ...(d.anyFA ? [band(
                'Familienbeihilfe',
                d.cum.plusFambeihilfe,
                this.C.familienbeihilfe,
                false,
                '-1'   // fill to plusFamilienbonus (or netto if no FB)
            )] : []),

            // ── 4. + Sozialhilfe ──────────────────────────────────────────
            ...(d.anySH ? [band(
                'Sozialhilfe',
                d.cum.plusSozialhilfe,
                this.C.sozialhilfe,
                false,
                '-1'
            )] : []),

            // ── 5. + Wohnbeihilfe ─────────────────────────────────────────
            ...(d.anyWB ? [band(
                'Wohnbeihilfe',
                d.cum.plusWohnbeihilfe,
                this.C.wohnbeihilfe,
                false,
                '-1'
            )] : []),

            // ── 6. Was bleibt (solid green, filled to origin) ─────────────
            {
                label: 'Was bleibt',
                data: d.cum.wasBleibt,
                borderColor: this.C.wasBleibt,
                backgroundColor: this.C.wasBleibtFill,
                borderWidth: 2.5,
                pointRadius: 0,
                pointHoverRadius: 5,
                fill: 'origin',
                tension: 0.35,
                order: 1,
            },
        ];

        this.chart = new Chart(canvas, {
            type: 'line',
            data: { labels: d.labels, datasets },
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
                        callbacks: {
                            title: (items) => `Brutto: € ${d.labels[items[0].dataIndex]}/Monat`,
                            label: (item) => {
                                const idx = item.dataIndex;
                                const lbl = item.dataset.label;
                                // Show the band value (difference), not cumulative
                                let val = item.raw;
                                const di = item.datasetIndex;
                                // Map dataset index to individual raw value
                                const rawMap = {
                                    'Haushaltsnetto': () => d.raw.netto[idx],
                                    'Nettoeinkommen': () => d.raw.netto[idx],
                                    'Familienbonus (Steuerkredit)': () => d.raw.familienbonus[idx],
                                    'Familienbeihilfe': () => d.raw.familienbeihilfe[idx],
                                    'Sozialhilfe': () => d.raw.sozialhilfe[idx],
                                    'Wohnbeihilfe': () => d.raw.wohnbeihilfe[idx],
                                    'Was bleibt': () => d.cum.wasBleibt[idx],
                                    'Wohnkosten': () => d.raw.wohnkosten[idx],
                                };
                                const rawFn = rawMap[lbl];
                                const displayVal = rawFn ? Math.round(rawFn()) : Math.round(val);
                                if (displayVal === 0) return null;   // hide zero rows
                                const prefix = lbl === 'Wohnkosten' ? '  −' : '  +';
                                const sign = lbl === 'Was bleibt' ? '  =' : prefix;
                                return `${sign} ${lbl}: € ${displayVal.toLocaleString('de-AT')}`;
                            },
                            afterLabel: (item) => null,
                        },
                        filter: (item) => item.formattedValue !== null && item.raw !== 0,
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

    // ─── Trap Zone Detection ──────────────────────────────────────────────────

    findTrapZones(situation) {
        const step = 100;
        const results = [], trapZones = [];
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
                    fromTotal: prev.total, toTotal: curr.total,
                    difference: prev.total - curr.total
                });
        }
        return trapZones;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = ChartManager;
