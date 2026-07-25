import {useEffect, useState} from "react";
import {useAuth} from "../../contexts/auth";
import {logRequestError} from "../../log";

// Ennyi szünet után kérünk javaslatot: gépelés közben minden billentyűnél
// fölösleges a szerverhez fordulni, csak ha a felhasználó "megállt".
const DEBOUNCE_MS = 200;

/* Szerző-mező ghost-text kiegészítéssel. A látható input MÖGÖTT egy azonos
   betűtípusú/paddingű réteg: a beírt részt színtelenül tartja (hogy a
   kiegészítés a helyére kerüljön), a szerver által javasolt folytatást pedig
   halványan mutatja (pl. "Má" + halvány "rai"). Enter vagy a szöveg végén a
   jobbra-nyíl elfogadja.

   A javaslatot a /quotes/authors adja (a legutóbb használt, prefixre szűrt
   szerző). A kiegészítést CSAK akkor mutatjuk, ha a beírt szöveg tényleg a
   javaslat eleje — így egy elkésett válasz nem villant fel rossz folytatást. */
export default function AuthorInput(props) {
    const {handleAxios} = useAuth();
    const [suggestion, setSuggestion] = useState("");
    /* Csak azután ajánlunk, hogy a felhasználó MAGA nyúlt a mezőhöz. Update-nél a
       mező a betöltött szerzővel indul — ilyenkor NEM villantunk ghost-textet, amíg
       az átírás el nem kezdődik; a create-nél az első leütés úgyis bekapcsolja. */
    const [touched, setTouched] = useState(false);
    const value = props.value;

    const completion = (touched && suggestion && value &&
        suggestion.toLowerCase().startsWith(value.toLowerCase()) && suggestion.length > value.length)
        ? suggestion.slice(value.length) : "";

    useEffect(() => {
        if (!touched || !value.trim()) {
            setSuggestion("");
            return;
        }
        const timer = setTimeout(() => {
            handleAxios("/quotes/authors", {prefix: value},
                (response) => setSuggestion(response.data[0] ?? ""),
                logRequestError);
        }, DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [value, touched, handleAxios]);

    // A felhasználó módosítása kapcsolja be a javaslatokat (a betöltött érték nem).
    const handleChange = (event) => {
        setTouched(true);
        props.onChange(event);
    };

    const handleKeyDown = (event) => {
        if (!completion) return;
        const atEnd = event.target.selectionStart === value.length;
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
        <div className="position-relative flex-grow-1" style={{minWidth: 0}}>
            {/* A háttérréteg: pontosan az input alatt (azonos class → azonos font
                és padding). A beírt rész színtelen (helykitöltő), a kiegészítés
                halvány. aria-hidden + pointerEvents:none — a képernyőolvasó és a
                kattintás az inputé. A pre megőrzi a szóközöket. */}
            <div aria-hidden="true" style={{pointerEvents: "none", whiteSpace: "pre"}}
                 className={props.class + " form-control bg-transparent border-0 position-absolute top-0 start-0 w-100"}>
                <span style={{color: "transparent"}}>{value}</span>
                <span style={{opacity: 0.45}}>{completion}</span>
            </div>
            <input value={value} onChange={handleChange} onKeyDown={handleKeyDown} placeholder={props.placeholder}
                   autoComplete="off"
                   className={props.class + " form-control no-focus bg-transparent position-relative"}/>
        </div>
    );
}
