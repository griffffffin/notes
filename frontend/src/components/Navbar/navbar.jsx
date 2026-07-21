import {useLocation} from "react-router-dom";
import LogoAndCreate from "./logoAndCreate";
import {currentCategory} from "./categorySwitcher";
import ColorCategoryAndSignOut from "./colorCategoryAndSignOut";
import Switch from "./switch";
import CategoryAndColorGroup from "../Link/categoryAndColorGroup";

export default function Navbar(props) {
    /* A szín- és kategória-választó a to-do SAJÁTJA (kártyaszín, kategória-szűrés);
       más kategóriában — pl. idézetek — nincs értelme, ezért csak a to-do útjain
       jelenik meg. A kijelentkezés-ikon és a téma-váltó viszont mindenhol marad.
       A useLocation itt működik: a Navbar a Routeren BELÜL renderelődik. */
    const isTodo = currentCategory(useLocation().pathname).path === "/to-do";
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
            <div className="container-fluid ms-2 me-1">
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
                              <div className="display-5 logo invisible">&nbsp;</div>
                          </div>
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
