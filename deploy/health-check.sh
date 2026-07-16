#!/bin/bash
# Az app életjelének ellenőrzése: percenként megkérdezi a /health végpontot,
# baj esetén naplóz, és (ritkítva) újraindítja a service-t.
#
# MIÉRT KELL, ha a to-do.service-ben ott a Restart=always?
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
#   journalctl -u to-do-health.service

set -uo pipefail

SERVICE="to-do.service"
HEALTH_URL="http://127.0.0.1:3001/health"
CURL_TIMEOUT=10

# Két újraindítás között ennyit várunk. Rövidebb idő alatt úgysem derülne ki,
# segített-e; egy tartós külső hibánál (álló adatbázis) pedig percenkénti
# újraindítás-ciklusba kergetne, ami csak a naplót szemeteli.
RESTART_COOLDOWN=600

# A /run tmpfs: rebootkor ürül, tehát újraindulás után az első hiba azonnal
# kaphat újraindítást. Ez szándékos — a hűtés a ciklus ellen van, nem a
# beavatkozás ellen.
STATE_FILE="/run/to-do-health.last-restart"

# Ha a service szándékosan áll (tipikusan reboot után, feloldatlan /opt
# mellett), nincs mit ellenőrizni: nem a mi dolgunk elindítani, amit valaki
# vagy valami tudatosan leállított.
if ! systemctl is-active --quiet "$SERVICE"; then
    exit 0
fi

code=$(curl -s -m "$CURL_TIMEOUT" -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null)

if [ "$code" = "200" ]; then
    exit 0
fi

if [ "$code" = "000" ] || [ -z "$code" ]; then
    echo "BAJ: az életjel ${CURL_TIMEOUT}s alatt NEM válaszolt — a folyamat fut, de nem felel."
else
    echo "BAJ: az életjel HTTP ${code}-t adott 200 helyett (az app fut, de valami nem stimmel)."
fi

now=$(date +%s)
last=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
elapsed=$((now - last))

if [ "$elapsed" -lt "$RESTART_COOLDOWN" ]; then
    echo "NEM indítom újra: az előző újraindítás ${elapsed}s-e volt (hűtési idő: ${RESTART_COOLDOWN}s)."
    echo "Ha ez ismétlődik, a hiba NEM az appban van — nézd meg: systemctl status ferretdb.service, és hogy a /opt fel van-e oldva."
    exit 0
fi

echo "$now" > "$STATE_FILE"
echo "Újraindítom a(z) ${SERVICE}-t."
systemctl restart "$SERVICE"
