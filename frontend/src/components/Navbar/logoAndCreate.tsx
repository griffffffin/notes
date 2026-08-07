import {Link, useLocation} from "react-router-dom";
import SectionSwitcher from "./sectionSwitcher";
import {currentSection} from "./sections";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {useTheme} from "../../contexts/theme-context";

type LogoAndCreateProps = {
    /* Be van-e lépve a felhasználó. Két dolgot dönt el: kap-e a logó
       kattintás-kezelőt, és megjelenik-e mellette a "+". */
    isVisible: boolean;
    isCreateVisible: boolean;
    /* Navigáló kattintáskor futtatandó takarítás (a navbar legördülőinek
       becsukása). Eseményt nem használ, ezért paraméter nélküli. */
    handleLinkClicked: () => void;
};

export default function LogoAndCreate(props: LogoAndCreateProps) {
    const {color} = useTheme();
    const location = useLocation();

    return (
        <div className="d-grid pb-1">
            <div className="input-group align-items-center">
                {/* `isVisible ? kezelő : undefined`, és NEM `isVisible && kezelő`:
                    az `&&` hamis ágon `false`-t adna át kattintás-kezelőnek, amire a
                    React külön hibát is naplóz dev módban ("Expected onClick listener
                    to be a function, instead got `false`"). Eddig némán elment,
                    mert a JavaScript nem nézte meg — a típus most kimondja: itt
                    vagy függvény van, vagy semmi. */}
                <SectionSwitcher onClick={props.isVisible ? props.handleLinkClicked : undefined}/>
                {props.isCreateVisible &&
                    /* Link, és nem kattintás-kezelős ikon: a "+" egy OLDALRA visz
                       (/create), nem műveletet végez — ahogy mellette a logó is
                       linkként visz a főoldalra. Így jár az állapotsori cím, a
                       középső gombos "új lapon megnyitás" és a jobb gombos menü,
                       a képernyőolvasó pedig linkként hirdeti ki. A kézzel adott
                       role="button" épp ezért marad el: azt a linkség ingyen
                       hozza, ráadásul gombnak hazudná a célpontot.

                       A kódban maradó navigate() hívások (mentés, törlés, belépés
                       után a főoldalra) jogosan kéziek: azok egy MŰVELET
                       eredményei, nem célpontok — linkként hamis ígéret lenne
                       rájuk kattintani. */
                    <Link to={currentSection(location.pathname).path + "/create"}
                          onClick={props.handleLinkClicked} className="no-focus">
                        {/* A logó és a "+" távolsága: <576px-en a ps-3 (1rem) — ez jó.
                            A töréspont (≥576px) fölött korábban egy plusz ms-sm-3 (1rem)
                            is jött, összesen 2rem; ezt felezzük (az ms-sm-3-at elvéve),
                            így ≥576px-en is 1rem marad a távolság. */}
                        <FontAwesomeIcon className={"create-plus pt-1 ps-3 text-" + color}
                                         icon={["fas", "plus"]} size="xl"/>
                    </Link>
                }
            </div>
        </div>
    );
}
