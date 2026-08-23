#!/bin/sh
# Egyszeri telepítő lépés: létrehozza a mentés-könyvtárakat a helyes tulajdonossal
# és joggal. Root-jogot igényel, mert két KÜLÖNBÖZŐ user ír ide, és a fájlok
# tulajdonosát csak a root tudja rendezni:
#
#   daily/   a napi JSON-exportot az alkalmazás user-e írja (notes-export.service)
#   weekly/  a heti pg_dumpot a 'postgres' user írja (notes-backup.service)
#
# A weekly mappa a setgid bitet (2750) kapja, így az ott születő fájlok nem a
# postgres csoportját öröklik, hanem a megadott olvasó-csoportot. E nélkül a heti
# mentés a bejelentkező user számára elérhetetlen (Permission denied), és így nem
# lehet lementeni egy másik gépre sem. Világra olvashatóvá SEMMI nem válik: a
# mappa 2750, a fájlok 640 maradnak — a dump a teljes adatbázist tartalmazza.
#
# Futtatás:  sudo ./setup-backup-permissions.sh [olvasó-user]
# Az olvasó-user alapértelmezésben az, aki a sudo-t indította. Idempotens:
# nyugodtan újrafuttatható, és futtatni KELL, ha a mentés-könyvtárak valaha
# újra létrejönnek (törlés, új telepítés) — a weekly-backup.sh maga csak az
# umaskot tudja beállítani, a csoportot nem.
set -e

BACKUP_ROOT=/opt/backups/notes
DB_USER=postgres
APP_USER=notes   # a napi exportot futtató szolgáltatás-felhasználó (deploy/notes.service)

if [ "$(id -u)" -ne 0 ]; then
    echo "Root-jog kell (a fájlok tulajdonosát állítja): sudo $0" >&2
    exit 1
fi

# Az a user, aki a mentéseket olvassa: az app/export user-e, egyben a gépre
# belépő fiók. Gépspecifikus, ezért nincs beleégetve — paraméterből vagy a
# sudo-t indító felhasználóból jön.
READER="${1:-${SUDO_USER:-}}"
if [ -z "$READER" ]; then
    echo "Nem tudom, ki az olvasó-user. Add meg: sudo $0 <user>" >&2
    exit 1
fi
READER_GROUP="$(id -gn "$READER")"

# install -d: létrehoz, ha nincs; ha van, csak a tulajdonost/jogot igazítja.
# A NAPI mentést 2026-08-22 óta a `notes` szolgáltatás-felhasználó írja (nem a
# fejlesztő-user), ezért ugyanaz az elrendezés kell neki, mint a hetinek: az ÍRÓ a
# tulajdonos, az OLVASÓ a csoport, és setgid, hogy az új fájlok is az olvasó
# csoportjába szülessenek. 700-zal (a korábbi alakkal) a lehúzás NÉMÁN elhalna.
install -d -o "$APP_USER" -g "$READER_GROUP" -m 2750 "$BACKUP_ROOT/daily"
find "$BACKUP_ROOT/daily" -name '*.json' -exec chgrp "$READER_GROUP" {} + \
    -exec chmod 640 {} +
install -d -o "$DB_USER" -g "$READER_GROUP" -m 2750 "$BACKUP_ROOT/weekly"

# A setgid csak az EZUTÁN születő fájlokra hat, a korábbiakat kézzel igazítjuk.
find "$BACKUP_ROOT/weekly" -name '*.sql.gz' -exec chgrp "$READER_GROUP" {} + \
    -exec chmod 640 {} +

echo "Kész. Olvasó-csoport: $READER_GROUP"
ls -ld "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly"
