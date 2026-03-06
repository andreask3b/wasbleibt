const ChartManager = {
    chart: null,
    _legendEl: null,
    _legendMeta: null,
    _stylesInjected: false,

    C: {
        netto: '#1d9bf0',
        steuerentlastung: '#60b4f8',
        familienbeihilfe: '#4f46e5',
        sozialhilfe: '#ef4444',
        wohnbeihilfe: '#f59e0b',
        kinderbetreuung: '#f97316',
        wasBleibt: '#16a34a',
        wasBleibtFill: 'rgba(22,163,74,0.13)',
        wohnkosten: '#f87171',
        wohnkostenFill: 'rgba(248,113,113,0.15)',
        marker: '#1a4480'
    },

    _injectStyles() {
        if (this._stylesInjected) return;
        this._stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
.chart-custom-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 6px 16px;
    padding: 10px 4px 16px;
    font-size: 0.78rem;
    color: #718096;
}
.ccl-gross {
    width: 100%;
    text-align: center;
    font-size: 0.72rem;
    font-weight: 600;
    color: #94a3b8;
    letter-spacing: 0.02em;
    margin-bottom: 2px;
    display: none;
}
.ccl-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    padding: 3px 6px;
    border-radius: 4px;
    transition: background 0.15s;
    user-select: none;
}
.ccl-item:hover { background: rgba(0,0,0,0.05); }
.ccl-item.ccl-hidden { opacity: 0.35; }
.ccl-swatch {
    display: inline-block;
    width: 22px;
    height: 3px;
    border-radius: 2px;
    flex-shrink: 0;
}
.ccl-dash {
    background: transparent !important;
    border-top: 2px dashed;
    height: 0;
}
.ccl-label {
    color: #718096;
    white-space: nowrap;
    font-size: 0.78rem;
}
.ccl-value {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: #94a3b8;
    font-size: 0.78rem;
    white-space: nowrap;
    transition: color 0.15s;
}
.ccl-value--active { color: #1b1b1b; }
`;
        document.head.appendChild(style);
    },

    buildScenarioSeries(situation, options = {}) {
        const step = options.step || 100;
        const currentGross = situation.monthlyGross || 0;
        const maxGross = options.maxGross || Math.max(6000, Math.ceil(currentGross / 1000) * 1000 + 1500);
        const points = [];

        for (let gross = 0; gross <= maxGross; gross += step) {
            const taxResult = TaxCalculator.calculateMonthlyNet(gross);
            let partnerTaxResult = null;
            let partnerNetIncome = 0;
            let combinedMonthlyNet = taxResult.net;

            if (situation.familyStatus === 'married' && situation.partnerIncome > 0) {
                partnerTaxResult = TaxCalculator.calculateMonthlyNet(situation.partnerIncome);
                partnerNetIncome = partnerTaxResult.net;
                combinedMonthlyNet = taxResult.net + partnerTaxResult.net;
            }

            const benefits = BenefitsCalculator.calculateAllBenefits({
                ...situation,
                monthlyGross: gross,
                monthlyNet: taxResult.net,
                partnerNetIncome,
                combinedMonthlyNet,
                annualTax: taxResult.annualTax
            });

            points.push({
                gross,
                taxResult,
                partnerTaxResult,
                partnerNetIncome,
                combinedMonthlyNet,
                benefits,
                totalHouseholdIncome: benefits.totalHouseholdIncome,
                disposableIncome: benefits.disposableIncome
            });
        }

        return {
            step,
            maxGross,
            currentIndex: Math.round(currentGross / step),
            points
        };
    },

    generateChartData(situation, currentGross) {
        const series = this.buildScenarioSeries(situation);
        const labels = [];
        const raw = {
            netto: [],
            steuerentlastung: [],
            familienbeihilfe: [],
            sozialhilfe: [],
            wohnbeihilfe: [],
            kinderbetreuung: [],
            wohnkosten: []
        };
        const wasBleibt = [];

        for (const point of series.points) {
            labels.push(point.gross);
            raw.netto.push(Math.round(point.combinedMonthlyNet));
            raw.steuerentlastung.push(Math.round(point.benefits.totalTaxCredits / 12));
            raw.familienbeihilfe.push(Math.round(point.benefits.familienbeihilfe.total + (point.benefits.familienbonus.monthlyKindermehrbetrag || 0)));
            raw.sozialhilfe.push(Math.round(point.benefits.sozialhilfe.amount));
            raw.wohnbeihilfe.push(Math.round(point.benefits.wohnbeihilfe.amount));
            raw.kinderbetreuung.push(Math.round(point.benefits.childcareCosts?.total || 0));
            raw.wohnkosten.push(Math.round(situation.monthlyRent || 0));
            wasBleibt.push(Math.round(point.disposableIncome));
        }

        return {
            labels,
            raw,
            wasBleibt,
            anySteuerentlastung: raw.steuerentlastung.some(value => value > 0),
            anyFamilienbeihilfe: raw.familienbeihilfe.some(value => value > 0),
            anySozialhilfe: raw.sozialhilfe.some(value => value > 0),
            anyWohnbeihilfe: raw.wohnbeihilfe.some(value => value > 0),
            anyKinderbetreuung: raw.kinderbetreuung.some(value => value > 0),
            anyWohnkosten: raw.wohnkosten.some(value => value > 0),
            currentIndex: Math.min(series.currentIndex, labels.length - 1),
            step: series.step,
            series
        };
    },

    _renderCustomLegend(chartContainer, datasets, legendMeta) {
        this._injectStyles();
        const section = chartContainer.closest('section') || chartContainer.parentElement;
        section.querySelectorAll('.chart-custom-legend').forEach(el => el.remove());

        const legend = document.createElement('div');
        legend.className = 'chart-custom-legend';

        datasets.forEach((dataset, datasetIndex) => {
            if (!dataset.label) return;
            const item = document.createElement('div');
            item.className = 'ccl-item';
            item.dataset.dsIdx = datasetIndex;
            if (dataset.hidden) item.classList.add('ccl-hidden');

            const isDashed = dataset.borderDash?.length > 0;
            item.innerHTML = `
                <span class="ccl-swatch${isDashed ? ' ccl-dash' : ''}"
                      style="background:${dataset.hidden ? 'transparent' : dataset.borderColor};
                             border-color:${dataset.borderColor};"></span>
                <span class="ccl-label">${dataset.label}</span>
                <span class="ccl-value" data-label="${dataset.label}"></span>
            `;

            item.addEventListener('click', () => {
                if (!this.chart) return;
                const meta = this.chart.getDatasetMeta(datasetIndex);
                meta.hidden = !meta.hidden;
                item.classList.toggle('ccl-hidden', !!meta.hidden);
                item.querySelector('.ccl-swatch').style.background = meta.hidden ? 'transparent' : dataset.borderColor;
                this.chart.update();
            });

            legend.appendChild(item);
        });

        chartContainer.insertAdjacentElement('afterend', legend);
        this._legendEl = legend;
        this._legendMeta = legendMeta;
    },

    _updateLegendValues(chartData, index) {
        if (!this._legendEl) return;

        const format = value => '€\u202f' + Math.round(Math.abs(value)).toLocaleString('de-AT');
        let header = this._legendEl.querySelector('.ccl-gross');
        if (!header) {
            header = document.createElement('div');
            header.className = 'ccl-gross';
            this._legendEl.prepend(header);
        }

        header.textContent = `Brutto ${format(chartData.labels[index])}/Monat`;
        header.style.display = '';

        this._legendEl.querySelectorAll('.ccl-value').forEach(cell => {
            const valueFactory = this._legendMeta?.[cell.dataset.label];
            const value = valueFactory ? valueFactory(index) : null;

            if (!value) {
                cell.textContent = '';
                cell.classList.remove('ccl-value--active');
                return;
            }

            const sign = ['Wohnkosten', 'Kinderbetreuung'].includes(cell.dataset.label) ? '−' : (cell.dataset.label === 'Was bleibt' ? '' : '+');
            cell.textContent = `${sign}${format(value)}`;
            cell.classList.add('ccl-value--active');
        });
    },

    createChart(canvasId, situation, currentGross) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const chartData = this.generateChartData(situation, currentGross);
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }

        const hasPartner = situation.familyStatus === 'married' && situation.partnerIncome > 0;
        const dash = [5, 4];

        const markerPlugin = {
            id: 'verticalLine',
            afterDraw: chart => {
                const index = chartData.currentIndex;
                if (index < 0 || index >= chart.data.labels.length) return;

                const ctx = chart.ctx;
                const x = chart.scales.x.getPixelForValue(index);
                const { top, bottom } = chart.scales.y;

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, top);
                ctx.lineTo(x, bottom);
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = this.C.marker;
                ctx.setLineDash(dash);
                ctx.stroke();
                ctx.setLineDash([]);

                const label = 'Ihre Eingabe';
                ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
                const textWidth = ctx.measureText(label).width;
                const padding = 7;
                const rectHeight = 20;
                const rectY = top + 6;
                const rectX = x - textWidth / 2 - padding;
                const rectWidth = textWidth + padding * 2;

                ctx.fillStyle = this.C.marker;
                ctx.beginPath();
                ctx.roundRect(rectX, rectY, rectWidth, rectHeight, 4);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, x, rectY + rectHeight / 2);
                ctx.restore();
            }
        };

        const bandDataset = (label, data, color, options = {}) => ({
            label,
            data,
            yAxisID: 'y',
            stack: options.stack || 'bands',
            borderColor: color,
            backgroundColor: options.backgroundColor || `${color}28`,
            borderWidth: options.borderWidth || 1.5,
            borderDash: options.dashed === false ? [] : dash,
            pointRadius: 0,
            pointHoverRadius: 3,
            fill: true,
            tension: options.tension ?? 0.35,
            hidden: !!options.hidden,
            order: options.order ?? 5
        });

        const datasets = [
            bandDataset(hasPartner ? 'Haushaltsnetto' : 'Nettoeinkommen', chartData.raw.netto, this.C.netto, { borderWidth: 2.5 }),
            ...(chartData.anySteuerentlastung ? [bandDataset('Steuerentlastung Familie', chartData.raw.steuerentlastung, this.C.steuerentlastung)] : []),
            ...(chartData.anyFamilienbeihilfe ? [bandDataset('Familienbeihilfe', chartData.raw.familienbeihilfe, this.C.familienbeihilfe)] : []),
            ...(chartData.anySozialhilfe ? [bandDataset('Sozialhilfe', chartData.raw.sozialhilfe, this.C.sozialhilfe)] : []),
            ...(chartData.anyWohnbeihilfe ? [bandDataset('Wohnbeihilfe', chartData.raw.wohnbeihilfe, this.C.wohnbeihilfe)] : []),
            ...(chartData.anyKinderbetreuung ? [bandDataset('Kinderbetreuung', chartData.raw.kinderbetreuung.map(value => -value), this.C.kinderbetreuung, {
                backgroundColor: `${this.C.kinderbetreuung}25`,
                tension: 0.1,
                order: 6
            })] : []),
            ...(chartData.anyWohnkosten ? [bandDataset('Wohnkosten', chartData.raw.wohnkosten.map(value => -value), this.C.wohnkosten, {
                backgroundColor: this.C.wohnkostenFill,
                tension: 0.1,
                order: 6
            })] : []),
            {
                label: 'Was bleibt',
                data: chartData.wasBleibt,
                yAxisID: 'y',
                borderColor: this.C.wasBleibt,
                backgroundColor: this.C.wasBleibtFill,
                borderWidth: 2.5,
                pointRadius: 0,
                pointHoverRadius: 5,
                fill: 'origin',
                tension: 0.35,
                order: 1
            }
        ];

        const nettoLabel = hasPartner ? 'Haushaltsnetto' : 'Nettoeinkommen';
        const legendMeta = {
            [nettoLabel]: index => chartData.raw.netto[index],
            'Steuerentlastung Familie': index => chartData.raw.steuerentlastung[index],
            Familienbeihilfe: index => chartData.raw.familienbeihilfe[index],
            Sozialhilfe: index => chartData.raw.sozialhilfe[index],
            Wohnbeihilfe: index => chartData.raw.wohnbeihilfe[index],
            Kinderbetreuung: index => chartData.raw.kinderbetreuung[index],
            Wohnkosten: index => chartData.raw.wohnkosten[index],
            'Was bleibt': index => chartData.wasBleibt[index]
        };

        const chartContainer = canvas.closest('.chart-container') || canvas.parentElement;
        this._renderCustomLegend(chartContainer, datasets, legendMeta);

        this.chart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 250 },
                layout: {
                    padding: { bottom: 0 }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: false,
                        external: context => {
                            const tooltip = context.tooltip;
                            if (!tooltip?.dataPoints?.length || tooltip.opacity === 0) return;
                            this._updateLegendValues(chartData, tooltip.dataPoints[0].dataIndex);
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
                            color: '#94a3b8',
                            maxRotation: 0,
                            font: { size: 10 },
                            callback: (value, index) => index % 5 === 0 ? `€${chartData.labels[index]}` : ''
                        },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    },
                    y: {
                        stacked: true,
                        position: 'left',
                        ticks: {
                            color: '#94a3b8',
                            font: { size: 10 },
                            callback: value => `€${value.toLocaleString('de-AT')}`
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
        const series = this.buildScenarioSeries(situation);
        const trapZones = [];

        for (let index = 1; index < series.points.length; index += 1) {
            const previous = series.points[index - 1];
            const current = series.points[index];

            if (current.disposableIncome <= previous.disposableIncome && current.gross > previous.gross) {
                trapZones.push({
                    fromGross: previous.gross,
                    toGross: current.gross,
                    fromDisposable: previous.disposableIncome,
                    toDisposable: current.disposableIncome,
                    difference: previous.disposableIncome - current.disposableIncome
                });
            }
        }

        return trapZones;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChartManager;
}
