# Verifikation: was-bleibt.at Sozialleistungen (`benefits.js`) — Stand 2025

**Datum:** 2026-06-02
**Geprüfte Logik:** `js/benefits.js` + Datenwerte aus `js/data/benefits-data.json`
**Methodik:** Logik im Browser aus dem geladenen `BenefitsCalculator` mit konkreten Fällen durchgerechnet (lokaler Server). Datenwerte und gesetzliche Mechanismen gegen offizielle 2025-Quellen geprüft (BMF, oesterreich.gv.at, Sozialministerium, Sozialhilfe-Grundsatzgesetz). Es gibt — anders als beim AK-Brutto-Netto-Rechner — keinen einzelnen offiziellen Vergleichsrechner für alle Transfers; die Prüfung erfolgt komponentenweise.

---

## 0. Zusammenfassung

| # | Komponente | Befund | Schweregrad | Status |
|---|-----------|--------|-------------|--------|
| A | Sozialhilfe: Familienbeihilfe als Einkommen angerechnet | **Bug** — §7 SozGG: Familienbeihilfe ist *nicht* anrechenbar | **Hoch** | **Behoben ✓** |
| B | Kindermehrbetrag auf €700 **gesamt** gedeckelt | **Bug** — gesetzlich €700 **pro Kind** | Mittel | **Behoben ✓** |
| C | Sozialhilfe: Wohnbedarf als ×1,30-Aufschlag | Vereinfachung gegenüber gesetzlicher Struktur | Mittel | offen (C–F später) |
| D | Wohnbeihilfe Wien: pauschal 25 % zumutbarer Aufwand | Vereinfachung statt Zumutbarkeitstabelle | Mittel | offen (C–F später) |
| E | Wohnbeihilfe übrige Länder: heuristische Degressionsformel | grobe Schätzung, nicht gesetzeskonform | Mittel | offen (C–F später) |
| F | Sozialhilfe-Kinderrichtsatz pauschal (€326,43 ≈ 27 %) | Länder rechnen degressiv/abweichend | Gering | offen (C–F später) |
| — | **Datenwerte 2025** (Familienbeihilfe, FB+, AVAB, Richtsätze) | **korrekt** | — | offiziell bestätigt |

**Bugs A und B sind behoben** (in `js/benefits.js`, verifiziert im Browser auf beiden Seiten, keine JS-Fehler). Die Vereinfachungen C–F bleiben bewusst offen und werden separat besprochen.

Kernaussage: Die **hinterlegten Beträge stimmen für 2025**. Die zwei **Bugs (A, B)** unterschätzen Leistungen für Familien systematisch. Die Wohnbeihilfe (D, E) und der Sozialhilfe-Wohnbedarf (C) sind als **grobe Orientierung** modelliert — die realen Länderverfahren sind komplexer und individuell.

---

## 1. Datenwerte — gegen offizielle 2025-Sätze geprüft (korrekt)

| Wert | Code/JSON | Offiziell 2025 | OK |
|------|-----------|----------------|----|
| Familienbeihilfe 0–2 J. | 138,40 | 138,40 | ✓ |
| Familienbeihilfe 3–9 J. | 148,00 | 148,00 | ✓ |
| Familienbeihilfe 10–18 J. | 171,80 | 171,80 | ✓ |
| Familienbeihilfe ab 19 J. | 200,40 | 200,40 | ✓ |
| Kinderabsetzbetrag | 70,90 | 70,90 | ✓ |
| Geschwisterstaffelung (pro Kind, 2/3/4/5/6/7+) | 8,60 / 21,10 / 32,10 / 38,90 / 43,40 / 63,10 | identisch | ✓ |
| Familienbonus Plus < 18 / ≥ 18 (pro Jahr) | 2.000 / 700 | 2.000 / 700 | ✓ |
| Kindermehrbetrag (pro Kind/Jahr) | 700 | 700 | ✓ Wert — aber falsch angewandt, s. Befund B |
| AVAB 1 / 2 / +Kind (pro Jahr) | 601 / 813 / 268 | 601 / 813 / 268 | ✓ |
| AVAB Partner-Zuverdienstgrenze | 7.284 | 7.284 | ✓ |
| Sozialhilfe Alleinstehend/Monat | 1.209 | ~1.209 (Höchstsatz 2025) | ✓ |
| Sozialhilfe Paar/Monat | 1.693 | = 140 % des Einzelsatzes | ✓ |

Die Familienbeihilfe-Werte entsprechen der Valorisierung 2025 (z. B. 132,30 × 1,046 ≈ 138,40). AVAB- und Sozialhilfe-Sätze offiziell bestätigt.

---

## 2. Bug A (Hoch) — Familienbeihilfe wird in der Sozialhilfe als Einkommen angerechnet

**Fundstelle:** `benefits.js`, `calculateSozialhilfe` (≈ Z. 333–338) und Aufruf in `calculateAllBenefits` (Z. 408–412), wo `familyBenefits: familienbeihilfe.total` übergeben wird.

```js
const totalIncome = countableIncome + (familyBenefits || 0);   // <-- Familienbeihilfe erhöht das anrechenbare Einkommen
const benefit = Math.max(0, effectiveEntitlement - totalIncome);
```

**Gesetzeslage:** Nach **§7 Sozialhilfe-Grundsatzgesetz** ist die Familienbeihilfe **nicht als Einkommen anzurechnen** — ebenso der Kinderabsetzbetrag (§33 Abs. 4 EStG). Der Bedarf des Kindes wird über den Kinderrichtsatz (Child-Supplement) in der Anspruchshöhe abgedeckt; die Familienbeihilfe kommt zusätzlich obendrauf.

**Wirkung (gemessen):** Alleinerziehend, 2 Kinder (4 + 7 J.), €1.000 Netto, Miete €800, Wien:
- mit Anrechnung (aktueller Code): Sozialhilfe **€965,42**
- ohne Anrechnung (gesetzeskonform): **€1.420,42**
- **Unterschätzung: €455,00/Monat** (= exakt die angerechnete Familienbeihilfe für 2 Kinder)

Die Unterschätzung entspricht immer der vollen Familienbeihilfe-Summe. Familien mit Sozialhilfeanspruch werden dadurch deutlich zu niedrig gerechnet.

**Korrektur (umgesetzt):** `totalIncome` enthält `familyBenefits` nicht mehr (`const totalIncome = countableIncome;`). Familienbeihilfe + Kinderabsetzbetrag werden als nicht-anrechenbar behandelt. Verifiziert: gleicher Fall liefert jetzt €1.420,42.

---

## 3. Bug B (Mittel) — Kindermehrbetrag auf €700 gesamt statt €700 pro Kind

**Fundstelle:** `benefits.js`, `calculateFamilienbonusPlus` (Z. 134–136):

```js
// Kindermehrbetrag 2025: max. €700 TOTAL (not per child)
const kindermehrbetrag = Math.min(unusedBonus, this.KINDERMEHRBETRAG);   // KINDERMEHRBETRAG = 700
```

**Gesetzeslage:** Der Kindermehrbetrag beträgt 2025 **€700 pro Kind und Jahr** (bestätigt: oesterreich.gv.at / finanz.at). Der Kommentar „max. €700 TOTAL (not per child)" ist falsch.

**Wirkung (gemessen):** 2 Kinder, keine Steuerlast (`taxLiability = 0`): maxBonus = €4.000, ungenutzt = €4.000.
- aktueller Code: Kindermehrbetrag **€700** (= €58,33/Monat)
- korrekt: €700 × 2 = **€1.400** (= €116,67/Monat)
- **Unterschätzung: €700/Jahr je zusätzlichem Kind**, sobald der Familienbonus mangels Steuer nicht ausgeschöpft wird (typischer Niedrigeinkommens-/Alleinerziehenden-Fall).

**Korrektur (umgesetzt):** `kindermehrbetrag = Math.min(unusedBonus, this.KINDERMEHRBETRAG * numChildren)` mit `numChildren = childrenAges.length`. Verifiziert: 2 Kinder ohne Steuer → €1.400, 3 Kinder → €2.100; teilweise genutzter Bonus und hohe Steuer weiterhin korrekt (€500 bzw. €0).

> Hinweis: Der Kindermehrbetrag hat zusätzliche gesetzliche Voraussetzungen (Erwerbstätigkeit/AVAB-Anspruch, Mindesttage) und wird in der App vereinfacht allein aus dem ungenutzten Familienbonus abgeleitet. Die Per-Kind-Deckelung ist dennoch die korrekte Obergrenze.

---

## 4. Vereinfachungen (keine harten Bugs, aber Abweichung vom gesetzlichen Verfahren)

### C — Sozialhilfe Wohnbedarf als ×1,30 (`calculateSozialhilfe`, Z. 329/337)
`withHousing = maxEntitlement * 1,30`, angewandt wenn Miete > 0. Gesetzlich besteht der Richtsatz aus Lebensunterhalt (Grundbetrag) **plus separatem Wohnbedarf** (Länder regeln Höhe/Deckel unterschiedlich, oft als eigener Wohnkostenanteil bis zu einem Höchstbetrag). Der pauschale +30 %-Aufschlag ist eine Näherung — je nach realer Miete und Bundesland zu hoch oder zu niedrig.

### D — Wohnbeihilfe Wien: pauschal 25 % zumutbarer Aufwand (`calculateWohnbeihilfeVienna`, Z. 208)
`reasonableHousingCost = monthlyNetIncome * 0,25`. Die Wiener Wohnbeihilfe nutzt real eine **Zumutbarkeitstabelle** (zumutbarer Wohnungsaufwand gestaffelt nach Einkommen und Haushaltsgröße), keinen Pauschalsatz. Beispiel (1 Person, €1.200 Netto, €700 Miete, 50 m²): App **€133,50** (anrechenbar 50 × 8,67 = €433,50; zumutbar 1.200 × 25 % = €300). Größenordnung plausibel, exakter Betrag aber modellbedingt.

### E — Wohnbeihilfe übrige Länder: heuristische Degression (`calculateWohnbeihilfeGeneric`, Z. 301–302)
`if (incomeRatio > 0,5) benefit *= 1 − (incomeRatio − 0,5) * 0,8`. Diese Degressionsformel ist **frei modelliert**, nicht aus den Landesgesetzen abgeleitet. Die Einkommensgrenzen/€-pro-m²-Sätze je Land sind grobe Richtwerte (siehe `_note`-Felder in der JSON, z. B. NÖ/Salzburg/Vorarlberg „individuelle Berechnung"). Ergebnis = Orientierung, nicht Bescheidqualität.

### F — Sozialhilfe-Kinderrichtsatz pauschal (`SOZIALHILFE.childSupplement = 326,43`)
Flacher Betrag je Kind (≈ 27 % des Einzelrichtsatzes). Reale Länder rechnen häufig **degressiv** (1./2./3. Kind unterschiedlich, z. B. Wien). Bei mehreren Kindern überschätzt die flache Variante tendenziell.

---

## 5. Gemessene Referenzfälle (App, korrigierter SV-Stand)

| Fall | Ergebnis App |
|------|--------------|
| Familienbeihilfe 1 Kind (4 J.) | €218,90 (148,00 + 70,90 KAB) |
| Familienbeihilfe 2 Kinder (4, 7 J.) | €455,00 (296,00 + 141,80 + 17,20 Geschwister) |
| Familienbeihilfe 3 Kinder (1, 5, 12 J.) | €734,20 (458,20 + 212,70 + 63,30) |
| Familienbonus, 2 Kinder, hohe Steuer | €4.000 genutzt, Kindermehrbetrag €0 ✓ |
| Familienbonus, 2 Kinder, keine Steuer | Kindermehrbetrag €1.400 ✓ (nach Bug-B-Fix; 3 Kinder → €2.100) |
| AVAB Alleinerziehend 2 Kinder | €813/Jahr ✓ |
| AVAB Paar, Partner €7.000/J | €601/Jahr ✓ (unter Grenze) |
| AVAB Paar, Partner €8.000/J | €0 ✓ (über Grenze 7.284) |
| Sozialhilfe Alleinerz. 2 Kinder, €1.000 Netto, €800 Miete | €1.420,42 ✓ (nach Bug-A-Fix; vorher €965,42) |
| Wohnbeihilfe Wien 1 P., €1.200 Netto, €700 Miete, 50 m² | €133,50 (Näherung, Befund D — offen) |

Volle Kette nach Fix (Alleinerziehend, 2 Kinder, €1.500 brutto, €800 Miete, Wien): Netto 1.269,45 + Familienbeihilfe 455,00 + Sozialhilfe 1.150,97 + Wohnbeihilfe 289,54 + Kindermehrbetrag 116,67 + AVAB 67,75/Mt. → Haushaltskasse 3.349,38, „Was bleibt" 2.549,38. Arithmetik konsistent, keine JS-Fehler.

---

## 6. Empfehlung / Status

1. **Bug A** (hoch) — **erledigt**: Familienbeihilfe + Kinderabsetzbetrag werden in der Sozialhilfe nicht mehr als Einkommen angerechnet.
2. **Bug B** (mittel) — **erledigt**: Kindermehrbetrag pro Kind gedeckelt (`700 * numChildren`).
3. **C–F** — **offen**, bewusst zurückgestellt: als Vereinfachungen kennzeichnen (UI-Disclaimer vorhanden) oder schrittweise an die Länderverfahren annähern. Insbesondere die Wohnbeihilfe übrige Länder (E) liefert nur grobe Schätzungen. Separat zu besprechen.

## 7. Geprüfter Umfang / Grenzen

- Geprüft: Familienbeihilfe, Geschwisterstaffelung, Kinderabsetzbetrag, Familienbonus Plus, Kindermehrbetrag, AVAB/AEAB, Sozialhilfe, Wohnbeihilfe (Wien + generisch), Kinderbetreuungskosten (Datenlage).
- Nicht abschließend geprüft: bundeslandspezifische Wohnbeihilfe-Detailformeln (außer Wien/Steiermark-Struktur), Vermögensanrechnung, Sonderfälle (Behinderung, Wiedereinsteiger-Freibetrag über 35 % hinaus).
- Kinderbetreuungskosten sind laut `_note` ausdrücklich Durchschnittswerte; nicht als Bug zu werten.

## Quellen

- [Sozialhilfe — oesterreich.gv.at](https://www.oesterreich.gv.at/de/themen/hilfe_und_finanzielle_unterstuetzung_erhalten/4/Seite.1693914)
- [§7 Sozialhilfe-Grundsatzgesetz — JUSLINE](https://www.jusline.at/gesetz/sozgg/paragraf/7)
- [Eigene Einkünfte in der Sozialhilfe — oesterreich.gv.at](https://www.oesterreich.gv.at/themen/hilfe_und_finanzielle_unterstuetzung_erhalten/4/Seite.1693909.html)
- [Alleinverdiener-/Alleinerzieherabsetzbetrag — BMF](https://www.bmf.gv.at/themen/steuern/arbeitnehmerveranlagung/steuertarif-steuerabsetzbetraege/alleinverdiener-alleinerzieher-absetzbetrag.html)
- [Kindermehrbetrag — oesterreich.gv.at](https://www.oesterreich.gv.at/de/lexicon/K/Seite.992745)
- [Familienbonus Plus — BMF](https://www.bmf.gv.at/themen/steuern/arbeitnehmerveranlagung/steuertarif-steuerabsetzbetraege/familienbonus-plus.html)
- [Sozialhilfe Leistungen — Sozialministerium](https://www.sozialministerium.gv.at/Themen/Soziales/Sozialhilfe-und-Mindestsicherung/Leistungen.html)
