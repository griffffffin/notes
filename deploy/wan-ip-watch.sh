#!/bin/sh
# A PUBLIKUS IP FIGYELÉSE — a VPN egyetlen mozgó alkatrésze.
#
# Miért kell: a szolgáltatói cím DINAMIKUS (lakossági kábel-pool), a WireGuard
# kliens-konfigokban viszont egy KONKRÉT cím áll `Endpoint`-ként. Ha a cím
# megváltozik, a VPN NÉMÁN elhal: a kliens hibaüzenet nélkül próbálkozik tovább
# egy olyan címen, ahol már más van. Se hiba, se napló — csak "valamiért nem
# jövök be távolról".
#
# Miért NEM klasszikus DDNS: ahhoz fiók kellene egy külső szolgáltatónál, aki
# ezzel folyamatosan tudná, mikor és honnan változik az otthoni címünk. A
# projekt elve a minimális harmadik fél, ezért itt csak MEGFIGYELÜNK és
# ÉRTESÍTÜNK — a levélben ott az új cím, amivel a konfig egy perc alatt
# javítható, akár telefonról is. (Ha egyszer mégis kell valódi DDNS, a
# deSEC.io a legjobb jelölt: nonprofit, nyílt forrású, DNSSEC-es.)
#
# A LEKÉRDEZÉS DNS-SEL megy, nem HTTP-vel: egyetlen UDP-csomag, nincs
# User-Agent, nincs süti, nincs webnapló a másik oldalon — ez a legkisebb
# kitettségű módja annak, hogy egy gép megtudja a saját publikus címét.
set -u

# A systemd StateDirectory=-ből jön (/var/lib/notes-wan-ip); kézi futtatásnál a home.
STATE_FILE="${WAN_IP_STATE:-${STATE_DIRECTORY:-$HOME/.local/state}/wan-ip}"
RESOLVER="resolver1.opendns.com"

ENV_FILE="$(dirname "$(readlink -f "$0")")/health.env"
if [ -r "$ENV_FILE" ]; then
    set -a; . "$ENV_FILE"; set +a
fi

log() { echo "$@"; }

# Ugyanaz a levélküldő, mint a health-check.sh-ban. SZÁNDÉKOS másolat: két
# rövid szkript, amiket külön is lehet futtatni, és a közös könyvtár csak egy
# harmadik fájlt jelentene, amit szintén szinkronban kell tartani.
send_mail() {
    subject="$1"; body="$2"
    if [ -z "${SMTP_SERVER:-}" ] || [ -z "${SENDER_EMAIL:-}" ] || \
       [ -z "${SENDER_PASSWORD:-}" ] || [ -z "${RECIPIENT_EMAIL:-}" ]; then
        log "Nem tudok levelet küldeni: hiányoznak az SMTP-adatok ($ENV_FILE)."
        return 1
    fi
    if [ "${SMTP_PORT:-587}" = "465" ]; then
        url="smtps://${SMTP_SERVER}:${SMTP_PORT}"
    else
        url="smtp://${SMTP_SERVER}:${SMTP_PORT:-587}"
    fi
    encoded_subject="=?UTF-8?B?$(printf '%s' "$subject" | base64 -w0)?="
    {
        printf 'From: %s\r\n' "$SENDER_EMAIL"
        printf 'To: %s\r\n' "$RECIPIENT_EMAIL"
        printf 'Subject: %s\r\n' "$encoded_subject"
        printf 'Date: %s\r\n' "$(date -R)"
        printf 'Content-Type: text/plain; charset=UTF-8\r\n'
        printf '\r\n'
        printf '%s\r\n' "$body"
    } | curl -s --max-time 30 --url "$url" --ssl-reqd \
            --mail-from "$SENDER_EMAIL" --mail-rcpt "$RECIPIENT_EMAIL" \
            --user "${SENDER_EMAIL}:${SENDER_PASSWORD}" --upload-file - 2>/dev/null
}

current="$(dig +short +time=5 +tries=2 myip.opendns.com "@$RESOLVER" 2>/dev/null | tail -1)"

# ELLENŐRIZZÜK AZ ALAKOT, nem csak azt, hogy jött-e valami. A `dig` hiba esetén
# üres sort, timeoutnál hibaszöveget is adhat — azt elmenteni és "változásnak"
# venni hamis riasztás lenne, ami után a következő valódit már nem hisszük el.
if ! printf '%s' "$current" | grep -qE '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then
    log "A publikus cím most nem volt lekérdezhető (válasz: '${current:-üres}') — nem hiba, csak kihagyjuk."
    exit 0
fi

mkdir -p "$(dirname "$STATE_FILE")"

if [ ! -f "$STATE_FILE" ]; then
    printf '%s\n' "$current" > "$STATE_FILE"
    log "Első futás: a publikus cím elmentve ($current). Értesítés nem kell."
    exit 0
fi

previous="$(cat "$STATE_FILE")"
if [ "$current" = "$previous" ]; then
    log "A publikus cím változatlan ($current)."
    exit 0
fi

log "A publikus cím MEGVÁLTOZOTT: $previous -> $current"
printf '%s\n' "$current" > "$STATE_FILE"

send_mail "Notes: MEGVÁLTOZOTT a publikus IP-cím" \
"A Pi publikus címe megváltozott.

  Régi:  $previous
  Új:    $current

Amíg ezt nem vezeted át, a VPN KÍVÜLRŐL NEM ÉPÜL FEL — a kliens némán
próbálkozik tovább a régi címen.

Teendő a WireGuard-klienseken (laptop, telefon), az Endpoint sorban:

  Endpoint = $current:<port>   (a port nem változik)

Laptopon:  sudo sed -i 's/^Endpoint = .*:/Endpoint = $current:/' /etc/wireguard/wg0.conf
           sudo wg-quick down wg0 && sudo wg-quick up wg0
Telefonon: a WireGuard appban az alagút szerkesztése, az Endpoint mező átírása.

(Ez az üzenet a notes-wan-ip.timer óránkénti ellenőrzéséből származik.)" \
    && log "Értesítés elküldve." || log "Az értesítés NEM ment el."
