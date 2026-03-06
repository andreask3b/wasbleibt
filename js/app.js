/**
 * WasBleibt.at - Austrian Tax & Benefits Calculator
 * Main application entry point
 */

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🇦🇹 WasBleibt.at - Österreich Steuer- & Sozialleistungsrechner');

    // Load benefits data from JSON
    await BenefitsCalculator.loadData();

    const dataYear = BenefitsCalculator.data?.year || BenefitsCalculator.data?._meta?.year || '2025';
    const lastUpdated = BenefitsCalculator.data?.lastUpdated || BenefitsCalculator.data?._meta?.lastUpdated || '';
    console.log(`Version 1.1.0 | Rechenstand: ${dataYear}${lastUpdated ? ` (Datenstand ${lastUpdated})` : ''}`);

    const dataYearBadge = document.getElementById('dataYearBadge');
    if (dataYearBadge) {
        dataYearBadge.textContent = `Rechenstand ${dataYear}`;
    }

    // Initialize form manager
    FormManager.init();

    // Log initialization
    console.log('✅ Anwendung initialisiert');
    console.log(`📊 Steuerberechnung: Lohnsteuertarif ${dataYear}`);
    console.log(`👨‍👩‍👧 Familienbeihilfe: Werte ${dataYear}`);
    console.log(`🏠 Wohnbeihilfe: Alle Bundesländer ${dataYear}`);
});

// Global error handler for debugging
window.onerror = function (message, source, lineno, colno, error) {
    console.error('Fehler:', message);
    console.error('Quelle:', source, 'Zeile:', lineno);
    return false;
};

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});
