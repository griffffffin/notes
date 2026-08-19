import type {ReactNode} from "react";

/* A markerek feldolgozásának munkapéldánya: egy karakter + hogy félkövér-e. A két
   toggle-függvény (toggleBold, normalizeBold) ugyanilyen tömbön dolgozik, ezért a
   típus egy helyen áll. */
type Char = {ch: string; bold: boolean};

/* Az idézet-szöveg félkövér-markereinek renderelése. Az idézetet SIMA szövegként
   tároljuk (a szerkesztő egy sima <textarea>, formázást nem ismer), a félkövéret
   a WhatsApp/Markdown-mintára `**...**` marker jelöli. A szerkesztőben a marker
   nyersen látszik; a MEGJELENÍTŐ nézetek (lista-kártya, megosztott nézet) ezzel a
   segéddel rendereljük ki <strong>-ként.

   A [\s\S]+? azért, hogy a félkövér sortörésen ÁT is működjön (a . alapból nem
   fogja a \n-t), és NON-GREEDY, hogy a legrövidebb `**…**` párt fogja (két külön
   félkövér ne olvadjon eggyé). A közlekedő (nem félkövér) darabok stringként
   maradnak — a befoglaló elem white-space: pre-wrapja őrzi a sortöréseiket. */
export function renderBold(text: string): ReactNode {
    if (!text) return text;
    const parts: ReactNode[] = [];
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
export function toggleBold(text: string, selStart: number, selEnd: number): {
    text: string; selStart: number; selEnd: number;
} {
    // 1) Minden TARTALMI karakter (a ** markereket kihagyva) félkövér-e, + a nyers
    //    pozíció → tartalmi index leképezés (a kijelölés áttételéhez).
    const chars: Char[] = [];
    const plainBefore: number[] = new Array(text.length + 1);
    let bold = false;
    let plain = 0;
    let i = 0;
    while (i < text.length) {
        /* A karaktert ELŐBB vesszük ki, és kimondjuk, hogy létezik. A
           ciklusfeltétel szerint így is van, de az indexelés eredménye a
           típusrendszerben `string | undefined` (noUncheckedIndexedAccess) — és
           ez itt nem formaság: egy `undefined` karakter a `chars` listába
           kerülve a szerializálásnál csendben az "undefined" SZÓVÁ válna a
           felhasználó idézetében. */
        const ch = text[i];
        if (ch === undefined) break;
        plainBefore[i] = plain;
        // A `text[i + 1]` a szöveg végén `undefined` — az összehasonlítás így is helyes.
        if (ch === "*" && text[i + 1] === "*") {
            plainBefore[i + 1] = plain;
            bold = !bold;
            i += 2;
        } else {
            chars.push({ch, bold});
            plain += 1;
            i += 1;
        }
    }
    plainBefore[text.length] = plain;

    // 2) A kijelölt tartomány + döntés a látható karakterek alapján.
    const pStart = plainBefore[selStart];
    const pEnd = plainBefore[selEnd];
    /* A kijelölés pozíciói a DOM-ból jönnek (a textarea selectionStart/End-je),
       tehát a programon KÍVÜLRŐL: egy időközben megváltozott szöveg mellett a
       tartományon kívülre eshetnek. Ilyenkor nem formázunk — a szöveget és a
       kijelölést változatlanul adjuk vissza. */
    if (pStart === undefined || pEnd === undefined) return {text, selStart, selEnd};
    const selected = chars.slice(pStart, pEnd);
    const visible = selected.filter((c) => !/\s/.test(c.ch));
    if (visible.length === 0) return {text, selStart, selEnd};   // csak whitespace: nincs mit tenni
    const makeBold = visible.some((c) => !c.bold);               // van nem-bold → mind bold; különben unbold
    /* A `slice` a TÖMBRŐL ad másolatot, az ELEMEK ugyanazok az objektumok —
       tehát az itteni írás a `chars`-ban is látszik, indexelés nélkül. */
    for (const c of chars.slice(pStart, pEnd)) c.bold = makeBold;

    // 3) Újraszerializálás: `**` a félkövér-futamok határán; a kijelölés a
    //    TARTALMON marad (a ** kívül esik).
    let out = "";
    const rawAt: number[] = new Array(chars.length + 1);
    let cur = false;
    chars.forEach((c, k) => {
        if (c.bold !== cur) { out += "**"; cur = c.bold; }
        rawAt[k] = out.length;
        out += c.ch;
    });
    if (cur) out += "**";
    rawAt[chars.length] = out.length;

    /* A `rawAt` minden tartalmi indexhez tartalmaz bejegyzést (0…chars.length),
       a `pStart`/`pEnd` pedig ebbe a tartományba esik — a `?? out.length` tehát
       nem várt ág, hanem KIMONDOTT végállapot: ha valaha mégis kicsúsznánk, a
       kurzor a szöveg végére kerül, nem `undefined`-ra (ami a textareát némán
       az elejére ugratná). */
    const rawStart = rawAt[pStart] ?? out.length;
    return {
        text: out,
        selStart: rawStart,
        selEnd: pEnd > pStart ? (rawAt[pEnd - 1] ?? out.length) + 1 : rawStart,
    };
}

const isWs = (c: string) => /\s/.test(c);

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
export function normalizeBold(text: string): string {
    const chars: Char[] = [];
    let bold = false;
    let markerCount = 0;
    let i = 0;
    while (i < text.length) {
        // Ugyanaz a kimondott vizsgálat, mint a toggleBold-ban (l. ott az indokot).
        const ch = text[i];
        if (ch === undefined) break;
        if (ch === "*" && text[i + 1] === "*") { bold = !bold; markerCount += 1; i += 2; }
        else { chars.push({ch, bold}); i += 1; }
    }

    if (markerCount % 2 === 1) {
        // a párját vesztett jel utáni trailing bold-futam kezdete
        /* A `?.` itt VALÓDI vizsgálat, nem rövidítés: a hiányzó elem `undefined`,
           amitől a feltétel hamis lesz, és a ciklus megáll — pontosan az a
           viselkedés, amit akarunk. */
        let runStart = chars.length;
        while (runStart > 0 && chars[runStart - 1]?.bold) runStart -= 1;
        if (runStart < chars.length) {
            // NYITÓ: van tartalom a jel után → csak a következő szó bold
            let j = runStart;
            for (const c of chars.slice(runStart)) {          // kezdő ws át
                if (!isWs(c.ch)) break;
                c.bold = false;
                j += 1;
            }
            for (const c of chars.slice(j)) {                 // az első szó vége
                if (isWs(c.ch)) break;
                j += 1;
            }
            for (const c of chars.slice(j)) c.bold = false;   // utána semmi nem bold
        } else {
            // ZÁRÓ a szöveg végén: a tapadó utolsó szó összeolvasztása (ha van benne bold)
            const last = chars[chars.length - 1];
            if (last && !isWs(last.ch)) {
                let start = chars.length - 1;
                /* A hiányzó elemet SZÓKÖZNEK vesszük: a szó eleje a tömb eleje,
                   tehát a ciklus ott is megáll, ahol a szöveg elfogy. */
                while (start > 0 && !isWs(chars[start - 1]?.ch ?? " ")) start -= 1;
                const word = chars.slice(start);
                if (word.some((c) => c.bold)) for (const c of word) c.bold = true;
            }
        }
    }

    // A bold-futamok elején/végén lévő whitespace-eket kivesszük a boldból.
    // Elölről: minden bold-futam ELEJÉN (ahol az előző karakter nem bold).
    chars.forEach((c, k) => {
        if (!c.bold || chars[k - 1]?.bold) return;
        for (const run of chars.slice(k)) {
            if (!run.bold || !isWs(run.ch)) break;
            run.bold = false;
        }
    });
    // Hátulról: minden bold-futam VÉGÉN (ahol a következő karakter nem bold).
    for (let k = chars.length - 1; k >= 0; k -= 1) {
        const c = chars[k];
        if (!c?.bold || chars[k + 1]?.bold) continue;
        for (let j = k; j >= 0; j -= 1) {
            const run = chars[j];
            if (!run?.bold || !isWs(run.ch)) break;
            run.bold = false;
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
