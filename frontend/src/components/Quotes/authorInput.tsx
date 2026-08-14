import {useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent} from "react";
import {useAuth} from "../../contexts/auth-context";
import {logRequestError} from "../../log";

// Ennyi szünet után kérünk javaslatot: gépelés közben minden billentyűnél
// fölösleges a szerverhez fordulni, csak ha a felhasználó "megállt".
const DEBOUNCE_MS = 200;

/* Az onChange a valódi input-eseményt IS megkapja (gépeléskor), DE a javaslat
   elfogadásakor egy SZINTETIKUS {target:{value}} alakot is — a mező value-ját
   ilyenkor mi állítjuk elő, nincs mögötte DOM-esemény. A hívó mindkét ágon csak a
   `target.value`-t olvassa, ezért a prop a KÖZÖS, minimális alakot kéri: annyit,
   amennyit tényleg használunk. Egy valódi ChangeEvent is megfelel neki (a target-je
   HTMLInputElement, van value-ja), így a gépelés-ág is ezen a típuson megy át. */
type ValueChange = {target: {value: string}};

export type AuthorInputProps = {
    value: string;
    onChange: (event: ValueChange) => void;
    class: string;
    placeholder?: string;
    /* Megadva → KERESŐ mód (az Enter keres, nem a javaslatot fogadja el); hiánya →
       SZERKESZTŐ mód. A `Boolean(props.onSubmit)` ebből számolja az `isSearch`-öt. */
    onSubmit?: () => void;
    onFocusChange?: (isFocused: boolean) => void;
    wrapperClass?: string;
};

/* Szerző-mező ghost-text kiegészítéssel. A látható input MÖGÖTT egy azonos
   betűtípusú/paddingű réteg: a beírt részt színtelenül tartja (hogy a
   kiegészítés a helyére kerüljön), a szerver által javasolt folytatást pedig
   halványan mutatja (pl. "Má" + halvány "rai"). Enter vagy a szöveg végén a
   jobbra-nyíl elfogadja.

   A javaslatot a /quotes/authors adja (a legutóbb használt, prefixre szűrt
   szerző). A kiegészítést CSAK akkor mutatjuk, ha a beírt szöveg tényleg a
   javaslat eleje — így egy elkésett válasz nem villant fel rossz folytatást.

   KÉT HELYEN használjuk, ezért paraméterezett (a ghost-text magja ne
   duplázódjon): a szerkesztő szerző-mezőjeként, és a Quotes-navbar keresőjeként.
   - onSubmit megadva (KERESŐ mód): az Enter a keresést INDÍTJA, nem a javaslatot
     fogadja el — a szerzőt a jobbra-nyíllal (betűnként) vagy Ctrl+jobbra-nyíllal
     (egészben) veszed át, majd Enter keres. onSubmit nélkül (SZERKESZTŐ mód) az
     Enter a régi módon az egész javaslatot fogadja el.
   - wrapperClass a külső doboz osztályát adja: a szerkesztőben flex-grow-1 (egy
     input-groupban ül), a keresőben a hívó saját szélessége. */
export default function AuthorInput(props: AuthorInputProps) {
    const {handleAxios} = useAuth();
    const [suggestion, setSuggestion] = useState("");
    /* Csak azután ajánlunk, hogy a felhasználó MAGA nyúlt a mezőhöz. Update-nél a
       mező a betöltött szerzővel indul — ilyenkor NEM villantunk ghost-textet, amíg
       az átírás el nem kezdődik; a create-nél az első leütés úgyis bekapcsolja. */
    const [touched, setTouched] = useState(false);
    // Fókuszban van-e a mező. A KERESŐ ezt használja a szerkesztő "touched"-je
    // helyett: ott a javaslat csak akkor kell, ha BELEKATTINTOK (fókusz), a
    // beküldés után pedig (blur) el is tűnjön.
    const [focused, setFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const value = props.value;
    const isSearch = Boolean(props.onSubmit);

    /* Mikor "aktív" a javaslat? Szerkesztőben az első átírás után (touched);
       keresőben csak fókuszban. Így a keresőben a betöltött/commitolt kifejezésre
       (pl. a találati oldalon a mezőben álló szó) NEM villan ghost, csak ha
       belekattintok. */
    const active = isSearch ? focused : touched;

    /* Az igazítás a keresőé: a COMMITOLT kifejezést (amit a mező az aktuális
       nézethez mutat) unfókuszáltan KÖZÉPRE tesszük, gépelés/fókusz közben BALRA;
       üres mező (placeholder) is balra. A szerkesztő nem kér igazítást (bal). */
    const align = isSearch ? (!focused && value ? "center" : "left") : undefined;

    const completion = (active && suggestion && value &&
        suggestion.toLowerCase().startsWith(value.toLowerCase()) && suggestion.length > value.length)
        ? suggestion.slice(value.length) : "";

    /* Versenyhelyzet-őr, a többi betöltő effekt mintájára (l. useSortableCards.ts).
       Ez az effekt MINDEN leütésre újrafut, tehát a leggyakrabban újrainduló az
       appban: két javaslat-kérés fordított sorrendben is visszaérhet.

       A debounce ezt NEM oldja meg: a `clearTimeout` a még el nem sült IDŐZÍTŐT
       vonja vissza, a 200 ms letelte után MÁR ELINDULT kérést nem. Enélkül egy
       lejárt prefix válasza felülírja a frisset — és mivel a lenti `completion`
       csak akkor rajzol, ha a beírt szöveg tényleg a javaslat eleje, a ghost nem
       rosszat mutat, hanem NÉMÁN ELTŰNIK, pedig volt érvényes javaslat. A
       következő leütésig így is marad.

       A zászló neve itt NEM `active`, mint a többi betöltőnél: ebben a
       komponensben az `active` már foglalt (a javaslat láthatóságát jelenti,
       l. fentebb), az árnyékolás pont a lényegi helyen zavarna össze. */
    useEffect(() => {
        if (!active || !value.trim()) {
            setSuggestion("");
            return;
        }
        let isLatest = true;
        const timer = setTimeout(() => {
            handleAxios<string[]>("/quotes/authors", {prefix: value},
                (response) => {
                    if (isLatest) setSuggestion(response.data[0] ?? "");
                },
                // A hibaág nem ír state-et (csak naplóz), ezért nem kér őrt.
                logRequestError);
        }, DEBOUNCE_MS);
        return () => {
            isLatest = false;
            clearTimeout(timer);
        };
    }, [value, active, handleAxios]);

    /* Telefonon a virtuális billentyűzet eltűnése (rendszer vissza-gombja vagy a
       billentyűzet elrejtése) NEM mindig veszi le a fókuszt az inputról — ilyenkor a
       kereső "kifeszített" állapotban ragadna. A visualViewport a billentyűzet
       NYITÁSAKOR megkisebbedik, ZÁRÁSKOR visszanő; ha becsukódott (a takart magasság
       visszaesik), mi vesszük le a fókuszt (blur → a sáv visszaáll). Csak kereső
       módban, csak fókusz alatt, és csak ott, ahol van visualViewport (mobil). A
       küszöbök heurisztikusak (a billentyűzet ~200-300px) — valós eszközön hangolhatók. */
    useEffect(() => {
        if (!isSearch || !focused || !window.visualViewport) return;
        const viewport = window.visualViewport;
        let keyboardOpen = false;
        const onResize = () => {
            const covered = window.innerHeight - viewport.height;
            if (covered > 150) keyboardOpen = true;
            else if (keyboardOpen && covered < 80) inputRef.current?.blur();
        };
        viewport.addEventListener("resize", onResize);
        return () => viewport.removeEventListener("resize", onResize);
    }, [isSearch, focused]);

    // A felhasználó módosítása kapcsolja be a javaslatokat (a betöltött érték nem).
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setTouched(true);
        props.onChange(event);
    };

    /* KERESŐ módban a mezőre koppintva (telefonon) elfogadjuk az EGÉSZ javaslatot —
       a szürke folytatásra ÉS a beírt részre is (a ghost-réteg pointerEvents:none-ja
       miatt a szürkére koppintás is ide, az inputra érkezik). NEM keresünk vele,
       ahhoz további Enter kell. Csak ÉRINTÉSRE hat (pointerType==="touch"), hogy
       asztali gépen a kattintás továbbra is a kurzort pozicionálja. */
    const handlePointerUp = (event: PointerEvent<HTMLInputElement>) => {
        if (props.onSubmit && completion && event.pointerType === "touch") {
            props.onChange({target: {value: suggestion}});
            setSuggestion("");
        }
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        // KERESŐ mód: az Enter keres (a javaslat elfogadása nélkül is), akár van
        // kiegészítés, akár nincs. Ezért a completion-őr ELŐTT áll.
        if (props.onSubmit && event.key === "Enter") {
            event.preventDefault();
            props.onSubmit();
            // A keresés után VEGYE LE a fókuszt: a mező a commitolt kifejezést
            // középen, unfókuszáltan mutatja (ghost sem villan, míg vissza nem
            // kattintok).
            inputRef.current?.blur();
            return;
        }
        // KERESŐ mód: az Escape ÜRÍTI a mezőt (a javaslat is eltűnik, mert az
        // effekt üres értéknél törli). A szerkesztőben az Escape MÁS (mentés+vissza),
        // ezért csak onSubmit mellett — a read-oldalakon nincs is más Escape-kezelő.
        if (props.onSubmit && event.key === "Escape") {
            event.preventDefault();
            props.onChange({target: {value: ""}});
            return;
        }
        // KERESŐ mód: ÜRES mezőn a Backspace leveszi a fókuszt — telefonon a sáv így
        // visszaáll kicsire. Üres mezőn a Backspace-nek úgy sincs mit törölnie.
        if (props.onSubmit && event.key === "Backspace" && !value) {
            inputRef.current?.blur();
            return;
        }
        if (!completion) return;
        // currentTarget, nem target: a React-esemény `target`-je csak EventTarget
        // (nincs rajta selectionStart); a `currentTarget` a kezelőt viselő input.
        const atEnd = event.currentTarget.selectionStart === value.length;
        if (event.key === "Enter" || (event.key === "ArrowRight" && event.ctrlKey && atEnd)) {
            // Enter vagy Ctrl+jobbra a szöveg végén: az EGÉSZ javaslat elfogadása —
            // a JAVASLAT írásmódjával (nem a beírt prefix betűzésével). Így "már" →
            // "Márai" lesz, nem "márai": ha az egészet elfogadod, a tárolt alakot kapod.
            event.preventDefault();
            props.onChange({target: {value: suggestion}});
            setSuggestion("");
        } else if (event.key === "ArrowRight" && atEnd) {
            /* Jobbra a szöveg végén: EGY betűt húz be a kiegészítésből. Minden
               további jobbra-lépés a következőt — telefonon a Swiftkey szóköz-
               húzása így fokozatosan gépeli be a javaslatot: amennyit jobbra
               mész, annyi betűt. A suggestion marad, a completion a value
               növekedtével magától rövidül (a következő lépésig). */
            event.preventDefault();
            props.onChange({target: {value: value + completion[0]}});
        }
    };

    return (
        /* flex-grow-1: a szerkesztőben a Szerző-mező egy input-groupban ül a
           betűméret-stepper mellett — így tölti ki a maradék helyet (a sorszám-sor
           textareájához hasonlóan). A régi, önálló elrendezésben (block) hatástalan.
           minWidth:0: ez a div (nem közvetlen form-control gyerek) NEM kapja meg a
           Bootstrap input-group min-width:0 szabályát, ezért keskeny kijelzőn nem
           tudott 0 alá zsugorodni, és a stepper a szerző ALÁ csúszott. A 0-ra
           zsugoríthatóság tartja egy sorban telefonon is. */
        <div className={"position-relative " + (props.wrapperClass ?? "flex-grow-1")} style={{minWidth: 0}}>
            {/* A háttérréteg: pontosan az input alatt (azonos class → azonos font
                és padding). A beírt rész színtelen (helykitöltő), a kiegészítés
                halvány. aria-hidden + pointerEvents:none — a képernyőolvasó és a
                kattintás az inputé. A pre megőrzi a szóközöket. */}
            {/* Az igazítás (align, l. fent) a keresőé: a commitolt kifejezést
                unfókuszáltan középen, gépeléskor/fókuszban balra; a placeholder
                (üres) balra. A ghost-réteg ugyanazt az igazítást viseli, mint az
                input, hogy a value + completion egymáson maradjon. */}
            <div aria-hidden="true" style={{pointerEvents: "none", whiteSpace: "pre", textAlign: align}}
                 className={props.class + " form-control bg-transparent border-0 position-absolute top-0 start-0 w-100"}>
                <span style={{color: "transparent"}}>{value}</span>
                <span style={{opacity: 0.45}}>{completion}</span>
            </div>
            <input ref={inputRef} value={value} onChange={handleChange} onKeyDown={handleKeyDown}
                   onPointerUp={handlePointerUp}
                   onFocus={() => { setFocused(true); props.onFocusChange?.(true); }}
                   onBlur={() => { setFocused(false); props.onFocusChange?.(false); }}
                   placeholder={props.placeholder} autoComplete="off" style={{textAlign: align}}
                   className={props.class + " form-control no-focus bg-transparent position-relative"}/>
        </div>
    );
}
