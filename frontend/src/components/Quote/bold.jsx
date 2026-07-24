/* Az idézet-szöveg félkövér-markereinek renderelése. Az idézetet SIMA szövegként
   tároljuk (a szerkesztő egy sima <textarea>, formázást nem ismer), a félkövéret
   a WhatsApp/Markdown-mintára `**...**` marker jelöli. A szerkesztőben a marker
   nyersen látszik; a MEGJELENÍTŐ nézetek (lista-kártya, megosztott nézet) ezzel a
   segéddel rendereljük ki <strong>-ként.

   A [\s\S]+? azért, hogy a félkövér sortörésen ÁT is működjön (a . alapból nem
   fogja a \n-t), és NON-GREEDY, hogy a legrövidebb `**…**` párt fogja (két külön
   félkövér ne olvadjon eggyé). A közlekedő (nem félkövér) darabok stringként
   maradnak — a befoglaló elem white-space: pre-wrapja őrzi a sortöréseiket. */
export function renderBold(text) {
    if (!text) return text;
    const parts = [];
    const regex = /\*\*([\s\S]+?)\*\*/g;
    let lastIndex = 0;
    let key = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
        parts.push(<strong key={key++}>{match[1]}</strong>);
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
}

/* Ctrl+B a KIJELÖLÉSEN — a user szabálya szerint. TISZTA függvény: szöveg + a
   kijelölés [start,end] nyers pozíciói → új szöveg + új kijelölés.

   A SZABÁLY: a kijelölés LÁTHATÓ karakterei (a szóközöket, sortöréseket leszámítva)
   döntenek — ha AKÁR EGY is NEM félkövér, az EGÉSZ kijelölés félkövér lesz; ha MIND
   félkövér, a félkövér lekerül. Így `d**a**sd` (csak "a" bold) egészét kijelölve +
   Ctrl+B → `**dasd**` (mind bold), nem az "inverz". Utána a `**` jelek a
   félkövér-futamok határára kerülnek, a fölöslegesek eltűnnek — ezt az
   újraszerializálás adja (soha nem halmoz csillagokat). */
export function toggleBold(text, selStart, selEnd) {
    // 1) Minden TARTALMI karakter (a ** markereket kihagyva) félkövér-e, + a nyers
    //    pozíció → tartalmi index leképezés (a kijelölés áttételéhez).
    const chars = [];
    const plainBefore = new Array(text.length + 1);
    let bold = false;
    let plain = 0;
    let i = 0;
    while (i < text.length) {
        plainBefore[i] = plain;
        if (text[i] === "*" && text[i + 1] === "*") {
            plainBefore[i + 1] = plain;
            bold = !bold;
            i += 2;
        } else {
            chars.push({ch: text[i], bold});
            plain += 1;
            i += 1;
        }
    }
    plainBefore[text.length] = plain;

    // 2) A kijelölt tartomány + döntés a látható karakterek alapján.
    const pStart = plainBefore[selStart];
    const pEnd = plainBefore[selEnd];
    const selected = chars.slice(pStart, pEnd);
    const visible = selected.filter((c) => !/\s/.test(c.ch));
    if (visible.length === 0) return {text, selStart, selEnd};   // csak whitespace: nincs mit tenni
    const makeBold = visible.some((c) => !c.bold);               // van nem-bold → mind bold; különben unbold
    for (let k = pStart; k < pEnd; k++) chars[k].bold = makeBold;

    // 3) Újraszerializálás: `**` a félkövér-futamok határán; a kijelölés a
    //    TARTALMON marad (a ** kívül esik).
    let out = "";
    const rawAt = new Array(chars.length + 1);
    let cur = false;
    for (let k = 0; k < chars.length; k++) {
        if (chars[k].bold !== cur) { out += "**"; cur = chars[k].bold; }
        rawAt[k] = out.length;
        out += chars[k].ch;
    }
    if (cur) out += "**";
    rawAt[chars.length] = out.length;

    return {
        text: out,
        selStart: rawAt[pStart],
        selEnd: pEnd > pStart ? rawAt[pEnd - 1] + 1 : rawAt[pStart],
    };
}

const isWs = (c) => /\s/.test(c);

/* MENTÉSKORI normalizálás. A `**` jeleket flip-flop toggle-ként dolgozza fel
   (be-ki kapcsol), majd tisztán, nem átfedő félkövér-futamokra írja újra. Fontos:

   - A TELJES `**…**` párokat NEM bántja: a részleges szó-bold megmarad (pl.
     `1**212**` és `fél**szó**boldolása` VÁLTOZATLAN), mert ott a felhasználó
     egyértelműen kijelölte a boldolt részt.

   - PÁRJÁT VESZTETT `**` (páratlan markerszám) — egy nyitó jelnek nincs záró párja:
       * ha VAN tartalom a jel után (a flip-flop szerint a végéig bold lenne):
         NYITÓ → csak a KÖVETKEZŐ szót boldozza (kezdő ws át, az első ws-ig).
         Pl. `**b **c** d` → `**b** c **d**`; `**Al**dus** PageMaker sa` →
         `**Al**dus **PageMaker** sa`.
       * ha a jel a SZÖVEG VÉGÉN lóg (nincs utána tartalom): ZÁRÓ — ha a hozzá
         TAPADÓ (nem-ws) utolsó szóban MÁR van bold, azt a szót TELJESEN bolddá
         teszi (összeolvasztás, pl. `**1**212**` → `**1212**`); ha a tapadó szóban
         nincs bold (vagy ws előzi), a jel hatás nélkül lekerül (pl. `szó **`).

   - A bold-futamok szélső whitespace-ei kikerülnek a jelek közül (nincs `** szó **`). */
export function normalizeBold(text) {
    const chars = [];
    let bold = false;
    let markerCount = 0;
    let i = 0;
    while (i < text.length) {
        if (text[i] === "*" && text[i + 1] === "*") { bold = !bold; markerCount += 1; i += 2; }
        else { chars.push({ch: text[i], bold}); i += 1; }
    }

    if (markerCount % 2 === 1) {
        // a párját vesztett jel utáni trailing bold-futam kezdete
        let runStart = chars.length;
        while (runStart > 0 && chars[runStart - 1].bold) runStart -= 1;
        if (runStart < chars.length) {
            // NYITÓ: van tartalom a jel után → csak a következő szó bold
            let j = runStart;
            while (j < chars.length && isWs(chars[j].ch)) { chars[j].bold = false; j += 1; }   // kezdő ws
            while (j < chars.length && !isWs(chars[j].ch)) j += 1;                             // első szó vége
            for (let m = j; m < chars.length; m++) chars[m].bold = false;
        } else {
            // ZÁRÓ a szöveg végén: a tapadó utolsó szó összeolvasztása (ha van benne bold)
            let end = chars.length - 1;
            if (end >= 0 && !isWs(chars[end].ch)) {
                let start = end;
                while (start > 0 && !isWs(chars[start - 1].ch)) start -= 1;
                let anyBold = false;
                for (let m = start; m <= end; m++) if (chars[m].bold) { anyBold = true; break; }
                if (anyBold) for (let m = start; m <= end; m++) chars[m].bold = true;
            }
        }
    }

    // A bold-futamok elején/végén lévő whitespace-eket kivesszük a boldból.
    for (let k = 0; k < chars.length; k++) {
        if (chars[k].bold && (k === 0 || !chars[k - 1].bold)) {
            let j = k;
            while (j < chars.length && chars[j].bold && isWs(chars[j].ch)) chars[j++].bold = false;
        }
    }
    for (let k = chars.length - 1; k >= 0; k--) {
        if (chars[k].bold && (k === chars.length - 1 || !chars[k + 1].bold)) {
            let j = k;
            while (j >= 0 && chars[j].bold && isWs(chars[j].ch)) chars[j--].bold = false;
        }
    }

    let out = "";
    let cur = false;
    for (const c of chars) {
        if (c.bold !== cur) { out += "**"; cur = c.bold; }
        out += c.ch;
    }
    if (cur) out += "**";
    return out;
}
