# Verifikation: was-bleibt.at Brutto-Netto vs. AK-Brutto-Netto-Rechner

**Datum:** 2026-05-14 (Verifikation & SV-Fixes), 2026-05-15 (laufendes Netto app-weit)
**Geprüfte Logik:** `js/calculator.js` → `TaxCalculator.calculateMonthlyNet()`
**Referenz:** Brutto-Netto-Rechner der Arbeiterkammern (bruttonetto.arbeiterkammer.at), Rechenstand 2025
**Methodik:** Lokaler Server (`http://localhost:8765`), App-Werte direkt aus dem `TaxCalculator`-Objekt im Browser ausgelesen. AK-Werte manuell aus dem Live-Rechner entnommen.

---

## 0. Status

| Befund | Schweregrad | Status |
|--------|-------------|--------|
| 1 — Höchstbeitragsgrundlage veraltet (6.450 → 6.930 €/Monat) | Hoch | **Korrigiert** ✓ |
| 2 — SV-Satz laufend 0,25 Pp zu niedrig (18,07 % → 18,32 %) | Mittel | **Korrigiert** ✓ |
| 3 — SV auf Sonderzahlungen falsch (Umlagen fälschlich abgezogen) | Mittel | **Korrigiert** ✓ |
| 4 — Anzeigewert „Netto/Monat" konzeptionell inkonsistent | Konzeptionell | **Korrigiert** ✓ — app-weit auf echtes laufendes Netto umgestellt (s. Abschnitt 5) |
| Rest — Lohnsteuer-Annäherung (App bildet Monatstabelle nicht exakt nach) | Gering | **Offen** — bekannte Vereinfachung (s. Abschnitt 4) |

Nach den Korrekturen 1–3 stimmt die **Sozialversicherung exakt mit dem AK-Rechner überein** (0,00 € Abweichung auf allen 6 Testfällen, laufend wie im Jahr). Die verbleibende Jahresnetto-Abweichung von **−0,5 % bis +0,6 %** stammt vollständig aus der vereinfachten Lohnsteuer-Berechnung.

---

## 1. Durchgeführte Korrekturen

### Befund 1 — Höchstbeitragsgrundlage (`calculator.js`, `SOCIAL_SECURITY.maxMonthlyBase`)
`6450` → `6930`. 6.450 € war der Wert für 2024; die monatliche Höchstbeitragsgrundlage 2025 beträgt 6.930 €. Verifiziert über den 7.000-€-Fall: AK-SV laufend 1.269,58 € = 6.930 × 18,32 %.

### Befund 2 — SV-Satz laufend (`calculator.js`, `SOCIAL_SECURITY.other`)
`0.01` → `0.0125`. Die App-Summe lag bei 18,07 % (KV 3,87 + PV 10,25 + ALV 2,95 + other 1,00), die AK rechnet effektiv **18,32 %**. Die Lücke war über alle Testfälle exakt konstant (0,25 % des Bruttos). Die `other`-Komponente bündelt die Umlagen auf den laufenden Bezug (AK-Umlage, Wohnbauförderungsbeitrag u. a.); der Wert ist am AK-Rechner 2025 kalibriert.

### Befund 3 — SV auf Sonderzahlungen (`calculator.js`, `calculateMonthlyNet`)
Bisher wurde auf alle 14 Bezüge der volle Laufend-Satz angewendet (`socialSecurity.total * 2`). Die AK zieht auf 13./14. Bezug **keine Umlagen** ab — nur KV + PV + ALV. Neu wird die Sonderzahlungs-SV ohne die `other`-Komponente gerechnet (`sonderzahlungenSSMonthly = health + pension + unemployment`). Zusätzlich liefert `calculateMonthlyNet` jetzt ein korrektes `annualSocialSecurity` (12 laufende Bezüge inkl. Umlagen + 2 Sonderzahlungen ohne Umlagen); `chart.js` (`calculateAnnualNet`) nutzt diesen Wert statt der bisherigen Näherung `socialSecurity.total * 14`.

Belege nach Korrektur (effektive Sätze, unter der Höchstbeitragsgrundlage):
- Laufend, voller ALV-Satz: **18,32 %** (AK) = App ✓
- Sonderzahlung, voller ALV-Satz: **17,07 %** (KV+PV+ALV) = App ✓
- Niedriglohn (ALV 0 %): laufend **15,37 %**, Sonderzahlung **14,12 %** = App ✓

---

## 2. Ergebnisvergleich nach Korrektur

### 2a. Sozialversicherung — exakte Übereinstimmung

| Brutto/Mt. | App SV laufend | AK SV laufend | App SV/Jahr | AK SV/Jahr |
|-----------:|---------------:|--------------:|------------:|-----------:|
| 1.500 | 230,55 € | 230,55 € | 3.190,20 € | 3.190,20 € |
| 2.000 | 307,40 € | 307,40 € | 4.253,60 € | 4.253,60 € |
| 2.700 | 494,64 € | 494,64 € | 6.857,46 € | 6.857,46 € |
| 3.500 | 641,20 € | 641,20 € | 8.889,30 € | 8.889,30 € |
| 5.000 | 916,00 € | 916,00 € | 12.699,00 € | 12.699,00 € |
| 7.000 | 1.269,58 € | 1.269,58 € | 17.600,81 € | 17.600,86 € |

(7.000 €: 0,05 € Rundungsdifferenz im Jahreswert.)

### 2b. Jahresnetto

App-Jahreswerte rekonstruiert: `Brutto×14 − annualSocialSecurity − annualTax`.

| Brutto/Mt. | App Jahresnetto | AK Jahresnetto | Differenz | Abweichung |
|-----------:|----------------:|---------------:|----------:|-----------:|
| 1.500 | 17.794,34 € | 17.692,42 € | +101,92 € | +0,58 % |
| 2.000 | 22.663,85 € | 22.745,41 € | −81,56 € | −0,36 % |
| 2.700 | 28.082,05 € | 28.214,33 € | −132,28 € | −0,47 % |
| 3.500 | 34.818,21 € | 34.950,51 € | −132,30 € | −0,38 % |
| 5.000 | 46.131,32 € | 46.339,06 € | −207,74 € | −0,45 % |
| 7.000 | 61.126,20 € | 61.333,89 € | −207,69 € | −0,34 % |

Die verbleibende Abweichung entspricht exakt der Lohnsteuer-Differenz (Abschnitt 4), da die SV nun deckungsgleich ist. Der 7.000-€-Fall, der vor der Korrektur wegen der veralteten Höchstbeitragsgrundlage mit **+0,83 %** ausriss, liegt jetzt mit −0,34 % im Rahmen der übrigen Fälle.

### 2c. Vergleich vor/nach Korrektur (Jahresnetto-Abweichung)

| Brutto/Mt. | vor Korrektur | nach Korrektur |
|-----------:|--------------:|---------------:|
| 1.500 | +0,62 % | +0,58 % |
| 2.000 | −0,31 % | −0,36 % |
| 2.700 | −0,45 % | −0,47 % |
| 3.500 | −0,36 % | −0,38 % |
| 5.000 | −0,46 % | −0,45 % |
| 7.000 | **+0,83 %** | **−0,34 %** |

Hauptgewinn: Die SV ist jetzt exakt korrekt, und der Hochverdiener-Ausreißer ist beseitigt. Die Bandbreite ist enger und konsistenter.

---

## 3. Testfälle (Eingaben)

Im AK-Rechner für jeden Fall identisch gesetzt:

| Feld | Wert |
|------|------|
| Berufsgruppe | Angestellte/r |
| Bruttobezug | monatlich |
| Alleinverdiener-/Alleinerzieherabsetzbetrag | nein |
| Familienbonus Plus / Kinder | nein / 0 |
| Pendlerpauschale, Sachbezug, Pendlereuro | keine / 0 |

Getestete Bruttobeträge (€/Monat): **1.500 · 2.000 · 2.700 · 3.500 · 5.000 · 7.000**

In der App: Einkommensmodus „Bruttogehalt", monatlich, Wiedereinsteiger-Freibetrag aus, keine Kinder, keine Transfers — d. h. nur der reine Brutto-Netto-Kern (`calculateMonthlyNet`).

---

## 4. Offen: Lohnsteuer-Annäherung (geringe Priorität)

Die App überzeichnet die Lohnsteuer weiterhin leicht (mittlerer Bereich +1 bis +3 %), im Niedriglohnfall unterzeichnet sie:

| Brutto/Mt. | App Steuer/Jahr | AK Lohnsteuer/Jahr | Differenz |
|-----------:|----------------:|-------------------:|----------:|
| 1.500 | 15,46 € | 117,38 € | −101,92 € |
| 2.000 | 1.082,55 € | 1.000,99 € | +81,56 € |
| 2.700 | 2.860,49 € | 2.728,21 € | +132,28 € |
| 3.500 | 5.292,49 € | 5.160,19 € | +132,30 € |
| 5.000 | 11.169,68 € | 10.961,94 € | +207,74 € |
| 7.000 | 19.272,98 € | 19.065,25 € | +207,73 € |

Ursache: Die App annualisiert den Steuertarif und zieht pauschal **einmal** den Verkehrsabsetzbetrag (487 €) vom Jahres-Gesamtbetrag ab. Die AK rechnet die Lohnsteuer im monatlichen Tarif und verrechnet Absetzbeträge dort. Zusätzlich ist die Sonderzahlungs-Besteuerung der App vereinfacht (`(SZ-Basis − 620 €) × 6 %` flach, ohne die Sonderzahlungs-Freigrenze und die progressive Aufteilung der AK auf 13./14. Bezug). Beim Niedriglohnfall (1.500 €) liegt die App unter der AK, weil sie den vollen Verkehrsabsetzbetrag gegen die Summe aus laufender + Sonderzahlungssteuer rechnet, während die AK ihn nur gegen den laufenden Bezug verrechnet.

Die Abweichung liegt unter 0,6 % des Jahresnettos und wurde nicht als Bug, sondern als bewusste Modell-Vereinfachung eingestuft. Eine exakte Nachbildung würde die monatliche Lohnsteuertabelle samt Absetzbetrag-Logik erfordern.

---

## 5. Korrigiert: Anzeigewert „Netto/Monat" → echtes laufendes Netto (Variante A)

**Ausgangslage:** `calculateMonthlyNet` lieferte als `net` einen Mischwert (`monthlyGross − socialSecurity.total − annualTax/12`): Die Jahressteuer für 14 Bezüge wurde durch 12 geteilt und von einem einzelnen Bezug abgezogen. Dadurch war `net × 14 ≠` Jahresnetto, und der Wert war weder echtes Monatsnetto noch sauberer Jahresdurchschnitt.

**Umsetzung (Variante A — echtes Monatsnetto des laufenden Bezugs):** `calculateMonthlyNet` liefert nun zusätzlich `netLaufend` und `monthlyTaxLaufend`. Das laufende Netto bildet die Lohnabrechnung ab: `netLaufend = monthlyGross − socialSecurity.total − (regularTax − Verkehrsabsetzbetrag − weitere Absetzbeträge)/12`. Die Sonderzahlungs-Steuer wird **nicht** mehr in die 12 Monate verschmiert; Absetzbeträge werden nur gegen den laufenden Bezug verrechnet.

Die gesamte App-Anzeige wurde auf `netLaufend` umgestellt — damit ist sichergestellt, dass Hero, Breakdown, Chart und Empfehlungen denselben Wert verwenden:

- **Chart Monatsansicht** (`chart.js`) — Nettoeinkommen-Linie, Bedarfsprüfungen und „Was bleibt".
- **Chart Jahresansicht** (`chart.js`) — unverändert volles Jahresnetto inkl. 13./14. Bezug (`Brutto×14 − annualSocialSecurity − annualTax`).
- **Hero & Breakdown-Tabelle** (`form.js`) — „Was bleibt", „Netto & Steuergutschriften", Lohnsteuer-Zeile (`monthlyTaxLaufend`).
- **Empfehlungen** (`recommendations.js`) — Wiedereinsteiger-Delta auf gleicher Basis wie das angezeigte „Was bleibt".
- **Armutsfalle-Seite** (`poverty-trap.js`) — Szenario-Netto und disposable income.

**Verifikation im Browser:** Hero „Was bleibt" stimmt jetzt am Eingabe-Marker exakt mit der Chart-„Was bleibt"-Linie überein (4 Szenarien getestet: Single, Alleinerziehend mit 2 Kindern, Paar mit Partnereinkommen, Hochverdiener — alle Abweichung ≤ 1 €, keine JS-Fehler). Breakdown-Arithmetik konsistent: z. B. 2.700 € − SV 495 € − Lohnsteuer (laufend) 219 € = 1.986 € Netto. Jahresansicht zeigt unverändert die vollen Jahreswerte (z. B. Gesamtbrutto 38.000 €/Jahr → Jahresnetto 28.202 €).

**Hinweis:** Das echte laufende Netto liegt minimal unter dem AK-Wert „Netto laufend" (bei 2.700 €: App 1.986 € vs. AK 1.997 €) — die Differenz von ~11 € stammt aus der vereinfachten Lohnsteuer-Annäherung (Abschnitt 4), nicht aus der Netto-Definition.

---

## 6. Rohdaten

### App nach Korrektur (`TaxCalculator.calculateMonthlyNet`, im Browser ausgelesen)

`netLaufend` ist der app-weit angezeigte Wert (laufendes Monatsnetto); `Steuer/Jahr` und `Jahresnetto` enthalten zusätzlich die Sonderzahlungen (13./14.).

| Brutto/Mt. | SV laufend | SV/Jahr | LSt laufend/Mt. | netLaufend (Anzeige) | Steuer/Jahr | Jahresnetto |
|-----------:|-----------:|--------:|----------------:|---------------------:|------------:|------------:|
| 1.500 | 230,55 | 3.190,20 | 0,00 | 1.269,45 | 15,46 | 17.794,34 |
| 2.000 | 307,40 | 4.253,60 | 76,14 | 1.616,46 | 1.082,55 | 22.663,85 |
| 2.700 | 494,64 | 6.857,46 | 219,08 | 1.986,28 | 2.860,49 | 28.082,05 |
| 3.500 | 641,20 | 8.889,30 | 415,11 | 2.443,69 | 5.292,49 | 34.818,21 |
| 5.000 | 916,00 | 12.699,00 | 892,44 | 3.191,56 | 11.169,68 | 46.131,32 |
| 7.000 | 1.269,58 | 17.600,81 | 1.551,01 | 4.179,41 | 19.272,98 | 61.126,20 |

> Vergleich laufendes Netto App vs. AK: 1.500 € → 1.269,45 (exakt AK), 2.700 € → 1.986,28 (AK 1.997,30; −11 €), 5.000 € → 3.191,56 (AK 3.208,87; −17 €). Restdifferenz = Lohnsteuer-Annäherung (Abschnitt 4).

### AK-Brutto-Netto-Rechner (laufender Bezug + Jahresbezug)

| Brutto/Mt. | SV laufend | LSt laufend | Netto laufend | SV/Jahr | LSt/Jahr | Netto/Jahr |
|-----------:|-----------:|------------:|--------------:|--------:|---------:|-----------:|
| 1.500 | 230,55 | 0,00 | 1.269,45 | 3.190,20 | 117,38 | 17.692,42 |
| 2.000 | 307,40 | 69,34 | 1.623,26 | 4.253,60 | 1.000,99 | 22.745,41 |
| 2.700 | 494,64 | 208,06 | 1.997,30 | 6.857,46 | 2.728,21 | 28.214,33 |
| 3.500 | 641,20 | 404,09 | 2.454,71 | 8.889,30 | 5.160,19 | 34.950,51 |
| 5.000 | 916,00 | 875,13 | 3.208,87 | 12.699,00 | 10.961,94 | 46.339,06 |
| 7.000 | 1.269,58 | 1.533,70 | 4.196,72 | 17.600,86 | 19.065,25 | 61.333,89 |

### App vor Korrektur (zur Nachvollziehbarkeit)

| Brutto/Mt. | SV laufend | Steuer/Jahr | `net` |
|-----------:|-----------:|------------:|------:|
| 1.500 | 226,80 | 22,66 | 1.271,31 |
| 2.000 | 302,40 | 1.092,15 | 1.606,59 |
| 2.700 | 487,89 | 2.881,55 | 1.971,98 |
| 3.500 | 632,45 | 5.319,79 | 2.424,23 |
| 5.000 | 903,50 | 11.223,68 | 3.161,19 |
| 7.000 | 1.165,51 | 19.842,39 | 4.180,95 |

---

## 7. Geänderte Dateien

- `js/calculator.js` — `SOCIAL_SECURITY.maxMonthlyBase` 6450→6930; `SOCIAL_SECURITY.other` 0.01→0.0125; Sonderzahlungs-SV ohne Umlagen; `annualSocialSecurity` korrekt berechnet; neue Felder `netLaufend` und `monthlyTaxLaufend` (echtes laufendes Netto).
- `js/chart.js` — Monatsansicht nutzt `netLaufend`; `calculateAnnualNet` nutzt `taxResult.annualSocialSecurity` statt `socialSecurity.total * 14`.
- `js/form.js` — Hero und Breakdown nutzen `netLaufend`; Lohnsteuer-Zeile nutzt `monthlyTaxLaufend`.
- `js/recommendations.js` — Wiedereinsteiger-Delta (`calculateReentryDelta`) nutzt `netLaufend`.
- `js/poverty-trap.js` — Szenario-Berechnung (Armutsfalle-Seite) nutzt `netLaufend`.
- `index.html` — Cache-Versionen `?v=20260515-laufend` für `calculator.js`, `chart.js`, `form.js`, `recommendations.js`.
- `armutsfalle.html` — Cache-Versionen `?v=20260515-laufend` für `calculator.js` und `poverty-trap.js` (zuvor `ui3` — SV-Fix war dort noch nicht aktiv).

## 8. Hinweise

- Getestet wurde **nur der Brutto-Netto-Kern**. Familienbeihilfe, Wohnbeihilfe, Sozialhilfe und die übrigen Transfers (`benefits.js`) sind **nicht** Teil dieses Vergleichs.
- Die ALV-Staffelung für Geringverdiener (`ALV_GRADUATED_RATES`) stimmt mit der AK überein.
- Browser-Automatisierung gegen den AK-Rechner war wegen Domain-Sperren der Chrome-Extension nicht möglich; die AK-Werte wurden manuell aus dem Live-Rechner übernommen.
- Verifikation der korrigierten App: Werte im Browser aus dem geladenen `TaxCalculator` ausgelesen; App-UI (Hero, Breakdown-Tabelle, Chart, Empfehlungen) und die Armutsfalle-Seite rendern mit dem korrigierten Code fehlerfrei. Konsistenz Hero ↔ Chart am Eingabe-Marker über 4 Szenarien geprüft (Abweichung ≤ 1 €).
