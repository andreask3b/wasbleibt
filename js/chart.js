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
            // Monatsansicht: echtes laufendes Netto wie auf der Lohnabrechnung
            // (Sonderzahlungs-Steuer wird nicht in die 12 Monate verschmiert).
            let combinedMonthlyNet = taxResult.netLaufend;

            if (situation.familyStatus === 'married' && situation.partnerIncome > 0) {
                partnerTaxResult = TaxCalculator.calculateMonthlyNet(situation.partnerIncome);
                partnerNetIncome = partnerTaxResult.netLaufend;
                combinedMonthlyNet = taxResult.netLaufend + partnerTaxResult.netLaufend;
            }

            const benefits = BenefitsCalculator.calculateAllBenefits({
                ...situation,
                monthlyGross: gross,
                monthlyNet: taxResult.netLaufend,
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

    calculateAnnualNet(taxResult) {
        if (!taxResult) return 0;

        const annualGross = taxResult.annualGross || ((taxResult.gross || 0) * 14);
        const annualSocialSecurity = taxResult.annualSocialSecurity ?? ((taxResult.socialSecurity?.total || 0) * 14);
        return Math.max(0, annualGross - annualSocialSecurity - (taxResult.annualTax || 0));
    },

    generateChartData(situation, currentGross) {
        const isYearly = situation.incomePeriod === 'yearly';
        const annualCurrentGross = (currentGross || 0) * 14;
        const annualMaxGross = Math.max(120000, Math.ceil((annualCurrentGross + 20000) / 10000) * 10000);
        const series = this.buildScenarioSeries(situation, isYearly
            ? { step: 1000 / 14, maxGross: annualMaxGross / 14 }
            : {}
        );
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
            labels.push(Math.round(isYearly ? point.gross * 14 : point.gross));

            if (isYearly) {
                const annualNetIncome = this.calculateAnnualNet(point.taxResult)
                    + this.calculateAnnualNet(point.partnerTaxResult);
                const annualTaxCredits = point.benefits.totalTaxCredits || 0;
                const annualFamilyBenefits = (point.benefits.familienbeihilfe.total + (point.benefits.familienbonus.monthlyKindermehrbetrag || 0)) * 12;
                const annualSocialBenefits = (point.benefits.sozialhilfe.amount || 0) * 12;
                const annualHousingBenefits = (point.benefits.wohnbeihilfe.amount || 0) * 12;
                const annualChildcareCosts = (point.benefits.childcareCosts?.total || 0) * 12;
                const annualHousingCosts = (situation.monthlyRent || 0) * 12;
                const annualDisposable = Math.max(
                    0,
                    annualNetIncome
                    + annualTaxCredits
                    + annualFamilyBenefits
                    + annualSocialBenefits
                    + annualHousingBenefits
                    - annualChildcareCosts
                    - annualHousingCosts
                );

                raw.netto.push(Math.round(annualNetIncome));
                raw.steuerentlastung.push(Math.round(annualTaxCredits));
                raw.familienbeihilfe.push(Math.round(annualFamilyBenefits));
                raw.sozialhilfe.push(Math.round(annualSocialBenefits));
                raw.wohnbeihilfe.push(Math.round(annualHousingBenefits));
                raw.kinderbetreuung.push(Math.round(annualChildcareCosts));
                raw.wohnkosten.push(Math.round(annualHousingCosts));
                wasBleibt.push(Math.round(annualDisposable));
            } else {
                raw.netto.push(Math.round(point.combinedMonthlyNet));
                raw.steuerentlastung.push(Math.round(point.benefits.totalTaxCredits / 12));
                raw.familienbeihilfe.push(Math.round(point.benefits.familienbeihilfe.total + (point.benefits.familienbonus.monthlyKindermehrbetrag || 0)));
                raw.sozialhilfe.push(Math.round(point.benefits.sozialhilfe.amount));
                raw.wohnbeihilfe.push(Math.round(point.benefits.wohnbeihilfe.amount));
                raw.kinderbetreuung.push(Math.round(point.benefits.childcareCosts?.total || 0));
                raw.wohnkosten.push(Math.round(situation.monthlyRent || 0));
                wasBleibt.push(Math.round(point.disposableIncome));
            }
        }

        return {
            period: isYearly ? 'yearly' : 'monthly',
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
        section.querySelectorAll('.chart-legend-panel').forEach(el => el.remove());

        const panel = document.createElement('details');
        panel.className = 'chart-legend-panel';

        const summary = document.createElement('summary');
        summary.textContent = 'Weitere Linien';

        const legend = document.createElement('div');
        legend.className = 'chart-custom-legend';

        datasets.forEach((dataset, datasetIndex) => {
            if (!dataset.label) return;
            const item = document.createElement('div');
            item.className = 'ccl-item';
            item.dataset.dsIdx = datasetIndex;
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.setAttribute('aria-pressed', dataset.hidden ? 'false' : 'true');
            if (dataset.hidden) item.classList.add('ccl-hidden');

            const isDashed = dataset.borderDash?.length > 0;
            item.innerHTML = `
                <span class="ccl-swatch${isDashed ? ' ccl-dash' : ''}"
                      style="background:${dataset.hidden ? 'transparent' : dataset.borderColor};
                             border-color:${dataset.borderColor};"></span>
                <span class="ccl-label">${dataset.label}</span>
                <span class="ccl-value" data-label="${dataset.label}"></span>
            `;

            const toggleDataset = () => {
                if (!this.chart) return;
                const meta = this.chart.getDatasetMeta(datasetIndex);
                const isHidden = meta.hidden === null ? !!dataset.hidden : !!meta.hidden;
                const nextHidden = !isHidden;
                meta.hidden = nextHidden;
                item.classList.toggle('ccl-hidden', nextHidden);
                item.setAttribute('aria-pressed', nextHidden ? 'false' : 'true');
                item.querySelector('.ccl-swatch').style.background = nextHidden ? 'transparent' : dataset.borderColor;
                this.syncYAxisBounds();
                this.chart.update();
            };

            item.addEventListener('click', toggleDataset);
            item.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleDataset();
                }
            });

            legend.appendChild(item);
        });

        panel.appendChild(summary);
        panel.appendChild(legend);
        chartContainer.insertAdjacentElement('afterend', panel);
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

        const periodSuffix = chartData.period === 'yearly' ? '/Jahr' : '/Monat';
        header.textContent = `Brutto ${format(chartData.labels[index])}${periodSuffix}`;
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

    syncYAxisBounds() {
        if (!this.chart?.options?.scales?.y) return;

        const visibleValues = [];
        this.chart.data.datasets.forEach((dataset, datasetIndex) => {
            const meta = this.chart.getDatasetMeta(datasetIndex);
            const isHidden = meta.hidden === null ? !!dataset.hidden : !!meta.hidden;
            if (isHidden) return;

            dataset.data.forEach(value => {
                const numericValue = Number(value);
                if (Number.isFinite(numericValue)) {
                    visibleValues.push(numericValue);
                }
            });
        });

        const minValue = Math.min(0, ...visibleValues);
        const maxValue = Math.max(0, ...visibleValues);

        this.chart.options.scales.y.min = minValue;
        if (maxValue <= 0) {
            this.chart.options.scales.y.max = 0;
        } else {
            delete this.chart.options.scales.y.max;
        }
    },

    createChart(canvasId, situation, currentGross) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const chartData = this.generateChartData(situation, currentGross);
        const isYearlyChart = chartData.period === 'yearly';
        canvas.setAttribute(
            'aria-label',
            isYearlyChart
                ? 'Diagramm: Jahreswerte nach Gesamtbrutto pro Jahr inklusive 13. und 14. Gehalt'
                : 'Diagramm: frei verfügbares Einkommen nach Bruttoeinkommen pro Monat'
        );
        const chartDescription = document.getElementById('chartDescriptionText');
        if (chartDescription) {
            chartDescription.textContent = isYearlyChart
                ? 'Die grüne Linie zeigt Jahreswerte: was nach Netto, Transfers, Wohnen und Kinderbetreuung pro Jahr bleibt. Das Brutto ist Gesamtbrutto inklusive 13. und 14. Gehalt.'
                : 'Die grüne Linie zeigt, was nach Wohnen und Kinderbetreuung frei verfügbar bleibt. Zusätzliche Linien können Sie bei Bedarf einblenden.';
        }
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

        const zeroBaselinePlugin = {
            id: 'zeroBaseline',
            afterDataLimits: (chart, { scale }) => {
                if (scale.id !== 'y') return;
                if (scale.min > 0) scale.min = 0;
                if (scale.max < 0) scale.max = 0;
            },
            beforeDatasetsDraw: chart => {
                const yScale = chart.scales.y;
                if (!yScale || yScale.min > 0 || yScale.max < 0) return;

                const { ctx, chartArea } = chart;
                const y = yScale.getPixelForValue(0);

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(chartArea.left, y);
                ctx.lineTo(chartArea.right, y);
                ctx.lineWidth = 1.25;
                ctx.strokeStyle = 'rgba(26, 68, 128, 0.32)';
                ctx.setLineDash([5, 4]);
                ctx.stroke();
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
            hidden: options.hidden ?? true,
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
                            text: chartData.period === 'yearly'
                                ? 'Gesamtbrutto (€/Jahr, inkl. 13./14.)'
                                : 'Bruttolohn (€/Monat)',
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
                        min: 0,
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
            plugins: [zeroBaselinePlugin, markerPlugin]
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
