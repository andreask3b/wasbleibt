const RecommendationsManager = {
    generateRecommendations(formData, taxResult, benefits) {
        const container = document.getElementById('recommendationsContent');
        if (!container) return;

        const series = ChartManager.buildScenarioSeries(formData);
        const currentIndex = Math.max(0, Math.min(series.points.length - 1, Math.round(formData.monthlyGross / series.step)));
        const currentPoint = series.points[currentIndex];
        const nextPoint = series.points[Math.min(currentIndex + 1, series.points.length - 1)];
        const previousPoint = series.points[Math.max(currentIndex - 1, 0)];
        const comparisonPoint = nextPoint.gross > currentPoint.gross ? nextPoint : previousPoint;
        const grossDelta = Math.abs(comparisonPoint.gross - currentPoint.gross) || series.step;
        const disposableDeltaRaw = comparisonPoint.gross >= currentPoint.gross
            ? comparisonPoint.disposableIncome - currentPoint.disposableIncome
            : currentPoint.disposableIncome - comparisonPoint.disposableIncome;
        const disposableDeltaPer100 = grossDelta > 0 ? (disposableDeltaRaw / grossDelta) * 100 : 0;
        const marginalBurden = grossDelta > 0 ? 1 - (disposableDeltaRaw / grossDelta) : 0;
        const breakEvenPoint = this.findBreakEvenPoint(series.points);
        const trapZones = ChartManager.findTrapZones(formData);
        const currentTrap = trapZones.find(zone =>
            formData.monthlyGross >= zone.fromGross && formData.monthlyGross <= zone.toGross + series.step
        );
        const reentryDelta = this.calculateReentryDelta(formData, taxResult, benefits);

        const cards = [
            this.buildIncrementCard(disposableDeltaPer100),
            this.buildMarginalBurdenCard(marginalBurden),
            this.buildBreakEvenCard(formData, breakEvenPoint)
        ];

        if (currentTrap) {
            cards.push(this.buildTrapCard(currentTrap));
        }

        if (formData.monthlyGross > 0 && Math.abs(reentryDelta) > 1) {
            cards.push(this.buildReentryCard(formData, reentryDelta));
        } else if (!currentTrap) {
            cards.push({
                type: 'positive',
                icon: 'OK',
                tag: 'Stabil',
                title: 'Keine aktuelle Trap-Zone',
                metric: this.formatCurrency(currentPoint.disposableIncome),
                text: 'In Ihrer aktuellen Zone steigt das frei verfügbare Einkommen mit zusätzlichem Brutto zumindest nicht mehr rückwärts.'
            });
        }

        container.innerHTML = cards.map(card => `
            <div class="recommendation-card ${card.type}">
                <span class="rec-icon">${card.icon}</span>
                <div class="rec-content">
                    <div class="rec-tag">${card.tag}</div>
                    <h4>${card.title}</h4>
                    <div class="rec-metric">${card.metric}</div>
                    <p>${card.text}</p>
                </div>
            </div>
        `).join('');
    },

    buildIncrementCard(disposableDeltaPer100) {
        const type = disposableDeltaPer100 < 0 ? 'danger' : disposableDeltaPer100 < 20 ? 'warning' : disposableDeltaPer100 < 50 ? 'info' : 'positive';
        const tag = disposableDeltaPer100 < 0 ? 'Armutsfalle' : disposableDeltaPer100 < 20 ? 'Kaum Anreiz' : disposableDeltaPer100 < 50 ? 'Mäßiger Anreiz' : 'Lohnend';
        const metricPrefix = disposableDeltaPer100 >= 0 ? '+' : '';

        return {
            type,
            icon: '+100',
            tag,
            title: 'Nächste 100 € brutto',
            metric: `${metricPrefix}${this.formatCurrency(disposableDeltaPer100)}`,
            text: `Von zusätzlichen 100 € brutto kommen aktuell nur ${this.formatCurrency(Math.max(0, disposableDeltaPer100))} frei verfügbar an. ${disposableDeltaPer100 < 0 ? 'Mehr Arbeit verschlechtert Ihre Lage.' : ''}`
        };
    },

    buildMarginalBurdenCard(marginalBurden) {
        const burdenPercent = Math.round(marginalBurden * 100);
        const type = burdenPercent > 100 ? 'danger' : burdenPercent >= 80 ? 'warning' : burdenPercent >= 50 ? 'info' : 'positive';
        const tag = burdenPercent > 100 ? 'Arbeit kostet' : burdenPercent >= 80 ? 'Hoher Entzug' : burdenPercent >= 50 ? 'Spürbarer Entzug' : 'Arbeitsanreiz';

        return {
            type,
            icon: 'EMTR',
            tag,
            title: 'Effektive Grenzbelastung',
            metric: `${burdenPercent} %`,
            text: burdenPercent > 100
                ? 'Die Kombination aus Abgaben, Leistungsentzug und Fixkosten frisst mehr weg als hinzukommt.'
                : 'So viel vom nächsten Euro Brutto geht durch Abgaben und wegfallende Leistungen verloren.'
        };
    },

    buildBreakEvenCard(formData, breakEvenPoint) {
        if (!breakEvenPoint) {
            return {
                type: 'warning',
                icon: '≈',
                tag: 'Noch offen',
                title: 'Besser als ohne Arbeit',
                metric: 'Noch nicht erreicht',
                text: 'Im aktuell berechneten Bereich liegt das frei verfügbare Einkommen noch nicht klar über dem Niveau ohne Erwerbseinkommen.'
            };
        }

        const difference = breakEvenPoint.gross - formData.monthlyGross;
        const detail = difference > 0
            ? `Von Ihrer aktuellen Eingabe fehlen noch etwa ${this.formatCurrency(difference)} brutto pro Monat.`
            : 'Sie liegen bereits über dem Niveau ohne Erwerbseinkommen.';

        return {
            type: difference > 0 ? 'info' : 'positive',
            icon: '↗',
            tag: 'Schwelle',
            title: 'Besser als ohne Erwerbsarbeit',
            metric: this.formatCurrency(breakEvenPoint.gross),
            text: `${detail} Entscheidend ist der Vergleich mit dem frei verfügbaren Einkommen bei 0 € Brutto.`
        };
    },

    buildTrapCard(trap) {
        return {
            type: 'danger',
            icon: '−',
            tag: 'Armutsfalle',
            title: 'Ihre aktuelle Zone frisst Einkommen',
            metric: `−${this.formatCurrency(trap.difference)}`,
            text: `Zwischen ${this.formatCurrency(trap.fromGross)} und ${this.formatCurrency(trap.toGross)} brutto fällt das frei verfügbare Einkommen statt zu steigen.`
        };
    },

    buildReentryCard(formData, reentryDelta) {
        const isActive = !!formData.wiedereinsteiger;
        const type = isActive ? 'warning' : reentryDelta > 200 ? 'positive' : reentryDelta > 0 ? 'info' : 'warning';
        const title = isActive ? 'Wenn der Freibetrag endet' : 'Mit Wiedereinsteigerfreibetrag';
        const metric = `${reentryDelta >= 0 ? '+' : ''}${this.formatCurrency(reentryDelta)}`;
        const text = isActive
            ? `Fällt der Freibetrag weg, sinkt Ihr frei verfügbares Einkommen ungefähr um ${this.formatCurrency(Math.abs(reentryDelta))} pro Monat.`
            : `Mit dem Freibetrag hätten Sie ungefähr ${this.formatCurrency(Math.abs(reentryDelta))} mehr frei verfügbar pro Monat.`;

        return {
            type,
            icon: '35%',
            tag: isActive ? 'Befristet' : 'Hebel',
            title,
            metric,
            text
        };
    },

    calculateReentryDelta(formData, taxResult, benefits) {
        if (formData.monthlyGross <= 0) {
            return 0;
        }

        const toggledFormData = {
            ...formData,
            wiedereinsteiger: !formData.wiedereinsteiger
        };

        let partnerNetIncome = 0;
        let combinedMonthlyNet = taxResult.net;

        if (formData.familyStatus === 'married' && formData.partnerIncome > 0) {
            const partnerTaxResult = TaxCalculator.calculateMonthlyNet(formData.partnerIncome);
            partnerNetIncome = partnerTaxResult.net;
            combinedMonthlyNet += partnerTaxResult.net;
        }

        const alternativeBenefits = BenefitsCalculator.calculateAllBenefits({
            ...toggledFormData,
            monthlyNet: taxResult.net,
            partnerNetIncome,
            combinedMonthlyNet,
            annualTax: taxResult.annualTax
        });

        return formData.wiedereinsteiger
            ? alternativeBenefits.disposableIncome - benefits.disposableIncome
            : alternativeBenefits.disposableIncome - benefits.disposableIncome;
    },

    findBreakEvenPoint(points) {
        if (!points.length) return null;
        const baseline = points[0].disposableIncome;
        return points.find(point => point.gross > 0 && point.disposableIncome >= baseline + 25) || null;
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RecommendationsManager;
}
