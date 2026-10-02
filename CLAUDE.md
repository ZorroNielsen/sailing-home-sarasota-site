# 2-sailing-home-sarasota

Nový web pro **Sailing Home Sarasota** (sailinghomesarasota.com) — Janina
kniha a neziskovka. Skutečný klient (Jan Hamel Solomon), ne ukázkový web.

## Status

**První verze (náhled pro Jan)** — hotová, 2. 10. 2026.
Repo: [adam-kriz/2-sailing-home-sarasota](https://github.com/adam-kriz/2-sailing-home-sarasota).
Náhled (GitHub Pages): https://adam-kriz.github.io/2-sailing-home-sarasota/

Tohle je **web č. 2 ze dvou** ze stejného zadání (proto „2-" v názvu).
Web č. 1: `../1-key-sailing-sarasota/` (Key Sailing, plavby s Timem a Jan).

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
  při scrollu nahoru, formuláře v náhledu nic neodesílají
- `images/` — logo `SHS-logo2.png` a `About-Jan-Solomon.jpg` ze starého webu
- `robots.txt` + `noindex` — náhled se nemá objevit ve vyhledávačích

Hlavička a patička jsou **v každém HTML souboru zvlášť** — změna = změnit
v 5 souborech. CSS/JS odkazy mají `?v=2`; po změně stylu číslo zvýšit,
aby prohlížeče načetly novou verzi.

## Funkce

- **Buy on Amazon** — zatím jen „Coming soon to Amazon" (čárkované
  tlačítko). Až bude odkaz, vyměnit za `<a class="btn btn-sea" href="…">Buy on Amazon</a>`
  na Home a na konci Sample Chapter.
- **Formuláře** (Speaking, Contact) — v náhledu jen ukážou „Thanks for
  contacting us". Ostrá verze má posílat na sailinghomesarasota@gmail.com.

## Čeká se na Jan

- Obálka knihy (teď placeholder „Book cover")
- Odkaz na Amazon
- Jestli má kniha vlastní Facebook/Instagram
- Jestli dát na web celou knihu místo ukázky
- Později (ne v první verzi): dary (bez slov „tax-deductible" před
  501(c)(3)), dokument

## Při spuštění (až weby nahradí ty staré)

- Smazat `robots.txt` a `<meta name="robots" content="noindex…">` ze všech stránek
- Zapnout skutečné odesílání formulářů
- Odkazy na Key Sailing (patička „Sail with Tim and Jan", About Jan) teď vedou na náhled `adam-kriz.github.io/1-key-sailing-sarasota/` → při spuštění vrátit na `https://www.siestakeysailing.com`

## Lokální náhled

`.claude/launch.json` v kořeni workspace: konfigurace `2-sailing-home-sarasota`
(Python `http.server` na portu 8128) → http://localhost:8128
