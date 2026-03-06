/**
 * Chart visualization — was-bleibt.at
 *
 * Stacked line chart using Chart.js native stacking.
 * "Was bleibt" = b.disposableIncome from BenefitsCalculator (canonical source).
 * Custom HTML legend rendered INSIDE the chart container as an overlay.
 *
 * Colors mirror css/variables.css --c-* exactly.
 */

const ChartManager = {
    chart: null,
    _legendEl: null,
    _legendMeta: null,

    // Canonical colors — must match css/variables.css --c-*
    C: {
        netto: '#1d9bf0',
        familienbonus: '#60b4f8',
        familienbeihilfe: '#4f46e5',
        sozialhilfe: '#ef4444',
        wohnbeihilfe: '#f59e0b',
        wasBleibt: '#16a34a',
        wasBleibtFill: 'rgba(22,163,74,0.13)',
        wohnkosten: '#f87171',
        wohnkostenFill: 'rgba(248,113,113,0.15)',
        marker: '#1a4480',
    },

    // ─── Data Generation ─────────────────────────────────────────────────────

    generateChartData(situation, currentGross) {
        const STEP = 100;
        const MAX = Math.max(6000, Math.ceil(currentGross / 1000) * 1000 + 1000);
        const labels = [];
        const raw = {
            netto: [], familienbonus: [], familienbeihilfe: [],
            sozialhilfe: [], wohnbeihilfe: [], wohnkosten: [],
        };
        const wasBleibt = [];

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
                annualTax: tax.annualTax,
            });

            // Base netto (combined, before any tax credits)
            raw.netto.push(Math.round(combinedNet));

            // Familienbonus = total tax credit / 12 (AVAB + Familienbonus Plus)
            // minus Kindermehrbetrag (which we count with Familienbeihilfe)
            const taxCreditMonthly = b.totalTaxCredits / 12;
            const kmb = b.familienbonus.monthlyKindermehrbetrag || 0;
            raw.familienbonus.push(Math.max(0, Math.round(taxCreditMonthly - kmb)));

            // Familienbeihilfe + Kindermehrbetrag
            raw.familienbeihilfe.push(Math.round(b.familienbeihilfe.total + kmb));

            raw.sozialhilfe.push(Math.round(b.sozialhilfe.amount));
            raw.wohnbeihilfe.push(Math.round(b.wohnbeihilfe.amount));
            raw.wohnkosten.push(situation.monthlyRent || 0);

            // Use the CANONICAL disposableIncome from BenefitsCalculator
            wasBleibt.push(Math.round(b.disposableIncome));
        }

        return {
            labels, raw, wasBleibt,
            anyFB: raw.familienbonus.some(v => v > 0),
            anyFA: raw.familienbeihilfe.some(v => v > 0),
            anySH: raw.sozialhilfe.some(v => v > 0),
            anyWB: raw.wohnbeihilfe.some(v => v > 0),
            anyWK: raw.wohnkosten.some(v => v > 0),
            currentIndex: Math.round(currentGross / STEP),
            situation,
        };
    },

    // ─── Custom HTML Legend (inside chart container) ──────────────────────────

    _renderCustomLegend(chartContainer, datasets, legendMeta) {
        // Remove old legend if present
        chartContainer.querySelectorAll('.chart-custom-legend').forEach(el => el.remove());

        const legend = document.createElement('div');
        legend.className = 'chart-custom-legend';

        datasets.forEach((ds, dsIdx) => {
            if (!ds.label) return;
            const item = document.createElement('div');
            item.className = 'ccl-item';
            item.dataset.dsIdx = dsIdx;
            if (ds.hidden) item.classList.add('ccl-hidden');

            const isDashed = ds.borderDash?.length > 0;
            item.innerHTML = `
                <span class="ccl-swatch${isDashed ? ' ccl-dash' : ''}"
                      style="background:${ds.hidden ? 'transparent' : ds.borderColor};
                             border-color:${ds.borderColor};"></span>
                <span class="ccl-label">${ds.label}</span>
                <span class="ccl-value" data-label="${ds.label}"></span>
            `;

            item.addEventListener('click', () => {
                if (!this.chart) return;
                const meta = this.chart.getDatasetMeta(dsIdx);
                meta.hidden = !meta.hidden;
                item.classList.toggle('ccl-hidden', !!meta.hidden);
                item.querySelector('.ccl-swatch').style.background =
                    meta.hidden ? 'transparent' : ds.borderColor;
                this.chart.update();
            });

            legend.appendChild(item);
        });

        // Insert inside the chart-container (as overlay)
        chartContainer.appendChild(legend);
        this._legendEl = legend;
        this._legendMeta = legendMeta;
    },

    _updateLegendValues(d, index) {
        if (!this._legendEl) return;
        const fmt = v => '€\u202f' + Math.round(Math.abs(v)).toLocaleString('de-AT');

        // Show gross value header
        let header = this._legendEl.querySelector('.ccl-gross');
        if (!header) {
            header = document.createElement('div');
            header.className = 'ccl-gross';
            this._legendEl.prepend(header);
        }
        header.textContent = `Brutto ${fmt(d.labels[index])}/Monat`;
        header.style.display = '';

        this._legendEl.querySelectorAll('.ccl-value').forEach(cell => {
            const fn = this._legendMeta?.[cell.dataset.label];
            const v = fn ? fn(index) : null;
            if (v === null || v === undefined || v === 0) {
                cell.textContent = '';
                cell.classList.remove('ccl-value--active');
                return;
            }
            const lbl = cell.dataset.label;
            const sign = lbl === 'Wohnkosten' ? '−' : (lbl === 'Was bleibt' ? '' : '+');
            cell.textContent = `${sign}${fmt(v)}`;
            cell.classList.add('ccl-value--active');
        });
    },

    _clearLegendValues() {
        if (!this._legendEl) return;
        const header = this._legendEl.querySelector('.ccl-gross');
        if (header) header.style.display = 'none';
        this._legendEl.querySelectorAll('.ccl-value').forEach(cell => {
            cell.textContent = '';
            cell.classList.remove('ccl-value--active');
        });
    },

    // ─── Chart Creation ───────────────────────────────────────────────────────

    createChart(canvasId, situation, currentGross) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const d = this.generateChartData(situation, currentGross);
        if (this.chart) { this.chart.destroy(); this.chart = null; }

        const hasP = situation.familyStatus === 'married' && situation.partnerIncome > 0;
        const DASH = [5, 4];

        // ── "Ihr Einkommen" vertical dashed marker ─────────────────────────
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
                const pad = 7, rh = 20, ry = top + 6;
                const rx = x - tw / 2 - pad, rw = tw + pad * 2;
                ctx.fillStyle = this.C.marker;
                ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 4); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(lbl, x, ry + rh / 2);
                ctx.restore();
            },
        };

        // ── Axis-sync plugin removed — all on same y axis now ──────────

        // ── Dataset helpers ────────────────────────────────────────────────
        const bandDs = (label, data, color, hidden = false) => ({
            label, data,
            yAxisID: 'y', stack: 'bands',
            borderColor: color,
            backgroundColor: color + '28',
            borderWidth: 1.5, borderDash: DASH,
            pointRadius: 0, pointHoverRadius: 3,
            fill: true,
            tension: 0.35,
            hidden, order: 5,
        });

        const datasets = [
            // Nettoeinkommen — thicker dashed base
            {
                label: hasP ? 'Haushaltsnetto' : 'Nettoeinkommen',
                data: d.raw.netto,
                yAxisID: 'y', stack: 'bands',
                borderColor: this.C.netto,
                backgroundColor: this.C.netto + '28',
                borderWidth: 2.5, borderDash: DASH,
                pointRadius: 0, pointHoverRadius: 4,
                fill: true, tension: 0.35, order: 5,
            },
            ...(d.anyFB ? [bandDs('Familienbonus (Steuerkredit)', d.raw.familienbonus, this.C.familienbonus)] : []),
            ...(d.anyFA ? [bandDs('Familienbeihilfe', d.raw.familienbeihilfe, this.C.familienbeihilfe)] : []),
            ...(d.anySH ? [bandDs('Sozialhilfe', d.raw.sozialhilfe, this.C.sozialhilfe)] : []),
            ...(d.anyWB ? [bandDs('Wohnbeihilfe', d.raw.wohnbeihilfe, this.C.wohnbeihilfe)] : []),

            // Wohnkosten — negative band
            ...(d.anyWK ? [{
                label: 'Wohnkosten',
                data: d.raw.wohnkosten.map(v => -v),
                yAxisID: 'y', stack: 'bands',
                borderColor: this.C.wohnkosten,
                backgroundColor: this.C.wohnkostenFill,
                borderWidth: 1.5, borderDash: DASH,
                pointRadius: 0, pointHoverRadius: 3,
                fill: true, tension: 0.1, order: 6,
            }] : []),

            // Was bleibt — solid green, NOT stacked (no stack property)
            {
                label: 'Was bleibt',
                data: d.wasBleibt,
                yAxisID: 'y',
                // No 'stack' property → renders independently of stacked bands
                borderColor: this.C.wasBleibt,
                backgroundColor: this.C.wasBleibtFill,
                borderWidth: 2.5,
                pointRadius: 0, pointHoverRadius: 5,
                fill: 'origin',
                tension: 0.35, order: 1,
            },
        ];

        // ── Legend meta: raw value functions per label ─────────────────────
        const nettoLabel = hasP ? 'Haushaltsnetto' : 'Nettoeinkommen';
        const legendMeta = {
            [nettoLabel]: idx => d.raw.netto[idx],
            'Familienbonus (Steuerkredit)': idx => d.raw.familienbonus[idx],
            'Familienbeihilfe': idx => d.raw.familienbeihilfe[idx],
            'Sozialhilfe': idx => d.raw.sozialhilfe[idx],
            'Wohnbeihilfe': idx => d.raw.wohnbeihilfe[idx],
            'Wohnkosten': idx => d.raw.wohnkosten[idx],
            'Was bleibt': idx => d.wasBleibt[idx],
        };

        // ── Build custom legend INSIDE chart-container ─────────────────────
        const chartContainer = canvas.closest('.chart-container') || canvas.parentElement;
        this._renderCustomLegend(chartContainer, datasets, legendMeta);

        this.chart = new Chart(canvas, {
            type: 'line',
            data: { labels: d.labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 250 },
                layout: {
                    padding: { bottom: 0 },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: false,
                        external: (context) => {
                            const tt = context.tooltip;
                            if (tt.opacity === 0 || !tt.dataPoints?.length) {
                                // Don't clear immediately — leave last hover values visible
                                return;
                            }
                            this._updateLegendValues(d, tt.dataPoints[0].dataIndex);
                        },
                    },
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Bruttolohn (€/Monat)',
                            color: '#94a3b8', font: { size: 11 },
                        },
                        ticks: {
                            color: '#94a3b8', maxRotation: 0, font: { size: 10 },
                            callback: (val, idx) => idx % 5 === 0 ? '€' + d.labels[idx] : '',
                        },
                        grid: { color: 'rgba(0,0,0,0.04)' },
                    },
                    y: {
                        stacked: true,
                        position: 'left',
                        ticks: {
                            color: '#94a3b8', font: { size: 10 },
                            callback: v => '€' + v.toLocaleString('de-AT'),
                        },
                        grid: { color: 'rgba(0,0,0,0.04)' },
                    },
                },
                interaction: { mode: 'index', intersect: false },
            },
            plugins: [markerPlugin],
        });
    },

    // ─── Trap Zone Detection ──────────────────────────────────────────────────

    findTrapZones(situation) {
        const step = 100;
        const grossInput = situation.monthlyGross || 0;
        const MAX = Math.max(6000, Math.ceil(grossInput / 1000) * 1000 + 1000);
        const results = [], trapZones = [];

        for (let gross = 0; gross <= MAX; gross += step) {
            const tax = TaxCalculator.calculateMonthlyNet(gross);
            let partnerNet = 0, combinedNet = tax.net;
            if (situation.familyStatus === 'married' && situation.partnerIncome > 0) {
                const p = TaxCalculator.calculateMonthlyNet(situation.partnerIncome);
                partnerNet = p.net; combinedNet = tax.net + p.net;
            }
            const b = BenefitsCalculator.calculateAllBenefits({
                ...situation, monthlyGross: gross, monthlyNet: tax.net,
                partnerNetIncome: partnerNet, combinedMonthlyNet: combinedNet,
                annualTax: tax.annualTax,
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
    },
};

if (typeof module !== 'undefined' && module.exports) module.exports = ChartManager;
