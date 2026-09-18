#!/bin/bash
# HETI NAPLÓ-ÖSSZEFOGLALÓ e-mail — vasárnap 20:00 (notes-error-digest.timer).
#
# MIÉRT. Nincs külön hibakövető (SaaS ütközik az elvekkel, önhosztolt drága/nehéz);
# a Pi journalja a hibakövető. Ez a heti err-sorokat AGGREGÁLJA és elküldi, hogy a
# rendszeres ránézés ember-független legyen. A levél MINDIG elmegy — akkor is, ha
# minden nulla (a user kérése): a nulla is hír (a monitorozás él).
#
# ⚠ SEMMI ÉRZÉKENY A LEVÉLBE. A mail a Gmailen (3. fél) megy át, ezért csak SZÁMOK,
# saját context-CÍMKÉK és útvonalak kerülnek bele — a hiba üzenete/verme SOHA. Ezt
# az AGGREGÁLÓ (backend/scripts/errorDigest.js) garantálja, teszttel őrizve; ez a
# szkript csak összegyűjti a bemenetet és elküldi az eredményt.
#
# ROOTKÉNT fut: a `journalctl -u notes` más egység naplóját olvassa, ahhoz root
# (vagy systemd-journal csoport) kell. Ezért a szkript root-tulajdonban,
# /usr/local/sbin-ben él, nem a repo-writable /opt-ban (l. notes-health.service).
#
# A kimenet a journalba megy:  journalctl -u notes-error-digest.service

set -uo pipefail

UNIT="notes.service"
SINCE="1 week ago"
NODE="/usr/bin/node"
DIGEST_JS="/opt/notes/backend/scripts/errorDigest.js"

# A health.env (SMTP-adatok) + a KÖZÖS levélküldő — mindkettő a szkript mellett,
# ugyanúgy, mint a health-check.sh-nál.
DIR="$(dirname "$(readlink -f "$0")")"
ENV_FILE="$DIR/health.env"
if [ -r "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    set -a; . "$ENV_FILE"; set +a
fi
MAIL_LIB="$DIR/mail-lib.sh"
if [ -r "$MAIL_LIB" ]; then
    # shellcheck disable=SC1090
    . "$MAIL_LIB"
else
    echo "Nincs mail-lib.sh ($MAIL_LIB) — nem tudok levelet küldeni."
    send_mail() { return 1; }
fi

# Az időszak felirata + a NEM-hiba szintek darabszáma (ezek CSAK SZÁMOK, nem
# tartalom): notice (5) és info (6) — a user kérte, hogy ezek is menjenek ki.
period="$(date -d "$SINCE" '+%Y-%m-%d') – $(date '+%Y-%m-%d')"
info_count="$(journalctl -u "$UNIT" --since "$SINCE" -p 6..6 -o cat 2>/dev/null | wc -l | tr -d '[:space:]')"
notice_count="$(journalctl -u "$UNIT" --since "$SINCE" -p 5..5 -o cat 2>/dev/null | wc -l | tr -d '[:space:]')"

# Az err-sorok JSON-ban az aggregálónak (a <3> err-prefixet a journald már
# lenyelte — l. src/log.js STDERR_PRIORITY). Az aggregáló csak biztonságos
# címkéket/számokat ad vissza.
digest="$(journalctl -u "$UNIT" --since "$SINCE" -p err -o json 2>/dev/null \
    | "$NODE" "$DIGEST_JS" "$info_count" "$notice_count" "$period" 2>/dev/null)"

# Ha az aggregálás bármiért nem sikerült, akkor is küldünk — a hiányt kimondva,
# hogy a néma elmaradás ne tűnjön "nincs hiba"-nak.
if [ -z "$digest" ]; then
    digest="A heti összefoglaló nem készült el (a journalctl vagy az aggregáló hibázott).
Nézd meg a gépen:  journalctl -u notes-error-digest.service -n 50
Nyers err-napló:    journalctl -u notes -p err --since \"$SINCE\""
fi

if send_mail "Notes heti napló-összefoglaló ($period)" "$digest"; then
    echo "Heti digest elküldve ($period)."
else
    echo "A heti digest NEM ment el (SMTP-hiba vagy hiányzó health.env)."
fi
