#!/bin/sh
# Heti teljes mentés: a FerretDB minden adata a postgres adatbázisban él,
# a pg_dump ennek hű, visszatölthető másolata. A to-do-backup.timer hívja
# vasárnap hajnali 1-kor, postgres userként (peer auth a unix socketen).
# Régi mentést csak akkor töröl, ha a friss mentés épnek bizonyult.
set -eu
BACKUP_DIR=/opt/backups/to-do/weekly
# 700 nap = 100 hét: kb. ennyi heti dumpot tartunk meg (a mentés heti egy, tehát a
# nap-alapú retenció ~100 fájlt hagy meg), a régebbieket töröljük.
RETENTION_DAYS=700
FILE="$BACKUP_DIR/postgres-$(date +%F).sql.gz"

# 0640: a dump a teljes adatbázist tartalmazza, ezért világra olvashatóvá SOHA nem
# tesszük — a csoport viszont olvashatja. A $BACKUP_DIR setgid bitet visel (2750,
# l. deploy/setup-backup-permissions.sh), így az itt születő fájlok nem a postgres
# csoportját öröklik, hanem az olvasó-csoportot: ettől válik a mentés a belépő user
# (és rajta át egy külső gépre másolás) számára elérhetővé, sudo nélkül. Ez nem ad
# új jogot senkinek — a belépő fióknak amúgy is teljes sudo joga van —, csak a
# másoláshoz nem kell kerülőút.
umask 027

pg_dump -d postgres | gzip > "$FILE"
chmod 640 "$FILE"

# Ép a mentés? (gzip-integritás + nem gyanúsan apró)
if gzip -t "$FILE" && [ "$(stat -c%s "$FILE")" -gt 1024 ]; then
    find "$BACKUP_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
    echo "Heti mentés kész: $FILE"
else
    echo "FIGYELEM: a friss mentés üres vagy sérült — retenciós törlés kihagyva." >&2
    exit 1
fi
