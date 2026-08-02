// A regex-speciális karakterek escape-elése: enélkül egy "." bármit illesztene,
// egy ".*" pedig a keresés jelentését változtatná (regex-injekció). Közös segéd a
// szerző-javasló (readAuthors) és a keresés (readSearch, readSearchMode) között —
// egy helyen él, hogy a három végpont ne másolja külön-külön ugyanazt a mintát.
module.exports = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
