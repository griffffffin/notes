import {useCallback, useEffect, useState} from "react";
import {library} from "@fortawesome/fontawesome-svg-core";
import {
    faAngleDown, faAngleUp, faBars, faFill, faFillDrip,
    faPaintRoller, faPlus, faRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import Routes from "./routes";
import {useAuth} from "../contexts/auth-context";
import {logRequestError} from "../log";
import type {Todo} from "../types/api";

/* CSAK a ténylegesen használt ikonokat regisztráljuk, nem a teljes `fas`
   készletet (~1600 ikon). A régi `library.add(fas)` mindet a bundle-be húzta,
   mert egy egészben átadott objektumból a tree-shaking nem tudja kiszűrni a
   használatlant. Nevesített importoknál a Rollup pontosan látja, mi kell.

   FONTOS: ha új ikont kezdesz használni a kódban (icon={["fas", "…"]}), ide
   is fel KELL venni, különben némán üresen jelenik meg. (Az ikon-hivatkozás
   alakja a TÍPUS miatt [prefix, név] tömb, nem a "fa-solid fa-…" osztálynév-
   szöveg: a FontAwesome futásideje mindkettőt érti, de csak a tömbösnél
   ellenőrzött az ikon NEVE — az elgépelt névre így fordítási hiba jön, nem
   üres hely a felületen.) A használt ikonok:
   angle-down/up (nyilak), bars (húzófogantyú), fill + fill-drip (színválasztó
   zárt/nyitott), paint-roller (téma), plus (hozzáadás), right-from-bracket
   (kijelentkezés). */
library.add(faAngleDown, faAngleUp, faBars, faFill, faFillDrip, faPaintRoller, faPlus, faRightFromBracket);

export default function App() {
    const [isColorAngleClicked, setIsColorAngleClicked] = useState(false);
    const [isCategoryAngleClicked, setIsCategoryAngleClicked] = useState(false);
    // A to-do kategórialista (a kimondott típus a `useState([])` `never[]`-jét
    // váltja ki). A `Todo["category"]` a to-do saját, elemekre vonatkozó mezője —
    // ugyanaz a típus, amit a lenti Routes→Navbar lánc kategóriaként vár.
    const [categories, setCategories] = useState<Todo["category"][]>([]);
    const {isLoggedIn, handleAxios} = useAuth();

    const handleLinkClicked = useCallback(() => {
        setIsColorAngleClicked(false);
        setIsCategoryAngleClicked(false);
    }, []);

    const handleCategoryChange = useCallback(() => {
        // Kijelentkezve nincs mit lekérni — enélkül a bejelentkező képernyőn is
        // elindulna egy kérés, ami 401-gyel bukna.
        if (!isLoggedIn) return;
        handleAxios<Todo["category"][]>("/to-dos/categories", {}, (response) => setCategories(response.data),
            logRequestError);
    }, [isLoggedIn, handleAxios]);

    useEffect(() => {
        handleCategoryChange();
    }, [handleCategoryChange]);

    /* Nincs betöltő-állapot: a bejelentkezés a sütiből azonnal tudható, a téma
       pedig a ThemeProviderből jön — nincs mire várni.

       min-vh-100: a lapváz töltse ki a képernyőt, különben rövid tartalomnál a
       háttere alatt kilátszana a html háttere (témaváltáskor csíkként). Ez
       SZÁNDÉKOSAN külön osztály a bg-theme-page mellett: azt a törlés-modal is
       használja a hátteréért, és annak nem kell képernyőnyi magasság. */
    return (
        <div className="container-fluid px-0 bg-theme-page min-vh-100">
            <Routes handleLinkClicked={handleLinkClicked}
                    setIsColorAngleClicked={setIsColorAngleClicked} isColorAngleClicked={isColorAngleClicked}
                    setIsCategoryAngleClicked={setIsCategoryAngleClicked}
                    isCategoryAngleClicked={isCategoryAngleClicked}
                    categories={categories} handleCategoryChange={handleCategoryChange}/>
        </div>
    );
}
