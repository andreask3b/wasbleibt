const ScenarioPresets = {
    definitions: [
        {
            id: 'single-parent-trap',
            label: 'Alleinerziehend, 2 Kinder',
            description: 'Teilzeit, Betreuung, Wien',
            values: {
                familyStatus: 'singleParent',
                incomeMode: 'hours',
                hourlyWage: 14,
                weeklyHours: 20,
                partnerIncome: 0,
                housingType: 'rent',
                monthlyRent: 850,
                apartmentSize: 70,
                federalState: 'vienna',
                wiedereinsteiger: false,
                children: [
                    { age: 4, careMode: 'full' },
                    { age: 8, careMode: 'half' }
                ]
            },
            analysis: {
                type: 'hours',
                hourlyWage: 14,
                hours: [0, 10, 20, 30, 40]
            }
        },
        {
            id: 'reentry-parent',
            label: 'Wiedereinstieg 20h',
            description: '1 Kind, Miete, Freibetrag',
            values: {
                familyStatus: 'singleParent',
                incomeMode: 'hours',
                hourlyWage: 15,
                weeklyHours: 20,
                partnerIncome: 0,
                housingType: 'rent',
                monthlyRent: 780,
                apartmentSize: 62,
                federalState: 'vienna',
                wiedereinsteiger: true,
                children: [
                    { age: 3, careMode: 'full' }
                ]
            },
            analysis: {
                type: 'hours',
                hourlyWage: 15,
                hours: [0, 15, 20, 25, 30]
            }
        },
        {
            id: 'low-earner-rent',
            label: 'Geringverdienst',
            description: '25h, Miete, kaum Anreiz',
            values: {
                familyStatus: 'single',
                incomeMode: 'hours',
                hourlyWage: 13,
                weeklyHours: 25,
                partnerIncome: 0,
                housingType: 'rent',
                monthlyRent: 800,
                apartmentSize: 52,
                federalState: 'vienna',
                wiedereinsteiger: false,
                children: []
            },
            analysis: {
                type: 'hours',
                hourlyWage: 13,
                hours: [0, 15, 20, 25, 30, 35]
            }
        }
    ],

    getPreset(id) {
        return this.definitions.find(preset => preset.id === id) || null;
    },

    buildShareParams(id) {
        const preset = this.getPreset(id);
        if (!preset) return '';

        const params = new URLSearchParams();
        const values = preset.values;
        params.set('status', values.familyStatus);
        params.set('modus', values.incomeMode);
        params.set('stundenlohn', values.hourlyWage);
        params.set('wochenstunden', values.weeklyHours);
        params.set('miete', values.monthlyRent);
        params.set('groesse', values.apartmentSize);
        params.set('bundesland', values.federalState);
        if (values.wiedereinsteiger) {
            params.set('wiedereinsteiger', '1');
        }
        if (values.children.length > 0) {
            params.set('kinder', values.children.map(child => child.age).join(','));
            params.set('betreuung', values.children.map(child => child.careMode).join(','));
        }
        return params.toString();
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScenarioPresets;
}
