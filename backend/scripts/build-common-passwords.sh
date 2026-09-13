#!/usr/bin/env bash
#
# A GYAKORI-JELSZÓ-LISTA ÚJRAGENERÁLÁSA — dokumentált, megismételhető folyamat.
#
# MIÉRT LÉTEZIK. A backend/src/data/common-passwords.txt-t (a regisztráció
# gyenge-jelszó szűrője, l. src/commonPasswords.js) eredetileg kézzel állítottuk
# elő egy curl+szűrő lánccal. Egy kézzel, dokumentálatlanul készült adatfájl a
# projekt egyik visszatérő csapdája: senki nem tudja később, HOGYAN jött létre,
# és nem is tudja reprodukálni/frissíteni. Ez a szkript kimondja a folyamatot, így
# a lista egyparanccsal újragyártható.
#
# MIKOR FUSSON. NEM automatikusan, nincs timer mögötte. Ez fejlesztői/karbantartói
# eszköz: futtasd kézzel, ha frissíteni akarod a listát. A frissítés ritkán éri
# meg — a legygyakoribb ~10 000 jelszó évről évre alig változik —, de ha egy új,
# jelentős szivárgás-korpusz elérhető, vagy évente egyszer, ez az eszköz elvégzi.
# Internetet igényel (a forrás letöltése); futásidőben (az appban) SOHA nincs
# külső hívás — ezért is HELYI a lista.
#
# A FORRÁS. A SecLists xato-net listája, gyakoriság szerint rendezve (a
# leggyakoribb elöl). A top-1M-ből szűrünk, és a leggyakoribb 10 000 SZŰRT
# jelszót tartjuk meg.
#
# A SZŰRŐ — és miért pont ez (l. src/commonPasswords.js indoklását is). A lista
# bejegyzéseit KISBETŰSÍTVE tároljuk, és a create.js a bemenetet is kisbetűsítve
# keresi. Ezért csak azt tartjuk meg, amivé egy FORMAILAG ÉRVÉNYES jelszó
# (PASSWORD_RULE: kis+nagy+szám, >=8) kisbetűsítve válhat: `[a-z0-9]`, legalább
# 8 karakter, van benne betű ÉS szám. Ami a formai szabályt amúgy sem ütné meg
# (pl. a csupa kisbetűs "password"), azt kihagyjuk — a create.js már a formánál
# elutasítja, tárolni fölösleges súly.
#
# HASZNÁLAT:  bash backend/scripts/build-common-passwords.sh
set -euo pipefail

readonly SOURCE_URL="https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt"
readonly KEEP_COUNT=10000

# A célfájl a szkript helyéhez képest (backend/scripts → backend/src/data).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly OUTPUT="${SCRIPT_DIR}/../src/data/common-passwords.txt"

tmp_source="$(mktemp)"
tmp_filtered="$(mktemp)"
tmp_output="$(mktemp)"
trap 'rm -f "$tmp_source" "$tmp_filtered" "$tmp_output"' EXIT

echo "Letöltés: $SOURCE_URL"
curl -fsSL "$SOURCE_URL" -o "$tmp_source"
echo "Forrás sorok: $(wc -l < "$tmp_source")"

# A lánc, sorrendtartással:
#   tr    → kisbetűsítés
#   grep  → csak [a-z0-9]{8,} (a formailag érvényesből ez lehet)
#   grep  → legyen benne betű ÉS szám (különben a formai szabály elkapná)
#   awk   → sorrendtartó deduplikálás (a gyakorisági sorrend megmarad)
#
# A HEAD KÜLÖN LÉPÉS, FÁJLBÓL. Ha a `head -n N` közvetlenül a csőben lenne, korán
# lezárná azt, és az upstream (tr/grep) SIGPIPE-ot kapna — amit a `set -o pipefail`
# HIBÁNAK vesz (exit 141), pedig a kimenet helyes. Ezért a szűrt listát előbb egy
# fájlba írjuk, és a `head` onnan (nem csőből) olvas: így nincs korai csőzárás.
tr 'A-Z' 'a-z' < "$tmp_source" \
  | grep -E '^[a-z0-9]{8,}$' \
  | grep -E '[a-z]' \
  | grep -E '[0-9]' \
  | awk '!seen[$0]++' > "$tmp_filtered"
head -n "$KEEP_COUNT" "$tmp_filtered" > "$tmp_output"

kept="$(wc -l < "$tmp_output")"
if [ "$kept" -lt "$KEEP_COUNT" ]; then
    echo "FIGYELEM: csak $kept sor jött ki (elvárt $KEEP_COUNT) — a forrás vagy a szűrő változott?" >&2
fi

mv "$tmp_output" "$OUTPUT"

# JOGOSULTSÁG — ez nem formaság, MÉRVE (2026-09-06) egy éles leállással.
# A `mktemp` 600-as (csak a tulaj olvashatja) fájlt ad, és a `mv` ezt a jogot
# viszi tovább. Az appot viszont egy KÜLÖN, jogosulatlan user futtatja (l. deploy/),
# ami így NEM tudná elolvasni a listát: a commonPasswords.js induláskor EACCES-szel
# elszáll, és a service restart-loopba kerül. A lista PUBLIKUS adat (nem titok),
# ezért 644 (mindenki olvashatja) a helyes és biztonságos jog.
chmod 644 "$OUTPUT"
echo "Kész: $kept sor → $OUTPUT (jog: 644)"
