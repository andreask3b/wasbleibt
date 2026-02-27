/**
 * Austrian Social Benefits Calculator (2025)
 * Familienbeihilfe, Wohnbeihilfe, tax credits, etc.
 * 
 * Data is loaded from js/data/benefits-data.json
 */

const BenefitsCalculator = {
    // Data will be loaded from JSON
    data: null,
    dataLoaded: false,

    /**
     * Initialize by loading benefit data from JSON
     * @returns {Promise} Resolves when data is loaded
     */
    async loadData() {
        if (this.dataLoaded) return;

        try {
            const response = await fetch('js/data/benefits-data.json');
            this.data = await response.json();
            this.dataLoaded = true;
            console.log(`Benefits data loaded (${this.data.year})`);
        } catch (error) {
            console.error('Failed to load benefits data:', error);
            // Fallback to inline defaults if JSON fails
            this.loadFallbackData();
        }
    },

    /**
     * Fallback data if JSON loading fails
     */
    loadFallbackData() {
        this.data = {
            familienbeihilfe: { age0to2: 138.40, age3to9: 148.00, age10to18: 171.80, age19plus: 200.40 },
            kinderabsetzbetrag: 70.90,
            siblingBonus: { "2": 8.60, "3": 21.10, "4": 32.10, "5": 38.90, "6": 43.40, "7": 63.10 },
            familienbonusPlus: { under18: 2000, over18: 700 },
            kindermehrbetrag: 700,
            alleinverdiener: { oneChild: 601, twoChildren: 813, additionalChild: 268, partnerIncomeLimit: 7284 },
            sozialhilfe: { single: 1209, couple: 1693, childSupplement: 326.43, housingSupplementRate: 0.30 },
            wohnbeihilfe: {},
            childcareCosts: {}
        };
        this.dataLoaded = true;
    },

    // Getter shortcuts for data access
    get FAMILIENBEIHILFE() { return this.data?.familienbeihilfe || {}; },
    get KINDERABSETZBETRAG() { return this.data?.kinderabsetzbetrag || 70.90; },
    get SIBLING_BONUS() { return this.data?.siblingBonus || {}; },
    get FAMILIENBONUS_PLUS() { return this.data?.familienbonusPlus || {}; },
    get KINDERMEHRBETRAG() { return this.data?.kindermehrbetrag || 700; },
    get ALLEINVERDIENER() { return this.data?.alleinverdiener || {}; },
    get SOZIALHILFE() { return this.data?.sozialhilfe || {}; },
    get CHILDCARE_COSTS() { return this.data?.childcareCosts || {}; },

    /**
     * Get Wohnbeihilfe config for a specific state
     */
    getWohnbeihilfeConfig(state) {
        return this.data?.wohnbeihilfe?.[state] || null;
    },

    /**
     * Get Familienbeihilfe amount based on child age
     * @param {number} age - Child's age
     * @returns {number} Monthly amount
     */
    getFamilienbeihilfeByAge(age) {
        const fb = this.FAMILIENBEIHILFE;
        if (age < 3) return fb.age0to2;
        if (age < 10) return fb.age3to9;
        if (age < 19) return fb.age10to18;
        return fb.age19plus;
    },

    /**
     * Calculate total Familienbeihilfe for all children
     * @param {Array<number>} childrenAges - Array of children's ages
     * @returns {object} Monthly breakdown
     */
    calculateFamilienbeihilfe(childrenAges) {
        if (!childrenAges || childrenAges.length === 0) {
            return { baseAmount: 0, kinderabsetzbetrag: 0, siblingBonus: 0, total: 0, perChild: [] };
        }

        const numChildren = childrenAges.length;
        let baseAmount = 0;
        const perChild = [];

        for (const age of childrenAges) {
            const amount = this.getFamilienbeihilfeByAge(age);
            baseAmount += amount;
            perChild.push({ age: age, baseAmount: amount, kinderabsetzbetrag: this.KINDERABSETZBETRAG });
        }

        const kinderabsetzbetrag = this.KINDERABSETZBETRAG * numChildren;

        let siblingBonus = 0;
        if (numChildren >= 2) {
            const bonusRate = numChildren >= 7 ? this.SIBLING_BONUS["7"] : this.SIBLING_BONUS[numChildren.toString()];
            siblingBonus = (bonusRate || 0) * numChildren;
        }

        return {
            baseAmount: baseAmount,
            kinderabsetzbetrag: kinderabsetzbetrag,
            siblingBonus: siblingBonus,
            total: baseAmount + kinderabsetzbetrag + siblingBonus,
            perChild: perChild,
            numChildren: numChildren
        };
    },

    /**
     * Calculate Familienbonus Plus (tax credit)
     */
    calculateFamilienbonusPlus(childrenAges, taxLiability) {
        if (!childrenAges || childrenAges.length === 0) {
            return { maxBonus: 0, usedBonus: 0, remainingTax: taxLiability, kindermehrbetrag: 0 };
        }

        let maxBonus = 0;
        for (const age of childrenAges) {
            maxBonus += age < 18 ? this.FAMILIENBONUS_PLUS.under18 : this.FAMILIENBONUS_PLUS.over18;
        }

        const usedBonus = Math.min(maxBonus, taxLiability);
        const remainingTax = Math.max(0, taxLiability - usedBonus);
        const unusedBonus = maxBonus - usedBonus;
        // Kindermehrbetrag 2025: max. €700 TOTAL (not per child)
        // Awarded when Familienbonus cannot be fully used (tax liability too low)
        const kindermehrbetrag = Math.min(unusedBonus, this.KINDERMEHRBETRAG);

        return {
            maxBonus: maxBonus,
            usedBonus: usedBonus,
            remainingTax: remainingTax,
            kindermehrbetrag: kindermehrbetrag,
            monthlyKindermehrbetrag: kindermehrbetrag / 12
        };
    },

    /**
     * Calculate Alleinverdiener or Alleinerzieherabsetzbetrag
     */
    calculateAlleinverdienerAbsetzbetrag(status, numChildren, partnerIncome = 0) {
        if (numChildren === 0) {
            return { annualCredit: 0, monthlyCredit: 0, eligible: false };
        }

        const av = this.ALLEINVERDIENER;

        const calculateCredit = () => {
            let credit = 0;
            if (numChildren >= 1) credit = av.oneChild;
            if (numChildren >= 2) credit = av.twoChildren;
            if (numChildren > 2) credit += (numChildren - 2) * av.additionalChild;
            return credit;
        };

        if (status === 'singleParent') {
            return {
                annualCredit: calculateCredit(),
                monthlyCredit: calculateCredit() / 12,
                eligible: true,
                type: 'Alleinerzieherabsetzbetrag'
            };
        }

        if (status === 'married' && partnerIncome <= av.partnerIncomeLimit) {
            return {
                annualCredit: calculateCredit(),
                monthlyCredit: calculateCredit() / 12,
                eligible: true,
                type: 'Alleinverdienerabsetzbetrag'
            };
        }

        return { annualCredit: 0, monthlyCredit: 0, eligible: false };
    },

    /**
     * Calculate Wohnbeihilfe (Vienna)
     */
    calculateWohnbeihilfeVienna(params) {
        const { householdSize, monthlyNetIncome, monthlyRent, apartmentSize } = params;
        const config = this.getWohnbeihilfeConfig('vienna');
        if (!config) return { eligible: false, amount: 0, reason: 'Keine Daten für Wien' };

        const incomeLimit = config.incomeLimits[Math.min(householdSize, 5)] || config.incomeLimits["5"];

        if (monthlyNetIncome > incomeLimit) {
            return { eligible: false, reason: 'Einkommen über der Grenze', amount: 0, incomeLimit: incomeLimit };
        }

        let appropriateSize;
        if (householdSize === 1) appropriateSize = config.appropriateSize["1"];
        else if (householdSize === 2) appropriateSize = config.appropriateSize["2"];
        else appropriateSize = config.appropriateSize.base + (householdSize - 2) * config.appropriateSize.perAdditional;

        const effectiveSize = Math.min(apartmentSize, appropriateSize);
        const maxHousingCost = effectiveSize * config.maxRatePerSqm;
        const assessableHousingCost = Math.min(monthlyRent, maxHousingCost);
        const reasonableHousingCost = monthlyNetIncome * config.minHousingCostPercent;
        const benefit = Math.max(0, assessableHousingCost - reasonableHousingCost);

        return {
            eligible: benefit > 0,
            amount: Math.round(benefit * 100) / 100,
            assessableHousingCost, reasonableHousingCost, appropriateSize, incomeLimit
        };
    },

    /**
     * Calculate Wohnunterstützung (Steiermark)
     */
    calculateWohnbeihilfeSteiermark(params) {
        const { householdSize, numAdults, numChildren, monthlyNetIncome, monthlyRent } = params;
        const config = this.getWohnbeihilfeConfig('steiermark');
        if (!config) return { eligible: false, amount: 0, reason: 'Keine Daten für Steiermark', federalState: 'steiermark' };

        const wf = config.weightingFactors;
        const weightedSize = wf.household + (numAdults * wf.adult) + (numChildren * wf.minor);
        const weightedIncome = monthlyNetIncome / weightedSize;

        const effectiveHouseholdSize = Math.min(householdSize, 7);
        const incomeLimit = config.incomeLimits[effectiveHouseholdSize] || config.incomeLimits["7"];

        if (monthlyNetIncome > incomeLimit) {
            return { eligible: false, reason: 'Einkommen über der Grenze', amount: 0, incomeLimit, federalState: 'steiermark' };
        }

        const maxSubsidy = config.maxRentSubsidy[Math.min(householdSize, 5)] || config.maxRentSubsidy["5"];
        const reasonableHousingCost = monthlyNetIncome * config.minHousingCostPercent;
        const assessableRent = Math.min(monthlyRent, maxSubsidy);
        const incomeRatio = monthlyNetIncome / incomeLimit;

        let benefit = Math.max(0, assessableRent - reasonableHousingCost);
        benefit = benefit * (1 - (incomeRatio * 0.5));

        return {
            eligible: benefit > 10,
            amount: Math.round(benefit * 100) / 100,
            maxSubsidy, reasonableHousingCost, incomeLimit, weightedIncome, federalState: 'steiermark'
        };
    },

    /**
     * Calculate Wohnbeihilfe for other federal states (generic)
     */
    calculateWohnbeihilfeGeneric(params, state) {
        const { householdSize, numChildren, monthlyNetIncome, monthlyRent, apartmentSize } = params;

        const stateNames = {
            'upperAustria': 'Oberösterreich', 'lowerAustria': 'Niederösterreich', 'salzburg': 'Salzburg',
            'tyrol': 'Tirol', 'vorarlberg': 'Vorarlberg', 'carinthia': 'Kärnten', 'burgenland': 'Burgenland'
        };

        const config = this.getWohnbeihilfeConfig(state);
        if (!config) {
            return { eligible: false, reason: 'Bundesland nicht unterstützt', amount: 0, federalState: state };
        }

        const effectiveHouseholdSize = Math.min(householdSize, 5);
        let incomeLimit = config.incomeLimits[effectiveHouseholdSize] || config.incomeLimits["5"];

        if (config.childBonus && numChildren > 0) {
            incomeLimit += numChildren * config.childBonus;
        }

        if (monthlyNetIncome > incomeLimit) {
            return { eligible: false, reason: 'Einkommen über der Grenze', amount: 0, incomeLimit, federalState: state, federalStateName: stateNames[state] };
        }

        let appropriateSize;
        if (config.appropriateSize) {
            appropriateSize = (config.appropriateSize["1"] || 50) + (householdSize - 1) * (config.appropriateSize.perAdditional || 10);
        } else {
            appropriateSize = 50 + (householdSize - 1) * 10;
        }

        const effectiveSize = Math.min(apartmentSize, appropriateSize);
        const maxHousingCost = effectiveSize * config.maxRatePerSqm;
        const assessableHousingCost = Math.min(monthlyRent, maxHousingCost);

        let reasonableHousingCost;
        if (config.noContributionBelow && monthlyNetIncome <= config.noContributionBelow) {
            reasonableHousingCost = 0;
        } else {
            reasonableHousingCost = monthlyNetIncome * config.minHousingCostPercent;
        }

        let benefit = Math.max(0, assessableHousingCost - reasonableHousingCost);

        if (config.maxBenefit) benefit = Math.min(benefit, config.maxBenefit);

        const incomeRatio = monthlyNetIncome / incomeLimit;
        if (incomeRatio > 0.5) benefit = benefit * (1 - (incomeRatio - 0.5) * 0.8);

        const minBenefit = config.minBenefit || 10;
        if (benefit < minBenefit) {
            return { eligible: false, reason: 'Berechneter Betrag unter Mindestgrenze', amount: 0, incomeLimit, federalState: state, federalStateName: stateNames[state] };
        }

        return {
            eligible: true,
            amount: Math.round(benefit * 100) / 100,
            assessableHousingCost, reasonableHousingCost, appropriateSize, incomeLimit,
            maxBenefit: config.maxBenefit, federalState: state, federalStateName: stateNames[state]
        };
    },

    /**
     * Calculate Sozialhilfe/Mindestsicherung (Vienna)
     */
    calculateSozialhilfe(params) {
        const { householdSize, numChildren, monthlyNetIncome, familyBenefits, wiedereinsteiger, monthlyRent } = params;

        const sh = this.SOZIALHILFE;
        const numAdults = householdSize - numChildren;

        let maxEntitlement = numAdults === 1 ? sh.single : sh.couple;
        maxEntitlement += numChildren * sh.childSupplement;

        const withHousing = maxEntitlement * (1 + sh.housingSupplementRate);

        const freibetragRate = wiedereinsteiger ? 0.35 : 0;
        const exemptIncome = monthlyNetIncome * freibetragRate;
        const countableIncome = monthlyNetIncome - exemptIncome;
        const totalIncome = countableIncome + (familyBenefits || 0);
        // Use withHousing entitlement if person has rent/housing costs (up to 30% more)
        // Source: §8 Sozialhilfe-Grundsatzgesetz
        const effectiveEntitlement = (monthlyRent > 0) ? withHousing : maxEntitlement;
        const benefit = Math.max(0, effectiveEntitlement - totalIncome);

        return {
            eligible: benefit > 0,
            amount: Math.round(benefit * 100) / 100,
            maxEntitlement, withHousing, existingIncome: totalIncome, wiedereinsteiger, freibetrag: exemptIncome
        };
    },

    /**
     * Calculate childcare costs
     */
    calculateChildcareCosts(params) {
        const { children, federalState } = params;

        if (!children || children.length === 0) {
            return { total: 0, breakdown: [] };
        }

        const costs = this.CHILDCARE_COSTS[federalState];
        if (!costs) return { total: 0, breakdown: [] };

        let total = 0;
        const breakdown = [];

        children.forEach((child, index) => {
            if (child.inChildcare && child.age < 6) {
                const careCost = child.fullDay ? costs.fullDay : costs.halfDay;
                const mealCost = costs.meals;
                const childTotal = careCost + mealCost;

                total += childTotal;
                breakdown.push({ index, age: child.age, fullDay: child.fullDay, careCost, mealCost, total: childTotal });
            }
        });

        return { total: Math.round(total * 100) / 100, breakdown, federalState: costs.name };
    },

    /**
     * Calculate all benefits for a given situation
     */
    calculateAllBenefits(situation) {
        const {
            monthlyGross, monthlyNet, partnerNetIncome = 0, combinedMonthlyNet, annualTax,
            familyStatus, childrenAges, children, partnerIncome, monthlyRent, apartmentSize, federalState
        } = situation;

        const householdNetIncome = combinedMonthlyNet || (monthlyNet + partnerNetIncome);
        const numChildren = childrenAges ? childrenAges.length : 0;
        const householdSize = (familyStatus === 'married' ? 2 : 1) + numChildren;

        const familienbeihilfe = this.calculateFamilienbeihilfe(childrenAges);
        const avab = this.calculateAlleinverdienerAbsetzbetrag(familyStatus, numChildren, partnerIncome * 12);
        const taxAfterAVAB = Math.max(0, annualTax - avab.annualCredit);
        const familienbonus = this.calculateFamilienbonusPlus(childrenAges, taxAfterAVAB);
        const totalTaxCredits = avab.annualCredit + familienbonus.usedBonus;

        let wohnbeihilfe = { eligible: false, amount: 0 };
        if (monthlyRent > 0) {
            const numAdults = familyStatus === 'married' ? 2 : 1;
            const wohnParams = { householdSize, numAdults, numChildren, monthlyNetIncome: householdNetIncome, monthlyRent, apartmentSize };

            switch (federalState) {
                case 'vienna': wohnbeihilfe = this.calculateWohnbeihilfeVienna(wohnParams); break;
                case 'steiermark': wohnbeihilfe = this.calculateWohnbeihilfeSteiermark(wohnParams); break;
                default: wohnbeihilfe = this.calculateWohnbeihilfeGeneric(wohnParams, federalState); break;
            }
        }

        const sozialhilfe = this.calculateSozialhilfe({
            householdSize, numChildren, monthlyNetIncome: householdNetIncome,
            familyBenefits: familienbeihilfe.total, wiedereinsteiger: situation.wiedereinsteiger || false,
            monthlyRent: monthlyRent || 0
        });

        const totalMonthlyBenefits = familienbeihilfe.total + wohnbeihilfe.amount + (familienbonus.monthlyKindermehrbetrag || 0) + sozialhilfe.amount;
        const childcareCosts = this.calculateChildcareCosts({ children, federalState });
        const trueNetIncome = householdNetIncome + (totalTaxCredits / 12);
        const totalHouseholdIncome = trueNetIncome + totalMonthlyBenefits - childcareCosts.total;

        // Calculate disposable income ("Was bleibt")
        // Total Income minus Housing Costs (Rent/Loan)
        const disposableIncome = Math.max(0, totalHouseholdIncome - (monthlyRent || 0));

        return {
            familienbeihilfe, avab, familienbonus, wohnbeihilfe, sozialhilfe, childcareCosts,
            totalTaxCredits, totalMonthlyBenefits, totalHouseholdIncome, householdSize,
            disposableIncome, housingCost: monthlyRent || 0, trueNetIncome
        };
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BenefitsCalculator;
}
