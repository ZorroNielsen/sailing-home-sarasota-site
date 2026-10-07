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

## Při spuštění (až weby nahradí ty staré)

- Domény sailinghomesarasota.com (+ www) na Cloudflare, napojit na Pages projekt
- Smazat `Disallow: /` z `robots.txt` a `<meta name="robots" content="noindex…">` ze všech stránek
- Formuláře: v Resend přidat a ověřit doménu sailinghomesarasota.com (DNS záznamy SPF/DKIM/DMARC
  přidat v Cloudflare DNS), `MAIL_FROM` přepnout na adresu z ní (např.
  `website@sailinghomesarasota.com`), pak `FORMS_LIVE = "true"` — teprve tehdy chodí zprávy Jan.
  Bez ověřené domény padají e-maily do spamu (test 4. 10. 2026: všechny 3
  formuláře doručeny přes `onboarding@resend.dev`, ale do spamu).
- Turnstile: přidat ostré domény do hostnames widgetu
- Odkazy na Key Sailing (patička „Sail with Tim and Jan", About Jan) teď vedou na náhled `key-sailing-site.pages.dev` → při spuštění vrátit na `https://www.siestakeysailing.com`

## Lokální náhled

`.claude/launch.json` v kořeni workspace: konfigurace `sailing-home-sarasota-site`
(Python `http.server` na portu 8128) → http://localhost:8128
