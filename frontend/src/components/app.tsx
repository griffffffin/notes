import {useCallback, useEffect, useRef, useState} from "react";
import {library} from "@fortawesome/fontawesome-svg-core";
import {
    faAngleDown, faAngleUp, faBars, faFill, faFillDrip,
    faPaintRoller, faPlus, faRightFromBracket, faRotate,
} from "@fortawesome/free-solid-svg-icons";
import Routes from "./routes";
import {useAuth} from "../contexts/auth-context";
import {ENDPOINTS} from "../endpoints";
import {logRequestError} from "../log";
import {categoryListSchema} from "../types/api";
import type {Todo} from "../types/api";
import {parseResponse} from "../contractFault";
import Spinner from "./spinner";

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
   (kijelentkezés), rotate (a kategória-lekérés újraindítása). */
library.add(faAngleDown, faAngleUp, faBars, faFill, faFillDrip, faPaintRoller, faPlus,
    faRightFromBracket, faRotate);

export default function App() {
    const [isColorAngleClicked, setIsColorAngleClicked] = useState(false);
    const [isCategoryAngleClicked, setIsCategoryAngleClicked] = useState(false);
    // A to-do kategórialista (a kimondott típus a `useState([])` `never[]`-jét
    // váltja ki). A `Todo["category"]` a to-do saját, elemekre vonatkozó mezője —
    // ugyanaz a típus, amit a lenti Routes→Navbar lánc kategóriaként vár.
    /* FUT-E ÉPP MENTÉS a szerkesztőben. Itt él, mert a szerkesztő írja, a navbar
       olvassa, és az App a legszűkebb közös ősük (l. RoutesProps). */
    const [isSaving, setIsSaving] = useState(false);
    const [categories, setCategories] = useState<Todo["category"][]>([]);
    /* A kategória-lekérés ELBUKOTT-e. Külön a listától: hiba után a KORÁBBI lista
       marad (egy pillanattal ezelőtti valóság, általában igaz), de a felhasználót
       meg kell tudni figyelmeztetni — az első betöltésnél az üres lista különben
       azt állítaná, hogy nincs egyetlen kategóriája sem. */
    const [categoriesFailed, setCategoriesFailed] = useState(false);
    /* FUT-E ÉPPEN kategória-lekérés. A hibajelzés melletti újratöltő ikon ebből
       tudja, hogy pörögnie kell — enélkül egy ISMÉTELTEN elbukó próbálkozás
       teljesen néma volna: az üzenet már ott van, tehát semmi nem változna, és a
       gomb halottnak látszana. Nem a gomb saját állapota, mert a lekérést öt hely
       indíthatja (l. lentebb), és mindegyikre igazat kell mondania. */
    const [categoriesLoading, setCategoriesLoading] = useState(false);
    const {isLoggedIn, isLoggingOut, handleAxios} = useAuth();

    const handleLinkClicked = useCallback(() => {
        setIsColorAngleClicked(false);
        setIsCategoryAngleClicked(false);
    }, []);

    /* Versenyhelyzet-őr — de NEM a betöltő effektek `active` zászlójával, mert ez a
       lekérés nem EGY effekthez tartozik: ÖT helyről indulhat (a lenti mount-effekt,
       a to-do törlése, és a szerkesztő három mentési útja). Közös cleanup tehát
       nincs, amire a zászlót fel lehetne fűzni. Helyette SORSZÁM: minden hívás
       kiváltja a következőt, és a válasz csak akkor írhat, ha ő a legutóbbi.

       Amit megelőz: mentesz egy to-dót ÚJ kategóriával (a válasz már tartalmazza),
       de a lassabb, korábbi lekérés válasza utána fut be a RÉGI listával — az új
       kategória némán eltűnik a legördülőből, a következő lekérésig. */
    const latestCategoryRequest = useRef(0);

    const handleCategoryChange = useCallback(() => {
        /* A léptetés a kijelentkezés-ág ELŐTT van: a kilépés is érvénytelenítse a
           még függőben lévő kérést, különben annak válasza a kilépés UTÁN írna
           kategórialistát. */
        const requestId = ++latestCategoryRequest.current;
        // Kijelentkezve nincs mit lekérni — enélkül a bejelentkező képernyőn is
        // elindulna egy kérés, ami 401-gyel bukna.
        if (!isLoggedIn) return;
        setCategoriesLoading(true);
        handleAxios(ENDPOINTS.todoCategories, {},
            (response) => {
                /* A séma ELŐBB fut, mint az őr-vizsgálat sorrendjében bármi más:
                   ha a válasz nem kategórianevek tömbje, a v.parse dob, és a hiba
                   a catchError-ba (logRequestError) fut — a legördülő inkább
                   marad a régi listával, mint hogy értelmezhetetlen adatot vegyen
                   át. */
                const categories = parseResponse(categoryListSchema, response.data, ENDPOINTS.todoCategories);
                if (requestId !== latestCategoryRequest.current) return;
                setCategories(categories);
                setCategoriesFailed(false);
                setCategoriesLoading(false);
            },
            (error) => {
                logRequestError(error);
                /* A séma bukása is IDE fut (a parseResponse a `then`-ben dob, azt a
                   handleAxios `.catch`-e kapja el) — tehát a jelző ott sem ragad be. */
                if (requestId === latestCategoryRequest.current) {
                    setCategoriesFailed(true);
                    setCategoriesLoading(false);
                }
            });
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
            {/* A KIJELENTKEZÉS MENTÉSE közben karika — de csak akkor, ha a
                várakozás ÉRZÉKELHETŐ (a jelző 300 ms után gyullad ki, l.
                contexts/auth.tsx). A tartalom helyén jelenik meg, mert ilyenkor a
                szerkesztőben nem érdemes tovább gépelni: a munkamenet zárul. */}
            {isLoggingOut && <Spinner class="min-vh-75"/>}
            {!isLoggingOut &&
            <Routes handleLinkClicked={handleLinkClicked}
                    setIsColorAngleClicked={setIsColorAngleClicked} isColorAngleClicked={isColorAngleClicked}
                    setIsCategoryAngleClicked={setIsCategoryAngleClicked}
                    isCategoryAngleClicked={isCategoryAngleClicked}
                    categories={categories} categoriesFailed={categoriesFailed}
                    categoriesLoading={categoriesLoading}
                    handleCategoryChange={handleCategoryChange}
                    isSaving={isSaving} setIsSaving={setIsSaving}/>}
        </div>
    );
}
