#!/bin/bash
# KÖZÖS LEVÉLKÜLDŐ — a health-check.sh ÉS az error-digest.sh is EZT sourceolja.
#
# MIÉRT KÜLÖN FÁJL. A curl-alapú SMTP-küldés két helyen kellene (életjel-riasztás
# ÉS heti digest); két külön példány NÉMÁN elcsúszna (a "kézzel szinkronizált
# másolat" csapdája, CLAUDE.md). Egy forrás — mindkettő ezt sourceolja.
#
# A hívó FELELŐSSÉGE, hogy előbb betöltse az SMTP-adatokat (health.env: SMTP_SERVER,
# SMTP_PORT, SENDER_EMAIL, SENDER_PASSWORD, RECIPIENT_EMAIL). Ez a fájl csak a
# send_mail függvényt adja, futtatva semmit nem csinál.
#
# Telepítés (root tulajdon, mert root-ként futó szkriptek sourceolják — l.
# notes-health.service indoklása a nem-root által írható szkriptről):
#   sudo install -o root -g root -m 644 deploy/mail-lib.sh /usr/local/sbin/mail-lib.sh

# A send_mail diagnosztikája a hívó log() függvényét használja, ha van; különben echo.
type log >/dev/null 2>&1 || log() { echo "$@"; }

# Egy levél. A hívó dolga eldönteni, KELL-e — ez a függvény csak küld.
send_mail() {
    local subject="$1" body="$2"

    if [ -z "${SMTP_SERVER:-}" ] || [ -z "${SENDER_EMAIL:-}" ] || \
       [ -z "${SENDER_PASSWORD:-}" ] || [ -z "${RECIPIENT_EMAIL:-}" ]; then
        log "Nem tudok levelet küldeni: hiányoznak az SMTP-adatok."
        return 1
    fi

    # A 465 implicit TLS-t jelent (smtps://), a 587 STARTTLS-t (smtp:// + --ssl-reqd).
    local url
    if [ "${SMTP_PORT:-587}" = "465" ]; then
        url="smtps://${SMTP_SERVER}:${SMTP_PORT}"
    else
        url="smtp://${SMTP_SERVER}:${SMTP_PORT:-587}"
    fi

    # A Subject fejléc csak ASCII-t vihet nyersen, ezért az ékezetes tárgyat
    # RFC 2047 szerint base64-be csomagoljuk — enélkül a levelezők összetörnék.
    local encoded_subject
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
