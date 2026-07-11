#!/bin/sh
# Heti teljes mentés: a FerretDB minden adata a postgres adatbázisban él,
# a pg_dump ennek hű, visszatölthető másolata. A todo-backup.timer hívja
# vasárnap hajnali 1-kor, postgres userként (peer auth a unix socketen).
# Régi mentést csak akkor töröl, ha a friss mentés épnek bizonyult.
set -eu
BACKUP_DIR=/opt/backups/to-do/weekly
RETENTION_DAYS=84
FILE="$BACKUP_DIR/postgres-$(date +%F).sql.gz"

pg_dump -d postgres | gzip > "$FILE"

# Ép a mentés? (gzip-integritás + nem gyanúsan apró)
if gzip -t "$FILE" && [ "$(stat -c%s "$FILE")" -gt 1024 ]; then
    find "$BACKUP_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
    echo "Heti mentés kész: $FILE"
else
    echo "FIGYELEM: a friss mentés üres vagy sérült — retenciós törlés kihagyva." >&2
    exit 1
fi
