# sailing-home-sarasota-site

Nový web pro **Sailing Home Sarasota** (sailinghomesarasota.com) — Janina
kniha a neziskovka. Skutečný klient (Jan Hamel Solomon), ne ukázkový web.

## Status

**První verze (náhled pro Jan)** — hotová, 2. 10. 2026.
Od 4. 10. 2026 se pracuje **jen v tomhle repu**: [ZorroNielsen/sailing-home-sarasota-site](https://github.com/ZorroNielsen/sailing-home-sarasota-site)
(vzniklo kopií `adam-kriz/2-sailing-home-sarasota`, to staré už neupravovat).
Náhled (GitHub Pages): https://zorronielsen.github.io/sailing-home-sarasota-site/
Hosting: **Cloudflare Pages** (účet „Websitesbychris.co@gmail.com's Account"),
projekt `sailing-home-sarasota-site` → `sailing-home-sarasota-site.pages.dev`.

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
| `index.html` | Home — obálka knihy (zatím placeholder), text, tlačítka, upoutávka na About Jan |
| `about-jan-solomon/index.html` | About Jan — bio, fotka, Jan’s Links |
| `sample-chapter/index.html` | Ukázka knihy — úzký sloupec, velké písmo (serif 21 px, řádkování 1,8) |
| `speaking/index.html` | **Nová stránka** — formulář pro objednání přednášky |
| `contact-us/index.html` | Kontakt — formulář + e-mail a telefon |

- `style.css` — vzhled; barvy z loga SHS: modrá `#1876BC`, tmavší
  `#0F4F80`, žlutá `#FECC2D` jen jako drobný akcent, teplé „papírové"
  pozadí `#FBF8F3`. Stejné fonty jako web č. 1 (Source Serif 4 + Source
  Sans 3), aby oba weby působily jako rodina; tady je ale serif i pro
  běžný text (klidnější, knižní dojem).
- `js/main.js` — mobilní menu, hlavička mizí při scrollu dolů a vrací se
  při scrollu nahoru, odesílání formulářů přes `/api/contact`
- `functions/api/contact.js` — formuláře Speaking a Contact → e-mail přes Resend
- `wrangler.toml` — nastavení Cloudflare Pages; tajné klíče tu **nejsou**
- `404.html` — „Page not found" (absolutní cesty `/…`)
- `sitemap.xml` — adresy s ostrou doménou sailinghomesarasota.com
- `images/` — logo `SHS-logo2.png` a `About-Jan-Solomon.jpg` ze starého webu
- `robots.txt` + `noindex` — náhled se nemá objevit ve vyhledávačích

Hlavička a patička jsou **v každém HTML souboru zvlášť** — změna = změnit
v 6 souborech (včetně `404.html`). CSS/JS odkazy mají `?v=4`; po změně stylu číslo zvýšit,
aby prohlížeče načetly novou verzi.

## Funkce

- **Buy on Amazon** — zatím jen „Coming soon to Amazon" (čárkované
  tlačítko). Až bude odkaz, vyměnit za `<a class="btn btn-sea" href="…">Buy on Amazon</a>`
  na Home a na konci Sample Chapter.
- **Formuláře** (Speaking, Contact) → `POST /api/contact` (Pages Function)
  → Resend. Honeypot pole `website` + Cloudflare Turnstile (zatím **testovací**
  site key `1x00000000000000000000AA`, vyměnit za skutečný). **Bezpečnost:**
  dokud je ve `wrangler.toml` `FORMS_LIVE = "false"`, jde vše na `TEST_TO`,
  nikdy na Jan. Lokálně funkce neběží → formulář ukáže chybovou hlášku.

## Cloudflare — tajné klíče (dashboard → projekt → Settings → Variables and Secrets)

`RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `TEST_TO` — stejné jako u
key-sailing-site (viz jeho CLAUDE.md). Web Analytics se zapíná v dashboardu.

## Čeká se na Jan

- Obálka knihy (teď placeholder „Book cover")
- Odkaz na Amazon
- Jestli má kniha vlastní Facebook/Instagram
- Jestli dát na web celou knihu místo ukázky
- Později (ne v první verzi): dary (bez slov „tax-deductible" před
  501(c)(3)), dokument

## Při spuštění (až weby nahradí ty staré)

- Domény sailinghomesarasota.com (+ www) na Cloudflare, napojit na Pages projekt
- Smazat `Disallow: /` z `robots.txt` a `<meta name="robots" content="noindex…">` ze všech stránek
- Formuláře: v Resend ověřit doménu, přepnout `MAIL_FROM`, pak `FORMS_LIVE = "true"`
- Turnstile: přidat ostré domény do hostnames widgetu
- Odkazy na Key Sailing (patička „Sail with Tim and Jan", About Jan) teď vedou na náhled `zorronielsen.github.io/key-sailing-site/` → při spuštění vrátit na `https://www.siestakeysailing.com`

## Lokální náhled

`.claude/launch.json` v kořeni workspace: konfigurace `sailing-home-sarasota-site`
(Python `http.server` na portu 8128) → http://localhost:8128
