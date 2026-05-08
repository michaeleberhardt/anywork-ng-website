# anywork.ing — Marketing-Website

Schlanke Single-Pager-Website für [www.anywork.ing](https://www.anywork.ing) — drei HTML-Seiten, eine Cloudflare Pages Function für das Kontaktformular, kein Build-Step, keine Frameworks.

## Struktur

```
website/
├── index.html              # Single-Pager (Hero, Features, How, Trust, CTA)
├── impressum.html          # Pflicht-Impressum nach § 5 TMG (Platzhalter ausfüllen!)
├── kontakt.html            # Kontaktformular
├── _headers                # CF Pages: Security-Header, Cache-Control
├── _redirects              # CF Pages: Apex → www-Redirect
├── robots.txt              # Crawler-Regeln
├── sitemap.xml             # SEO
├── assets/
│   └── og-image.svg        # Open-Graph-Image für Link-Previews
└── functions/
    └── api/
        └── contact.js      # Pages Function: POST /api/contact (E-Mail-Versand via Resend)
```

## Lokal ansehen

Reines HTML — einfach öffnen:

```bash
# einfaches Vorschau-Server (Python 3)
cd website && python3 -m http.server 8080
# → http://localhost:8080
```

Für die Pages Function lokal zu testen brauchst du `wrangler` (siehe ganz unten).

## Deployment auf Cloudflare Pages

### Schritt 1 — Cloudflare-Konto + Pages-Projekt

1. Bei [cloudflare.com](https://cloudflare.com) einloggen → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. GitHub-Repo `michaeleberhardt/anywork-ng` auswählen, Berechtigung erteilen
3. Build-Settings:
   - **Project name:** `anywork-website` (oder beliebig)
   - **Production branch:** `main`
   - **Framework preset:** *None*
   - **Build command:** *(leer lassen)*
   - **Build output directory:** `website`
   - **Root directory:** *(leer lassen — Repo-Root)*
4. Save and Deploy → erste Auslieferung läuft automatisch unter `<project>.pages.dev`

### Schritt 2 — Custom Domain `www.anywork.ing`

Im Pages-Projekt → **Custom domains** → **Set up a custom domain** → `www.anywork.ing` eingeben.

Cloudflare gibt dir nun zwei Möglichkeiten je nach DNS-Setup:

**Variante A — DNS bei Cloudflare (empfohlen, ein Klick):**

1. Domain `anywork.ing` als „Site" zu Cloudflare hinzufügen ([dash.cloudflare.com](https://dash.cloudflare.com) → **Add a Site**)
2. Cloudflare zeigt zwei Nameserver-Adressen (z. B. `xyz.ns.cloudflare.com`)
3. Bei netcup im Domain-Panel → Nameserver → Cloudflare-Werte hinterlegen
4. Warten bis DNS-Propagation durch ist (typisch 1–4 Stunden)
5. Im Pages-Custom-Domain-Dialog wird dann automatisch ein CNAME `www → <project>.pages.dev` angelegt
6. Apex `anywork.ing` → mit dem `_redirects`-File in diesem Ordner wird automatisch auf `www` umgeleitet

**Variante B — DNS bleibt bei netcup:**

1. Bei netcup im DNS-Editor:
   - Type `CNAME`, Host `www`, Ziel `<project>.pages.dev` (genauer Wert wird im Pages-Dashboard gezeigt)
2. Apex `anywork.ing` → netcup unterstützt kein ANAME/ALIAS auf externe CNAMEs. Lösung: bei netcup eine **Domain-Weiterleitung** von `anywork.ing` → `https://www.anywork.ing` einrichten (im netcup-CCP unter Domain → Weiterleitung)
3. Pages erkennt das CNAME, stellt automatisch ein TLS-Zertifikat aus und schaltet die Custom Domain live

### Schritt 3 — Resend API für Kontaktformular

Das Kontaktformular nutzt [Resend](https://resend.com) zum Mail-Versand (Free Tier: 100 Mails/Tag, 3.000/Monat — ausreichend für ein Kontaktformular).

1. Account bei resend.com anlegen
2. **Domain** verifizieren: `anywork.ing` hinzufügen → Resend zeigt SPF + DKIM DNS-Records
3. Diese Records bei Cloudflare DNS (oder netcup, je nach Variante oben) eintragen
4. Sobald grün: API-Key generieren unter **API Keys** → Berechtigung „Sending access" reicht
5. In Cloudflare Pages: **Project → Settings → Environment variables**:
   ```
   RESEND_API_KEY = re_xxxxxxxxxxxxxxxxxxxxxxxx
   FROM_EMAIL     = kontakt@anywork.ing
   TARGET_EMAIL   = kontakt@anywork.ing
   ```
   (FROM_EMAIL muss auf die in Resend verifizierte Domain enden, sonst wird der Mail-Versand abgelehnt.)
6. **Deployments** → erneut deployen, damit die Environment-Variablen aktiv werden

### Schritt 4 — Verifikation

- `https://www.anywork.ing/` lädt Index → ✅
- `https://anywork.ing/` redirectet auf `www` → ✅
- `https://www.anywork.ing/impressum.html` → Impressum sichtbar
- `https://www.anywork.ing/kontakt.html` → Kontaktformular
  - Formular ausfüllen → Submit → Success-Hinweis
  - Mail kommt bei `TARGET_EMAIL` an
- Sicherheits-Header in DevTools-Network-Tab prüfen (CSP, HSTS, X-Frame-Options)

## Inhalt aktualisieren

Reines HTML — direkt im Editor ändern, `git push`. Cloudflare Pages baut den `website`-Ordner automatisch neu (typisch < 30 Sekunden).

Pull-Request gegen `main` erzeugt automatisch eine **Preview-Deployment** unter `<branch>--<project>.pages.dev` — perfekt zum Gegenlesen vor Merge.

## Pflicht vor Live-Schaltung

- [ ] **`impressum.html`** — alle `{Platzhalter}` durch echte Anbieter-Daten ersetzen (Firma, Anschrift, Geschäftsführer, HRB, USt-ID, Telefon)
- [ ] **`kontakt@anywork.ing`** als E-Mail-Adresse einrichten und im Resend-Account verifizieren
- [ ] **Datenschutzerklärung ergänzen?** — sobald die Site Tracking-Tools, Analytics oder Cookies einsetzt, ist eine separate Datenschutzerklärung nötig. Aktuell: keine Cookies, kein Tracking → Hinweis im Impressum reicht. Wenn das später dazu kommt: separate `datenschutz.html` anlegen und im Footer verlinken.
- [ ] **Test-Submit** auf produktiver Site, um End-to-End-Mail-Pfad zu verifizieren

## Lokales Testen der Pages Function

Wenn du die Function vor dem Push testen willst:

```bash
npm install -g wrangler
cd website
wrangler pages dev . --port 8788
# Function läuft unter http://localhost:8788/api/contact
```

Setze Environment-Variablen lokal in einer `.dev.vars`-Datei (nicht committen!):

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=kontakt@anywork.ing
TARGET_EMAIL=deine-test-mail@example.com
```

## Lifecycle

Diese Website ist **bewusst von der App entkoppelt**. Vorteile:

- Keine App-Test-Pipeline blockiert Marketing-Edits
- Marketing-Site bleibt verfügbar, auch wenn die App-Plattform Wartung hat
- 0 € Hosting-Kosten (CF Pages Free Tier)
- Globales Edge-Caching ohne extra Aufwand
- Preview-Deploys pro PR

Wenn dieser Ordner irgendwann groß wird (mehrere Sprachen, Produkt-Subseiten, Blog), kann er ein eigenes Repo bekommen — das Cloudflare-Pages-Projekt zieht dann einfach um. Bis dahin: ein Ordner im Hauptrepo reicht.
