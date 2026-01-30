# vite_critical

Die `vite_critical` Extension ist ein leistungsstarkes Tool zur automatisierten Generierung und Einbindung von Critical CSS in TYPO3 v12 Umgebungen unter Verwendung von Vite. Sie reduziert das "Render-Blocking" von CSS-Assets signifikant und verbessert die PageSpeed-Werte (Lighthouse/Web Vitals).

## Kernfunktionen
*   **Automatisierte Generierung:** Extrahiert Critical CSS direkt aus der laufenden Webseite (DDEV, Staging oder Live).
*   **Site-Config-Driven:** Nutzt die TYPO3 Standortkonfiguration (`config.yaml`) als einzige Datenquelle ("Source of Truth").
*   **PID-Spezifisch:** Ermöglicht individuelles Critical CSS für spezifische Seiten (z.B. Homepage vs. Landingpage).
*   **Vite Integration:** Aktualisiert das Vite-Manifest automatisch und ordnet Assets seitenspezifisch zu.
*   **Kontext-Awareness:** Unterstützt verschiedene Umgebungen (`Development`, `Testing`, `Production`).
*   **Security:** Bypasst bestehendes Critical CSS während der Generierung via Query-Parameter, um Verfälschungen zu vermeiden.

## Konfiguration in TYPO3 (`config.yaml`)
Die Steuerung erfolgt pro Site in der jeweiligen `config.yaml` (z.B. `config/sites/bob/config.yaml`).

```yaml
viteCritical:
  criticalCss:
    enable: true
    # Mapping von Templates zu PIDs
    entryPointForPid:
      default: '1'          # Template 'default' für PID 1
      digitalnavy: '1056, 1059' # Template 'digitalnavy' für diese PIDs

    # Optionale site-spezifische Einstellungen
    settings:
      width: 1280           # Viewport Breite
      height: 1024          # Viewport Höhe
      forceInclude:         # Diese Selektoren immer beibehalten
        - ".special-class"
```

## Globale Defaults (`critical.yaml`)
Im Root-Verzeichnis befindet sich die `critical.yaml` für globale Standardwerte (Post-Processing, Puppeteer-Args). Diese müssen in der Regel nicht angefasst werden.

## Workflow der Generierung
Die Generierung erfolgt über ein Node.js Skript, das idealerweise als `postbuild` Hook in der `package.json` ausgeführt wird.

**Befehle:**
*   **Standard (Staging):** `npm run build` (führt `node generate-critical.js --env Testing` aus).
*   **Produktion:** `node generate-critical.js --env Production` (nutzt die Live-URL der Site-Config).
*   **Lokal:** `node generate-critical.js --env Development` (nutzt die DDEV-URL).

**Was passiert intern?**
1.  Das Skript scannt `config/sites/*/config.yaml`.
2.  Es ermittelt die korrekte URL für den gewählten Kontext.
3.  Ein TYPO3-Command (`vite_critical:get-slugs`) löst die PIDs in echte Slugs auf.
4.  Puppeteer ruft die Seite mit `?tx_vitecritical_css[omit]=1` auf (deaktiviert bestehendes Critical CSS).
5.  Penthouse extrahiert das CSS, PostCSS optimiert es.
6.  Das Vite-Manifest (`manifest.json`) wird um das Feld `criticalPids` erweitert.

## Technische Details & Best Practices
*   **Frontend-Injektion:** Der `ViteService` (Xclass) injiziert das CSS inline in den `<head>`. Alle anderen Stylesheets werden automatisch auf `rel="preload"` umgestellt.
*   **Browser:** In der DDEV-Umgebung wird der systemeigene Chromium unter `/usr/bin/chromium` verwendet.
*   **Cache:** Bei Verwendung des `omit`-Parameters wird die Seite via TypoScript (`config.no_cache = 1`) am Cache vorbeigeführt, um immer den aktuellen Stand der Stylesheets zu erhalten.
*   **Fehlerbehandlung:** Das Skript prüft den HTTP-Statuscode der Seite. Nur bei `200 OK` wird ein Critical CSS generiert.

## Voraussetzungen
*   TYPO3 v12.4 LTS
*   Vite Build-Prozess mit `manifest.json`
*   Node.js (Puppeteer, Penthouse, PostCSS)
*   DDEV (empfohlen für die lokale Ausführung)

## Changelog

### v2.0.0
- **Vollständige Automatisierung**: Die Generierung basiert nun direkt auf den TYPO3 Site-Konfigurationen (`config/sites/*/config.yaml`). Die manuelle Pflege der `PAGES` Sektion in der `critical.yaml` entfällt.
- **TYPO3 Console Command**: Neuer Command `vite_critical:get-slugs` zur automatisierten Auflösung von PIDs in Slugs während des Build-Prozesses.
- **Konfliktvermeidung**: Einführung des Query-Parameters `tx_vitecritical_css[omit]=1` und entsprechender TypoScript-Logik, um bestehendes Critical CSS während der Extraktion zu umgehen.
- **HTTP Status Check**: Das Skript prüft nun den Statuscode der Seite (nur 200 OK wird verarbeitet).
- **Stabilität**: Optimiertes Browser-Lifecycle-Management für Puppeteer/Penthouse (besonders in DDEV-Umgebungen).
- **Site-spezifische Settings**: Rendering-Parameter wie Viewport-Größe oder `forceInclude` können nun direkt in der `config.yaml` der Site definiert werden.
- **Dokumentation**: Umfassende Aktualisierung der README.md.

### v1.x.x
- Initialer Support für Critical CSS Generierung mit Vite und TYPO3.
- Manuelle Konfiguration via `critical.yaml`.

## Google Reference
https://web.dev/articles/defer-non-critical-css?hl=de
