#!/bin/bash
# Az app életjelének ellenőrzése: percenként megkérdezi a /health végpontot,
# baj esetén naplóz, e-mailt küld, és (ritkítva) újraindítja a service-t.
#
# MIÉRT KELL, ha a notes.service-ben ott a Restart=always?
# Mert a systemd csak azt látja, FUT-e a folyamat. Azt nem, hogy "fut, de nem
# válaszol" (befagyott esemény-ciklus) vagy "fut, de az adatbázist nem éri el".
# Ezekben az esetekben a Restart=always néma marad, miközben az app
# használhatatlan — épp ezt a rést tömi be ez a szkript.
#
# ŐSZINTE KORLÁT: az újraindítás CSAK akkor gyógyít, ha a baj magában az app
# folyamatában van. Ha a FerretDB vagy a Postgres áll, vagy a /opt nincs
# feloldva, az újraindítás nem segít semmin. Ezért van hűtési idő: inkább
# hangosan naplózunk, mint hogy percenként újraindítgassunk valamit, ami nem
# attól romlott el.
#
# A kimenet a journalba megy (a systemd a service stdout-ját odairányítja):
#   journalctl -u notes-health.service

set -uo pipefail

SERVICE="notes.service"
HEALTH_URL="http://127.0.0.1:3001/health"
CURL_TIMEOUT=10

# Két újraindítás között ennyit várunk. Rövidebb idő alatt úgysem derülne ki,
# segített-e; egy tartós külső hibánál (álló adatbázis) pedig percenkénti
# újraindítás-ciklusba kergetne, ami csak a naplót szemeteli.
RESTART_COOLDOWN=600

# Frissen indult appot nem vizsgálunk: az Express felállása, a .env beolvasása és
# az adatbázis-kapcsolat együtt néhány másodperc, ez alatt a /health még nem felel.
# A timer OnBootSec=2min-je csak a BOOT utáni indulást fedi le — egy kézi
# újraindítást (nálunk minden élesítés az) nem, tehát a percenkénti próba simán
# beleeshet az indulásba. Enélkül a szonda egy egészséges, épp induló appot ver
# agyon egy fölösleges újraindítással, és riasztó levelet is küld róla; ez 2026-08-01
# és 08-02 folyamán valóban megtörtént. Ára: egy tényleg induláskor elhaló app
# felfedezése egy körrel (egy perccel) később derül ki — ezt megéri.
START_GRACE=60

# A /run tmpfs: rebootkor ürül, tehát újraindulás után az első hiba azonnal
# kaphat újraindítást, és az értesítés is újraindul tiszta lappal.
STATE_DIR="/run"
LAST_RESTART_FILE="$STATE_DIR/notes-health.last-restart"
# Ennek a LÉTEZÉSE jelzi, hogy a mostani hibáról MÁR küldtünk levelet. Enélkül
# percenként érkezne ugyanaz az üzenet, amíg a baj tart — egy éjszaka alatt
# több száz levél, amitől a következő valódi riasztás elveszne a zajban.
NOTIFIED_FILE="$STATE_DIR/notes-health.notified"

# Az SMTP-adatok egy gitignore-olt env-fájlból jönnek (600-as jogok, a
# titkosított köteten) — verziókezelésbe soha nem kerülnek. A fájl a szkript
# mellett keresendő; ha hiányzik, a szkript a levélküldésen kívül mindent
# ugyanúgy elvégez (naplóz, újraindít), csak szól, hogy nem tud értesíteni.
ENV_FILE="$(dirname "$(readlink -f "$0")")/health.env"
if [ -r "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    set -a; . "$ENV_FILE"; set +a
fi

log() { echo "$@"; }

# A levélküldő (send_mail) a KÖZÖS mail-lib.sh-ból jön — egy forrás, hogy a
# curl-SMTP logika ne csússzon el az error-digest.sh-étól (l. mail-lib.sh).
# Ha a lib hiányzik, NEM esünk el: a szkript fő dolga (naplózás + újraindítás)
# e nélkül is elvégzi, csak levelet nem küld. A mail-lib a szkript mellett van
# (/usr/local/sbin/mail-lib.sh), ugyanúgy, mint a health.env.
MAIL_LIB="$(dirname "$(readlink -f "$0")")/mail-lib.sh"
if [ -r "$MAIL_LIB" ]; then
    # shellcheck disable=SC1090
    . "$MAIL_LIB"
else
    log "Nincs mail-lib.sh ($MAIL_LIB) — a levélküldést kihagyom."
    send_mail() { return 1; }
fi

# Ha a service szándékosan áll (tipikusan reboot után, feloldatlan /opt
# mellett), nincs mit ellenőrizni: nem a mi dolgunk elindítani, amit valaki
# vagy valami tudatosan leállított.
if ! systemctl is-active --quiet "$SERVICE"; then
    exit 0
fi

# Mióta fut az app? MONOTON órából számoljuk (a systemd ezt is közli), nem a
# fali óra időbélyegéből: az utóbbi óraátállításkor vagy NTP-ugráskor negatív
# vagy óriási kort adna, és a szonda vagy örökre hallgatna, vagy fölöslegesen
# újraindítana. A /proc/uptime ugyanannak a monoton órának a mai állása.
service_age() {
    started_us=$(systemctl show -p ActiveEnterTimestampMonotonic --value "$SERVICE" 2>/dev/null)
    # Ha a systemd nem tud indulási időt mondani (üres, 0 vagy nem szám), akkor a
    # türelmi idővel PONT egyenlő kort adunk vissza: az alábbi "-lt" így hamis
    # lesz, tehát inkább vizsgálunk. A türelmi idő kényelmi szolgáltatás — ha nem
    # tudjuk megalapozni, ne az életjel vesszen el miatta.
    case "$started_us" in
        ''|0|*[!0-9]*) echo "$START_GRACE"; return;;
    esac
    now_us=$(awk '{printf "%d", $1 * 1000000}' /proc/uptime)
    echo $(( (now_us - started_us) / 1000000 ))
}

age=$(service_age)
if [ "$age" -lt "$START_GRACE" ]; then
    log "Az app ${age}s-e indult (türelmi idő: ${START_GRACE}s) — ezt a kört kihagyom."
    exit 0
fi

code=$(curl -s -m "$CURL_TIMEOUT" -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null)

# ---------------------------------------------------------------- egészséges
if [ "$code" = "200" ]; then
    # Ha az előző körben riasztottunk, most jelezzük, hogy rendbe jött.
    # Enélkül sosem tudnád meg, hogy vége a bajnak — csak azt, hogy volt.
    if [ -e "$NOTIFIED_FILE" ]; then
        log "Az app újra válaszol."
        if send_mail "Notes: az app újra rendben van" \
"$(date '+%Y-%m-%d %H:%M:%S') — a Notes app újra válaszol az életjelre.

Gép: $(hostname)
Végpont: $HEALTH_URL"; then
            rm -f "$NOTIFIED_FILE"
        else
            log "A helyreállás-értesítő nem ment el; a jelzőt meghagyom, később újrapróbálom."
        fi
    fi
    exit 0
fi

# ------------------------------------------------------------------- baj van
if [ "$code" = "000" ] || [ -z "$code" ]; then
    reason="az életjel ${CURL_TIMEOUT}s alatt NEM válaszolt — a folyamat fut, de nem felel"
else
    reason="az életjel HTTP ${code}-t adott 200 helyett (az app fut, de valami nem stimmel)"
fi
log "BAJ: ${reason}."

now=$(date +%s)
last=$(cat "$LAST_RESTART_FILE" 2>/dev/null || echo 0)
elapsed=$((now - last))

if [ "$elapsed" -lt "$RESTART_COOLDOWN" ]; then
    restart_note="NEM indítottam újra: az előző újraindítás ${elapsed}s-e volt (hűtési idő: ${RESTART_COOLDOWN}s).
Ha ez ismétlődik, a hiba NEM az appban van."
    log "NEM indítom újra: az előző újraindítás ${elapsed}s-e volt (hűtési idő: ${RESTART_COOLDOWN}s)."
    log "Ha ez ismétlődik, a hiba NEM az appban van — nézd meg: systemctl status ferretdb.service, és hogy a /opt fel van-e oldva."
else
    echo "$now" > "$LAST_RESTART_FILE"
    log "Újraindítom a(z) ${SERVICE}-t."
    systemctl restart "$SERVICE"
    restart_note="Újraindítottam a(z) ${SERVICE}-t."
fi

# EGYETLEN levél hibánként: a jelzőfájl megléte jelenti, hogy már szóltunk.
if [ -e "$NOTIFIED_FILE" ]; then
    exit 0
fi

if send_mail "Notes: az app nem válaszol" \
"$(date '+%Y-%m-%d %H:%M:%S') — ${reason}.

${restart_note}

Gép: $(hostname)
Végpont: $HEALTH_URL

Amit érdemes megnézni:
  systemctl status notes.service
  systemctl status ferretdb.service
  journalctl -u notes-health.service -n 50
  mount | grep /opt        (fel van-e oldva a titkosított kötet)

Erről a hibáról ez az EGYETLEN levél; a következőt akkor kapod, ha az app
újra válaszol."; then
    # A jelzőt CSAK sikeres küldés után tesszük ki: ha a levél most nem ment
    # el (pl. nincs net), a következő perc újrapróbálja — különben némán
    # elveszne a riasztás.
    touch "$NOTIFIED_FILE"
    log "Értesítő levél elküldve."
else
    log "Az értesítő levél NEM ment el; a következő körben újrapróbálom."
fi
