# Verifikation: was-bleibt.at Brutto-Netto vs. AK-Brutto-Netto-Rechner

**Datum:** 2026-05-14
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
| 4 — Anzeigewert „Netto/Monat" konzeptionell inkonsistent | Konzeptionell | **Offen** — Produktentscheidung nötig (s. Abschnitt 5) |
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

## 5. Offen: Anzeigewert „Netto/Monat" (Produktentscheidung nötig)

`calculateMonthlyNet` liefert `net = monthlyGross − socialSecurity.total − annualTax/12`. Das ist ein Mischwert: Die Jahressteuer (für 14 Bezüge) wird durch 12 geteilt und von einem einzelnen der 14 Bezüge abgezogen. Folgen:

- `net × 14 ≠` rekonstruiertes Jahresnetto (bei 2.700 €: 1.966,99 × 14 = 27.537,86 € statt 28.082,05 €).
- Der Wert ist weder das echte Monatsnetto des laufenden Bezugs (AK: 1.997,30 €) noch ein sauberer Jahresdurchschnitt (28.082,05 / 12 = 2.340,17 €).

Dieser Befund wurde **bewusst nicht** im Alleingang geändert: Eine Korrektur ändert die Bedeutung des angezeigten „Netto"-Werts und greift in die Breakdown-Tabelle (`form.js`) und den Chart (`chart.js`) ein — Bereiche, an denen parallel an der UI gearbeitet wird. Es braucht zuerst eine Festlegung, was „Netto/Monat" in der App bedeuten soll:

- **Variante A:** echtes Monatsnetto des laufenden Bezugs (×12), Sonderzahlungen separat ausweisen — entspricht der Lohnabrechnung.
- **Variante B:** sauberer Jahresdurchschnitt (Jahresnetto / 12) — entspricht „was bleibt pro Monat" über das ganze Jahr.

Empfehlung: mit der UI-Arbeit abstimmen und dann konsistent in `calculator.js`, `form.js` (Breakdown) und `chart.js` umsetzen.

---

## 6. Rohdaten

### App nach Korrektur (`TaxCalculator.calculateMonthlyNet`, im Browser ausgelesen)

| Brutto/Mt. | SV laufend | SV/Jahr | Steuer/Jahr | `net` (Anzeige) | Jahresnetto |
|-----------:|-----------:|--------:|------------:|----------------:|------------:|
| 1.500 | 230,55 | 3.190,20 | 15,46 | 1.268,16 | 17.794,34 |
| 2.000 | 307,40 | 4.253,60 | 1.082,55 | 1.602,39 | 22.663,85 |
| 2.700 | 494,64 | 6.857,46 | 2.860,49 | 1.966,99 | 28.082,05 |
| 3.500 | 641,20 | 8.889,30 | 5.292,49 | 2.417,76 | 34.818,21 |
| 5.000 | 916,00 | 12.699,00 | 11.169,68 | 3.153,19 | 46.131,32 |
| 7.000 | 1.269,58 | 17.600,81 | 19.272,98 | 4.124,34 | 61.126,20 |

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

- `js/calculator.js` — `SOCIAL_SECURITY.maxMonthlyBase` 6450→6930; `SOCIAL_SECURITY.other` 0.01→0.0125; Sonderzahlungs-SV ohne Umlagen; `annualSocialSecurity` korrekt berechnet und im Rückgabeobjekt ergänzt.
- `js/chart.js` — `calculateAnnualNet` nutzt `taxResult.annualSocialSecurity` statt `socialSecurity.total * 14`.
- `index.html` — Cache-Version von `calculator.js` auf `?v=20260514-fix` gesetzt.

## 8. Hinweise

- Getestet wurde **nur der Brutto-Netto-Kern**. Familienbeihilfe, Wohnbeihilfe, Sozialhilfe und die übrigen Transfers (`benefits.js`) sind **nicht** Teil dieses Vergleichs.
- Die ALV-Staffelung für Geringverdiener (`ALV_GRADUATED_RATES`) stimmt mit der AK überein.
- Browser-Automatisierung gegen den AK-Rechner war wegen Domain-Sperren der Chrome-Extension nicht möglich; die AK-Werte wurden manuell aus dem Live-Rechner übernommen.
- Verifikation der korrigierten App: Werte im Browser aus dem geladenen `TaxCalculator` ausgelesen; App-UI (Hero, Breakdown-Tabelle, Chart, Empfehlungen) rendert mit dem korrigierten Code fehlerfrei.
