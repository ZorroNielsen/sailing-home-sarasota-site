# sailing-home-sarasota-site

Nový web pro **Sailing Home Sarasota** (sailinghomesarasota.com) — Janina
kniha a neziskovka. Skutečný klient (Jan Hamel Solomon), ne ukázkový web.

## Status

**První verze (náhled pro Jan)** — hotová, 2. 10. 2026.
Od 4. 10. 2026 se pracuje **jen v tomhle repu**: [ZorroNielsen/sailing-home-sarasota-site](https://github.com/ZorroNielsen/sailing-home-sarasota-site)
(vzniklo kopií `adam-kriz/2-sailing-home-sarasota`, to staré už neupravovat).
Náhled: https://sailing-home-sarasota-site.pages.dev/ (starý náhled na GitHub Pages už neaktualizovat, neběží tam formuláře)
Hosting: **Cloudflare Pages** (účet „Websitesbychris.co@gmail.com's Account"),
projekt `sailing-home-sarasota-site` → `sailing-home-sarasota-site.pages.dev`.

**Nový design (7. 10. 2026):** stejný vzhled jako nový web Key Sailing (styl
lightshiprv.com) — oba Janiny weby teď působí jako jedna rodina.

Web č. 2 ze dvou. Web č. 1: `../key-sailing-site/` (Key Sailing, plavby s Timem a Jan).

## Hlavní pravidlo

**Text je Janin, slovo od slova.** Nic nepřidáváme, nic neubíráme.
Text se bral přímo ze starého webu (WordPress/Divi, staženo 2. 10. 2026).
Sample chapter ověřen skriptem: 7 142 slov, stejné pořadí jako na starém webu.

Vědomé odchylky od starého webu:
- ©2021 → ©2026.
- „Jan’s Links-" → nadpis „Jan’s Links" (bez pomlčky na konci).
- Telefon + e-mail z horní lišty starého webu jsou teď v hlavičce (telefon)
  a v patičce (oba).
- Ikony Facebook/Instagram vynechány — vedou na účty Key Sailing, ne knihy
  (podle briefu: zeptat se Jan, jestli má kniha vlastní).
- Menu podle briefu: Home, About Jan, Sample Chapter, Speaking, Contact
  (starý web měl „Sample Chapters" a „Contact Us").
- Úprava od Jan (12. 10. 2026): „40,000 guests agree“ → „60,000 guests agree“ na Home
  (About the Author) i na About Jan (stejné číslo jako „approximately 60,000“ na Key Sailing).

## Struktura

Statický web, bez build stepu. Stránky jsou ve složkách, aby fungovaly
**staré adresy z WordPressu**:

| Soubor | Stránka |
|---|---|
| `index.html` | Home — obálka knihy (`images/book-cover.jpg`, od Jan 7. 10. 2026), text, tlačítka, upoutávka na About Jan |
| `about-jan-solomon/index.html` | About Jan — bio, fotka, Jan’s Links |
| `sample-chapter/index.html` | Ukázka knihy — úzký sloupec, velké písmo (serif 21 px, řádkování 1,8) |
| `speaking/index.html` | **Nová stránka** — formulář pro objednání přednášky |
| `contact-us/index.html` | Kontakt — formulář + e-mail a telefon |

- `style.css` — vzhled, stejný jako nový Key Sailing: bílá stránka, písmo **Hanken
  Grotesk**, obří nadpisy, zaoblené fotky, béžové panely `#F3F0EA` (třída `.white`),
  zaoblená tlačítka, světlá patička. Vlastní akcent = modrá z loga SHS (tlačítka
  `#145F99`, odkazy `#1876BC`), žlutá `#FECC2D` jen jako proužek nad úryvkem.
  Slova z knihy (úryvek na Home, Sample Chapter) jsou v patkovém **Source Serif 4**,
  aby se četla jako kniha. Obálka na Home je v béžovém rámu.
- `js/main.js` — mobilní menu, hlavička mizí při scrollu dolů a vrací se
  při scrollu nahoru, odesílání formulářů přes `/api/contact`
- `functions/api/contact.js` — formuláře Speaking a Contact → e-mail přes Resend
- `wrangler.toml` — nastavení Cloudflare Pages; tajné klíče tu **nejsou**
- `404.html` — „Page not found" (absolutní cesty `/…`)
- `sitemap.xml` — adresy s ostrou doménou sailinghomesarasota.com
- `images/` — logo `SHS-logo2.png` a `About-Jan-Solomon.jpg` ze starého webu
- `robots.txt` + `noindex` — náhled se nemá objevit ve vyhledávačích
- `originals/` — **je v `.gitignore`**, jen na Adamově Macu. `stary-web/` = kompletní kopie
  starého WordPress webu (stažená 12. 10. 2026 před spuštěním): všech 5 stránek + Sample Page
  a Hello World, fotky z `wp-content/uploads` (i originály), obě PDF (About-Jan-Solomon,
  SHS-Sample), styly a skripty Divi, 9 MB; seznam v `seznam-sailinghomesarasota.com.csv`.

Hlavička a patička jsou **v každém HTML souboru zvlášť** — změna = změnit
v 6 souborech (včetně `404.html`). CSS/JS odkazy mají `?v=6`; po změně stylu číslo zvýšit,
aby prohlížeče načetly novou verzi.

## Funkce

- **Buy on Amazon** — zatím jen „Coming soon to Amazon" (čárkované
  tlačítko). Až bude odkaz, vyměnit za `<a class="btn btn-sea" href="…">Buy on Amazon</a>`
  na Home a na konci Sample Chapter.
- **Formuláře** (Speaking, Contact) → `POST /api/contact` (Pages Function)
  → Resend. Honeypot pole `website` + Cloudflare Turnstile (widget „Sarasota sites",
  site key `0x4AAAAAAFNkFBzFm2CQXTsB`, společný s key-sailing-site). **Bezpečnost:**
  dokud je ve `wrangler.toml` `FORMS_LIVE = "false"`, jde vše na `TEST_TO`,
  nikdy na Jan. Lokálně funkce neběží → formulář ukáže chybovou hlášku.
- **Video z Facebooku** na Home (pod úryvkem z knihy), stejné jako na About Us
  webu Key Sailing: embed `plugins/video.php` videa
  facebook.com/DiegoRosalesUHD/videos/1249196727281841 (Tim ve Washingtonu,
  španělsky, na výšku). Nestahuje se, jen vkládá (přání Jan, 7. 10. 2026).
- **Editor pro Jan** (`/admin/`): stejný jako na key-sailing-site (soubory `admin/*` a
  `functions/api/admin/[[path]].js` jsou totožné) — text a fotky klepnutím, Publish = commit,
  History → Undo, přihlášení Cloudflare Access (`EDITORS` ve `wrangler.toml`),
  secret `GITHUB_TOKEN` (fine-grained, jen tohle repo, Contents: R/W). Popis v CLAUDE.md
  key-sailing-site.

## Cloudflare — tajné klíče (dashboard → projekt → Settings → Variables and Secrets)

`RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `TEST_TO` — stejné jako u
key-sailing-site (viz jeho CLAUDE.md). Web Analytics se zapíná v dashboardu.

## Čeká se na Jan (aktuální k 7. 10. 2026)

- Odkaz na Amazon
- Potvrdit, že facebookové video (Tim ve Washingtonu) je to správné
- Jestli má kniha vlastní Facebook/Instagram
- Jestli dát na web celou knihu místo ukázky
- „Home in a Helicopter" v ukázce vypadá jako nadpis přilepený k předchozímu
  řádku — má to být samostatný nadpis?
- Volitelně: čistý portrét Jan a fotka z přednášky (pro Speaking);
  1–2 věty jejími slovy o tom, o čem přednáší
- Ke spuštění: schválení náhledu; přístup k doméně sailinghomesarasota.com;
  jestli Jan používá e-mail na doméně (pak zachovat MX záznamy)
- Později (ne v první verzi): dary (bez slov „tax-deductible" před
  501(c)(3)), dokument

## Spuštění (12. 10. 2026) — hotovo

Web běží na **https://sailinghomesarasota.com** (Cloudflare Pages, zóna na Cloudflaru). Zkontrolováno
13. 10. 2026: https na obou adresách, http → https, **www → bez www** (301), všechny stránky 200,
`robots.txt` otevřený, žádné `noindex`, `/admin` za přihlášením, Turnstile přijímá doménu i www,
`/api/contact` bez tokenu odmítne. Doména nemá e-mail (žádné MX).
- `_redirects` (13. 10. 2026): staré adresy WordPressu → nové stránky (PDF ukázky → Sample
  Chapter, PDF/fotka About Jan → About Jan, `sample-page`, `hello-world`, `feed` → Home).
  `/?p=…` přesměrovat nejde (Pages nepracuje s query), končí na Home.

- Strukturovaná data (13. 10. 2026): Home = `WebSite` + `Book` (autorka Jan, obálka, ukázka),
  About Jan = `Person`; `llms.txt` v kořeni = krátké shrnutí pro AI. Až bude odkaz na Amazon,
  doplnit ho i do `Book` (`offers` / `sameAs`) a do `llms.txt`.

**Zbývá:** Google Search Console (ověřit doménu, poslat `sitemap.xml`).

## Lokální náhled

`.claude/launch.json` v kořeni workspace: konfigurace `sailing-home-sarasota-site`
(Python `http.server` na portu 8128) → http://localhost:8128
