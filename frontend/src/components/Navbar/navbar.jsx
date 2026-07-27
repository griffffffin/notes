import {useState} from "react";
import {useLocation} from "react-router-dom";
import LogoAndCreate from "./logoAndCreate";
import {currentSection} from "./sections";
import {quoteSearchState} from "./quoteSearchState";
import QuoteSearch from "./quoteSearch";
import ColorCategoryAndSignOut from "./colorCategoryAndSignOut";
import Switch from "./switch";
import CategoryAndColorGroup from "../Link/categoryAndColorGroup";

export default function Navbar(props) {
    /* A szín- és kategória-választó a to-do SAJÁTJA (kártyaszín, kategória-szűrés);
       más SZEKCIÓBAN — pl. idézetek — nincs értelme, ezért csak a to-do útjain
       jelenik meg. (A "kategória" itt a to-do belső, elemekre vonatkozó mezője; a
       "szekció" a felső szint — l. sectionSwitcher.jsx.) A kijelentkezés-ikon és a
       téma-váltó mindenhol marad. A useLocation itt működik: a Navbar a Routeren
       BELÜL renderelődik. */
    const pathname = useLocation().pathname;
    const isTodo = currentSection(pathname).path === "/to-do";
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
    const handleColorClick = () => {
        props.setIsColorClicked(!props.isColorClicked);
        props.setIsCategoryClicked(false);
    };

    const handleCategoryClick = () => {
        props.setIsCategoryClicked(!props.isCategoryClicked);
        props.setIsColorClicked(false);
    };

    return (
        <nav className="navbar navbar-black bg-transparent pb-0">
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
                                       handleCategoryClick={handleCategoryClick}
                                       isColorClicked={props.isColorClicked}
                                       handleColorClick={handleColorClick}/>}
        </nav>
    );
}
