import {useState} from "react";
import {useLocation} from "react-router-dom";
import LogoAndCreate from "./logoAndCreate";
import {currentSection} from "./sections";
import {quoteSearchState} from "./quoteSearchState";
import QuoteSearch from "./quoteSearch";
import ColorCategoryAndSignOut from "./colorCategoryAndSignOut";
import Switch from "./switch";
import CategoryAndColorGroup, {type CategoryAndColorGroupProps} from "../Link/categoryAndColorGroup";
import {PATHS} from "../../paths";

/* A navbar KÉT alakja diszkriminált unió az `isVisible`-en. Kijelentkezve (pl.
   megosztott idézet nézete) a navbar szinte üres: csak a téma-váltó marad, a
   vezérlő-propoknak nincs értelmük — ezért az `isVisible: false` ág NEM is kéri
   őket. Bejelentkezve mind a hat vezérlő KÖTELEZŐ. Így a hívó (routes.tsx) a
   kijelentkezett navbart egyetlen `isVisible={false}`-szal hívhatja, a
   bejelentkezettet viszont csak a teljes készlettel — se többet, se kevesebbet.
   (A JSX-ben a `props.isVisible ? / &&` ágak a fordítónak is szűkítenek a
   bejelentkezett alakra, ezért a vezérlő-propok ott gond nélkül elérhetők.) */
export type NavbarProps =
    | {isVisible: false}
    | {
        isVisible: true;
        handleLinkClicked: () => void;
        /* A szín- és kategória-legördülő NYITOTTSÁGA a hívónál (app) él, mert a
           lista-nézetnek is tudnia kell róla — a navbar csak billenti. */
        isColorClicked: boolean;
        setIsColorClicked: (isClicked: boolean) => void;
        isCategoryClicked: boolean;
        setIsCategoryClicked: (isClicked: boolean) => void;
        categories: CategoryAndColorGroupProps["categories"];
        categoriesFailed: CategoryAndColorGroupProps["categoriesFailed"];
        categoriesLoading: CategoryAndColorGroupProps["categoriesLoading"];
        onRetryCategories: CategoryAndColorGroupProps["onRetryCategories"];
        /* VISZNEK-E MOST VALAHOVA A LINKEK. Csak a kinézetet érinti: ha nem, a
           navbar LINKJEI a normál egérmutatót kapják a mutató kéz helyett — a
           felület ELŐRE megmondja, hogy a kattintás nem visz sehova.

           KÉT ÁLLAPOT hajtja, és ezért nem `isSaving` a neve (az volt korábban):
           mentés közben a blocker nyeli el a navigációt, KIJELENTKEZÉS közben
           pedig a lap maga megy el. Az összevonás az App-ban történik, ott van
           mindkét érték. A kijelentkezés a fontosabb eset, és nem is ritka: a
           kijelentkezés-karika csak 300 ms után gyullad ki (addig a navbar
           látszik), egészséges mentésnél viszont az egész századmásodpercek alatt
           lefut — vagyis a TIPIKUS kijelentkezésnél a karika meg sem jelenik, és a
           navbar végig ott van, kézzel a linkjein.

           A kijelentkezett ágon nincs értelme (ott nincs se szerkesztő, se
           kijelentkezés), ezért csak az isVisible: true ágon szerepel. */
        isNavigationBlocked: boolean;
    };

export default function Navbar(props: NavbarProps) {
    /* A szín- és kategória-választó a to-do SAJÁTJA (kártyaszín, kategória-szűrés);
       más SZEKCIÓBAN — pl. idézetek — nincs értelme, ezért csak a to-do útjain
       jelenik meg. (A "kategória" itt a to-do belső, elemekre vonatkozó mezője; a
       "szekció" a felső szint — l. sectionSwitcher.tsx.) A kijelentkezés-ikon és a
       téma-váltó mindenhol marad. A useLocation itt működik: a Navbar a Routeren
       BELÜL renderelődik. */
    const pathname = useLocation().pathname;
    const isTodo = currentSection(pathname).path === PATHS.todos;
    /* A kereső CSAK a Quotes read-oldalain (lista, szerző-szűrt, találat) jelenik
       meg, és a mező kezdőértékét is az URL adja — l. quoteSearchState. */
    const search = quoteSearchState(pathname);
    /* Fókuszban van-e a kereső. Mobilon ekkor a sáv átveszi a navbart (a többi elem
       elrejtve) — a CSS a container-fluidra tett .quote-search-focused osztályból
       dolgozik (l. index.css). A `search.show &&` őr azért kell, hogy egy esetleges
       bennragadt fókusz-állapot ne rejtse el a navbart ott, ahol nincs is kereső. */
    const [searchFocused, setSearchFocused] = useState(false);
    /* Nincs useCallback: ezek sima onClick-ekre mennek, memózatlan komponensekre —
       a memózásnak nem lenne fogyasztója. (Ráadásul a régi [props] függőség
       hatástalan volt: a props objektum minden rendernél új.) */
    /* Az `isVisible` őr a fordítónak szűkít a bejelentkezett alakra (a vezérlő-
       propok csak ott léteznek). Futásidőben nem elérhető ág: ezek a handlerek
       csak a bejelentkezett navbar gyerekeiből (ColorCategoryAndSignOut,
       CategoryAndColorGroup) hívódnak, amik maguk is csak `isVisible` mellett
       renderelnek — az őr a típus-invariánst teszi explicitté. */
    const handleColorClick = () => {
        if (!props.isVisible) return;
        props.setIsColorClicked(!props.isColorClicked);
        props.setIsCategoryClicked(false);
    };

    const handleCategoryClick = () => {
        if (!props.isVisible) return;
        props.setIsCategoryClicked(!props.isCategoryClicked);
        props.setIsColorClicked(false);
    };

    /* A `navbar-blocked` osztály CSAK az egérmutatót állítja át a navbar LINKJEIN
       (index.css) — a téma-kapcsolót és a kijelentkezést nem érinti, mert azok
       mentés közben is tényleg működnek. A `props.isVisible &&` azért kell, mert a
       kijelentkezett ág propjai közt nincs ilyen mező: a union-típus itt még nincs
       szűkítve. */
    const navClass = "navbar navbar-black bg-transparent pb-0"
        + (props.isVisible && props.isNavigationBlocked ? " navbar-blocked" : "");

    return (
        <nav className={navClass}>
            {/* position-relative: a kereső ehhez képest kerül ABSZOLÚT középre
                (start-50 + translate-middle), így pontosan a navbar közepén ül,
                függetlenül a bal (logó+"+") és jobb (kijelentkezés+kapcsoló) blokk
                eltérő szélességétől — nem a "maradék hely" közepén. Kifolyáskor a
                bal/jobb blokkot nem tolja, mert kikerül a flex-folyamból. */}
            <div className={"container-fluid ms-2 me-1 position-relative" +
                            (props.isVisible && search.show && searchFocused ? " quote-search-focused" : "")}>
                {/* Kijelentkezve (pl. megosztott idézet nézete) nincs kategória-
                    felirat és "+", DE a logó HELYÉT fenntartjuk egy láthatatlan
                    logóval (invisible = visibility:hidden, a magasságot megtartja).
                    Így a navbar sor magassága ugyanaz, és a téma-váltó PONTOSAN
                    ugyanott áll — vízszintesen és függőlegesen is —, mint
                    bejelentkezve; nem ugrik feljebb/balra. */}
                {props.isVisible
                    ? <LogoAndCreate handleLinkClicked={props.handleLinkClicked} isVisible={props.isVisible}
                                     isCreateVisible={props.isVisible}/>
                    : <div className="d-grid pb-1" aria-hidden="true">
                          <div className="input-group align-items-center">
                              {/* A magasságot az igazi logó font-osztályai (display-5 logo)
                                  adják — ha az igazi logó mérete változik, ITT is kövesd,
                                  különben a téma-váltó függőlegesen elcsúszik. */}
                              <div className="display-5 logo invisible">&nbsp;</div>
                          </div>
                      </div>}
                {/* A kereső abszolút középen (l. a container-fluid position-relative
                    kommentjét). Bejelentkezve, csak a Quotes read-oldalain. */}
                {props.isVisible && search.show &&
                    /* A pill-keretet a WRAPPER viseli (rounded-pill border-2
                       border-theme), nem a belső input: az input .no-focus-a a
                       keretet átlátszóra állítaná. Ez a kártyák bevált téma-keret-
                       mintája, egy sima divon. */
                    <div className={"position-absolute top-50 start-50 translate-middle quote-search " +
                                    "rounded-pill border border-2 border-theme"}>
                        <QuoteSearch initialTerm={search.term} handleLinkClicked={props.handleLinkClicked}
                                     onFocusChange={setSearchFocused}/>
                    </div>}
                <div className="d-grid ms-auto">
                    <div className="input-group align-items-center">
                        {props.isVisible &&
                            <ColorCategoryAndSignOut handleLinkClicked={props.handleLinkClicked}
                                                     handleColorClick={handleColorClick}
                                                     isColorClicked={props.isColorClicked}
                                                     handleCategoryClick={handleCategoryClick}
                                                     isCategoryClicked={props.isCategoryClicked}
                                                     showColorCategory={isTodo}/>}
                        <Switch/>
                    </div>
                </div>
            </div>
            {props.isVisible && isTodo &&
                <CategoryAndColorGroup isCategoryClicked={props.isCategoryClicked}
                                       categories={props.categories}
                                       categoriesFailed={props.categoriesFailed}
                                       categoriesLoading={props.categoriesLoading}
                                       onRetryCategories={props.onRetryCategories}
                                       handleCategoryClick={handleCategoryClick}
                                       isColorClicked={props.isColorClicked}
                                       handleColorClick={handleColorClick}/>}
        </nav>
    );
}
