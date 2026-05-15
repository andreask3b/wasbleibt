/**
 * Austrian Tax Calculator (2025)
 * Core calculation logic for income tax and social security
 * 
 * Sources:
 * - Lohnsteuer: https://www.bmf.gv.at/themen/steuern/arbeitnehmerinnenveranlagung/steuertarif-steuerabsetzbetraege.html
 * - Sozialversicherung: https://www.gesundheitskasse.at/cdscontent/?contentid=10007.897029
 * - ALV-Staffelung: https://www.oesterreich.gv.at/themen/arbeit_und_pension/arbeitslos_gemeldet/3/Seite.320222.html
 */

const TaxCalculator = {
    // 2025 Austrian income tax brackets (annual taxable income after SV deduction)
    // Source: https://www.bmf.gv.at/themen/steuern/arbeitnehmerinnenveranlagung/steuertarif-steuerabsetzbetraege.html
    TAX_BRACKETS_2025: [
        { min: 0, max: 13308, rate: 0 },
        { min: 13308, max: 21617, rate: 0.20 },
        { min: 21617, max: 35836, rate: 0.30 },
        { min: 35836, max: 69166, rate: 0.40 },
        { min: 69166, max: 103072, rate: 0.48 },
        { min: 103072, max: 1000000, rate: 0.50 },
        { min: 1000000, max: Infinity, rate: 0.55 }
    ],

    // Social security contribution rates (employee share)
    // Source: https://www.gesundheitskasse.at/cdscontent/?contentid=10007.897029
    SOCIAL_SECURITY: {
        health: 0.0387,          // Krankenversicherung (3,87%)
        pension: 0.1025,         // Pensionsversicherung (10,25%)
        unemployment: 0.0295,    // Arbeitslosenversicherung Standard (2,95%)
        other: 0.0125,           // Umlagen nur auf den laufenden Bezug (AK-Umlage, Wohnbauförderungsbeitrag u. a.); kalibriert am AK-Brutto-Netto-Rechner 2025
        maxMonthlyBase: 6930,    // Höchstbeitragsgrundlage 2025 (monatlich)
        minMonthlyBase: 1500     // Mindestbeitragsgrundlage 2025 (nicht verwendet)
    },

    // Gestaffelte ALV-Beiträge für Geringverdiener 2025
    // Source: https://www.oesterreich.gv.at/themen/arbeit_und_pension/arbeitslos_gemeldet/3/Seite.320222.html
    ALV_GRADUATED_RATES: [
        { max: 2074, rate: 0 },      // bis 2.074 € = 0%
        { max: 2262, rate: 0.01 },   // 2.074 - 2.262 € = 1%
        { max: 2451, rate: 0.02 },   // 2.262 - 2.451 € = 2%
        { max: Infinity, rate: 0.0295 }  // über 2.451 € = 2,95%
    ],

    // Geringfügigkeitsgrenze 2025
    // Source: https://www.gesundheitskasse.at/cdscontent/?contentid=10007.897029
    MARGINAL_INCOME_THRESHOLD: 551.10,

    // Absetzbeträge 2025
    // Source: https://www.bmf.gv.at/themen/steuern/arbeitnehmerinnenveranlagung/steuertarif-steuerabsetzbetraege.html
    TAX_CREDITS: {
        verkehrsabsetzbetrag: 487,      // für alle Arbeitnehmer (€487/Jahr)
        sonderzahlungenFreibetrag: 620  // Freibetrag für 13./14. Gehalt (€620)
        // Source Sonderzahlungen: https://www.wko.at/steuern/lohnsteuer-sonderzahlungen
    },

    /**
     * Get ALV rate based on monthly gross income (graduated for low earners)
     * @param {number} monthlyGross - Monthly gross salary
     * @returns {number} ALV contribution rate
     */
    getALVRate(monthlyGross) {
        for (const bracket of this.ALV_GRADUATED_RATES) {
            if (monthlyGross <= bracket.max) {
                return bracket.rate;
            }
        }
        return this.SOCIAL_SECURITY.unemployment;
    },

    /**
     * Calculate annual income tax using progressive brackets
     * @param {number} annualGross - Annual gross income
     * @returns {number} Annual income tax
     */
    calculateIncomeTax(annualGross) {
        let tax = 0;

        for (let i = 0; i < this.TAX_BRACKETS_2025.length; i++) {
            const bracket = this.TAX_BRACKETS_2025[i];
            if (annualGross <= bracket.min) break;

            const taxableAmount = Math.min(annualGross, bracket.max) - bracket.min;
            if (taxableAmount > 0) {
                tax += taxableAmount * bracket.rate;
            }
        }

        return Math.max(0, tax);
    },

    /**
     * Calculate monthly social security contributions
     * @param {number} monthlyGross - Monthly gross salary
     * @returns {object} Breakdown of social security contributions
     */
    calculateSocialSecurity(monthlyGross) {
        // Cap at maximum contribution base
        const effectiveBase = Math.min(monthlyGross, this.SOCIAL_SECURITY.maxMonthlyBase);

        // Below marginal threshold = no social security
        if (monthlyGross < this.MARGINAL_INCOME_THRESHOLD) {
            return {
                health: 0,
                pension: 0,
                unemployment: 0,
                other: 0,
                total: 0
            };
        }

        // Get graduated ALV rate for low earners
        const alvRate = this.getALVRate(monthlyGross);
        const unemployment = effectiveBase * alvRate;
        const health = effectiveBase * this.SOCIAL_SECURITY.health;
        const pension = effectiveBase * this.SOCIAL_SECURITY.pension;
        const other = effectiveBase * this.SOCIAL_SECURITY.other;

        return {
            health: health,
            pension: pension,
            unemployment: unemployment,
            other: other,
            total: health + pension + unemployment + other
        };
    },

    /**
     * Calculate monthly net income from gross
     * @param {number} monthlyGross - Monthly gross salary (14x yearly)
     * @param {object} options - Additional options (tax credits, etc.)
     * @returns {object} Detailed breakdown
     */
    calculateMonthlyNet(monthlyGross, options = {}) {
        // Austria has 14 monthly payments (incl. Urlaubs- and Weihnachtsgeld)
        // The 13th and 14th salaries (Sonderzahlungen) are taxed at a flat 6% rate

        // Social security (monthly, same for all 14 payments)
        const socialSecurity = this.calculateSocialSecurity(monthlyGross);

        // === Regular salary (12 months) ===
        // Annual gross from regular payments
        const annualRegularGross = monthlyGross * 12;

        // Social security for regular payments
        const annualRegularSS = socialSecurity.total * 12;

        // Taxable income for regular payments
        const taxableRegular = annualRegularGross - annualRegularSS;

        // Progressive tax on regular income
        const regularTax = this.calculateIncomeTax(taxableRegular);

        // === Sonderzahlungen (13th + 14th salary) ===
        // These are taxed at a flat 6% rate (Jahressechstel-Begünstigung)
        // SV auf Sonderzahlungen ohne Umlagen (other): AK-Umlage und
        // Wohnbauförderungsbeitrag fallen nur auf den laufenden Bezug an.
        const sonderzahlungenSSMonthly = socialSecurity.health + socialSecurity.pension + socialSecurity.unemployment;
        const sonderzahlungenGross = monthlyGross * 2;
        const sonderzahlungenSS = sonderzahlungenSSMonthly * 2;
        const sonderzahlungenTaxable = sonderzahlungenGross - sonderzahlungenSS;

        // 6% flat tax on Sonderzahlungen (with Freibetrag)
        const sonderzahlungenTax = Math.max(0, (sonderzahlungenTaxable - this.TAX_CREDITS.sonderzahlungenFreibetrag) * 0.06);

        // === Total annual tax ===
        let annualTax = regularTax + sonderzahlungenTax;

        // Apply standard tax credits (Verkehrsabsetzbetrag for all employees)
        annualTax = Math.max(0, annualTax - this.TAX_CREDITS.verkehrsabsetzbetrag);

        // Apply additional tax credits if provided
        const additionalCredits = options.taxCredits || 0;
        annualTax = Math.max(0, annualTax - additionalCredits);

        // === Monthly values (averaged over 12 months for display) ===
        const monthlyTax = annualTax / 12;

        // Net income (monthly average)
        const monthlyNet = monthlyGross - socialSecurity.total - monthlyTax;

        // Laufender Bezug: echte monatliche Lohnsteuer und Netto wie auf der
        // Lohnabrechnung. Absetzbeträge werden nur gegen die laufende Steuer
        // verrechnet; nicht aufgezehrte Beträge fließen nicht in die
        // Sonderzahlungs-Versteuerung über.
        const regularTaxAfterCredits = Math.max(
            0,
            regularTax - this.TAX_CREDITS.verkehrsabsetzbetrag - additionalCredits
        );
        const monthlyTaxLaufend = regularTaxAfterCredits / 12;
        const netLaufend = Math.max(0, monthlyGross - socialSecurity.total - monthlyTaxLaufend);

        // Annual totals
        const annualGross = monthlyGross * 14;
        // 12 laufende Bezüge (inkl. Umlagen) + 2 Sonderzahlungen (ohne Umlagen)
        const annualSocialSecurity = socialSecurity.total * 12 + sonderzahlungenSS;

        return {
            gross: monthlyGross,
            annualGross: annualGross,
            socialSecurity: socialSecurity,
            annualSocialSecurity: annualSocialSecurity,
            monthlyTax: monthlyTax,
            monthlyTaxLaufend: monthlyTaxLaufend,
            annualTax: annualTax,
            taxCredits: additionalCredits,
            net: Math.max(0, monthlyNet),
            netLaufend: netLaufend,
            effectiveTaxRate: annualGross > 0 ? (annualTax / annualGross) * 100 : 0,
            effectiveTotalRate: annualGross > 0 ?
                ((annualTax + annualSocialSecurity) / annualGross) * 100 : 0
        };
    },

    /**
     * Calculate net for a range of gross incomes
     * Used for generating the chart data
     * @param {number} maxGross - Maximum gross to calculate
     * @param {number} step - Step size
     * @param {object} options - Calculation options
     * @returns {Array} Array of calculation results
     */
    calculateRange(maxGross = 6000, step = 100, options = {}) {
        const results = [];
        for (let gross = 0; gross <= maxGross; gross += step) {
            results.push({
                gross: gross,
                ...this.calculateMonthlyNet(gross, options)
            });
        }
        return results;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaxCalculator;
}
